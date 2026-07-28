import { useEffect, useMemo, useReducer, useState } from "react";
import type { ControlPlaneClient } from "../client/types.js";
import { Composer } from "../composer/Composer.js";
import { Inspector } from "../inspector/Inspector.js";
import {
  composerModesFor,
  initialRoomViewState,
  roomViewReducer,
  selectedEvent,
} from "../state/roomView.js";
import { Timeline } from "../timeline/Timeline.js";
import { ReconnectBar } from "./ReconnectBar.js";
import { StatusStrip } from "./StatusStrip.js";
import { UrgentBanner } from "./UrgentBanner.js";

const DRAFT_KEY = "huddle.composer.draft";

export function RoomShell({ client, roomId }: { client: ControlPlaneClient; roomId: string }) {
  const [state, dispatch] = useReducer(roomViewReducer, undefined, initialRoomViewState);
  const [statusMessage, setStatusMessage] = useState<string | undefined>();

  useEffect(() => {
    const saved = sessionStorage.getItem(DRAFT_KEY);
    if (saved) dispatch({ type: "set_draft", draft: saved });
  }, []);

  useEffect(() => {
    sessionStorage.setItem(DRAFT_KEY, state.draft);
  }, [state.draft]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};

    async function load() {
      dispatch({ type: "load_start" });
      try {
        const [session, room] = await Promise.all([client.getSession(), client.getRoom(roomId)]);
        if (cancelled) return;
        dispatch({ type: "load_success", room, session });
        unsubscribe = client.subscribe(roomId, room.lastSequence, {
          onEvent: (event) => dispatch({ type: "event", event }),
          onConnection: (status) => dispatch({ type: "connection", status }),
        });
      } catch (err) {
        if (cancelled) return;
        dispatch({
          type: "load_error",
          message: err instanceof Error ? err.message : "Failed to load room",
        });
      }
    }

    void load();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [client, roomId]);

  const isDriver = state.session?.memberId === state.room?.driver.memberId;
  const modes = useMemo(
    () => composerModesFor(state.session?.role, Boolean(isDriver), state.connection),
    [state.session?.role, isDriver, state.connection],
  );

  const event = selectedEvent(state);

  async function refreshRoom() {
    const room = await client.getRoom(roomId);
    dispatch({ type: "patch_room", room });
  }

  async function onSubmit() {
    const result = await client.submitInput(roomId, {
      mode: state.mode,
      text: state.draft.trim(),
      clientMutationId: `mut_${Date.now()}`,
    });
    if (result.ok) {
      dispatch({ type: "set_draft", draft: "" });
      setStatusMessage(`${state.mode} sent`);
      await refreshRoom();
    } else {
      setStatusMessage(result.message);
    }
  }

  async function onRequestDriver() {
    const result = await client.requestDriver(roomId);
    setStatusMessage(result.ok ? "Driver requested" : result.message);
    await refreshRoom();
  }

  async function onResolveApproval(approvalId: string, decision: "allow" | "deny") {
    const pending = state.room?.pendingApprovals.find((a) => a.approvalId === approvalId);
    if (!pending) return;
    const result = await client.resolveApproval(roomId, {
      approvalId,
      decision,
      evidenceDigest: pending.evidenceDigest,
    });
    setStatusMessage(result.ok ? `Approval ${decision}` : result.message);
    await refreshRoom();
  }

  async function onHandoff(memberId: string) {
    const result = await client.handoffDriver(roomId, memberId);
    setStatusMessage(result.ok ? "Driver changed" : result.message);
    await refreshRoom();
  }

  async function onRetryConnection() {
    client.simulateReconnect?.(roomId);
    await refreshRoom();
  }

  if (state.phase === "error") {
    return (
      <div className="app-frame">
        <div className="state-block" data-kind="error" role="alert">
          {state.errorMessage}
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn"
              onClick={() => {
                dispatch({ type: "load_start" });
                void client.getRoom(roomId).then(
                  (room) =>
                    void client
                      .getSession()
                      .then((session) => dispatch({ type: "load_success", room, session })),
                  (err: unknown) =>
                    dispatch({
                      type: "load_error",
                      message: err instanceof Error ? err.message : "Retry failed",
                    }),
                );
              }}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!state.room || state.phase === "loading") {
    return (
      <div className="app-frame">
        <div className="state-block" aria-busy="true">
          Loading room shell…
        </div>
      </div>
    );
  }

  const showPeople = state.mobileSurface === "people";

  return (
    <div className="app-frame" data-density="comfortable">
      <a className="skip-link" href="#timeline-main">
        Skip to timeline
      </a>
      <StatusStrip room={state.room} connection={state.connection} />
      <ReconnectBar connection={state.connection} onRetry={() => void onRetryConnection()} />
      <UrgentBanner
        room={state.room}
        onOpenApproval={(id) => {
          const evt = state.room?.events.find(
            (e) =>
              e.type === "approval.requested" &&
              (e.payload as { approvalId: string }).approvalId === id,
          );
          dispatch({ type: "select_event", eventId: evt?.eventId ?? null });
          if (!evt) dispatch({ type: "set_inspector_open", open: true });
        }}
        onOpenDriver={() => dispatch({ type: "set_inspector_open", open: true })}
      />

      <div className="room-layout" data-inspector={state.inspectorOpen ? "open" : "collapsed"}>
        {showPeople ? (
          <section className="timeline-pane" aria-label="People and policy">
            <div className="timeline-scroll">
              <h2>People</h2>
              <ul>
                {state.room.members.map((m) => (
                  <li key={m.memberId}>
                    {m.displayName} · {m.role}
                    {state.room?.driver.memberId === m.memberId ? " · driver" : ""}
                  </li>
                ))}
              </ul>
              <h2>Policy</h2>
              <p>{state.room.policySummary}</p>
              <p className="event-row__meta">Retention until {state.room.retentionUntil}</p>
            </div>
          </section>
        ) : (
          <Timeline
            events={state.room.events}
            selectedEventId={state.selectedEventId}
            bufferedCount={state.bufferedCount}
            phase={state.phase === "degraded" ? "success" : state.phase}
            onSelect={(eventId) => dispatch({ type: "select_event", eventId })}
            onJumpLive={() => {
              dispatch({ type: "flush_buffer" });
              void refreshRoom();
            }}
          />
        )}

        <Inspector
          open={state.inspectorOpen || state.mobileSurface === "inspect"}
          event={event}
          room={state.room}
          session={state.session}
          onClose={() => dispatch({ type: "set_inspector_open", open: false })}
          onResolveApproval={(id, decision) => void onResolveApproval(id, decision)}
          onHandoff={(id) => void onHandoff(id)}
          onAcceptSuggestion={() => setStatusMessage("Suggestion accepted receipt pending")}
        />

        <Composer
          modes={modes}
          mode={state.mode}
          draft={state.draft}
          disabled={state.connection === "connecting"}
          {...(statusMessage ? { statusMessage } : {})}
          onMode={(mode) => dispatch({ type: "set_mode", mode })}
          onDraft={(draft) => dispatch({ type: "set_draft", draft })}
          onSubmit={() => void onSubmit()}
          onRequestDriver={() => void onRequestDriver()}
          canRequestDriver={Boolean(
            state.session &&
            state.session.role !== "viewer" &&
            state.session.memberId !== state.room.driver.memberId,
          )}
        />
      </div>

      <nav className="mobile-nav" aria-label="Room surfaces">
        {(["timeline", "inspect", "people"] as const).map((surface) => (
          <button
            key={surface}
            type="button"
            aria-current={state.mobileSurface === surface ? "page" : undefined}
            onClick={() => {
              dispatch({ type: "set_mobile_surface", surface });
              if (surface === "inspect") dispatch({ type: "set_inspector_open", open: true });
            }}
          >
            {surface === "timeline" ? "Timeline" : surface === "inspect" ? "Inspect" : "People"}
          </button>
        ))}
      </nav>
    </div>
  );
}
