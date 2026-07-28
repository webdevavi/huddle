import type { RoomEvent } from "@huddle/protocol";
import { groupEventsByTurn } from "../state/roomView.js";

function eventSummary(event: RoomEvent): string {
  const p = event.payload as Record<string, unknown>;
  switch (event.type) {
    case "input.queued":
    case "input.steered":
    case "input.commented":
    case "input.suggested":
      return String(p.text ?? "");
    case "agent.plan_updated":
      return String(p.summary ?? "");
    case "agent.command_started":
      return String(p.command ?? "");
    case "agent.command_completed":
      return `exit ${String(p.exitCode ?? "?")}`;
    case "agent.diff_updated":
      return String(p.summary ?? "");
    case "approval.requested":
      return `${String(p.category)} · evidence ${String(p.evidenceDigest)}`;
    case "driver.changed":
      return `Driver → ${String(p.memberId ?? "unassigned")} (v${String(p.leaseVersion)})`;
    case "driver.requested":
      return `Request from ${String(p.memberId)}`;
    case "member.joined":
      return `${String(p.displayName ?? p.memberId)} joined`;
    case "room.created":
      return String(p.name ?? p.slug ?? "Room created");
    default:
      return event.type;
  }
}

export function Timeline({
  events,
  selectedEventId,
  bufferedCount,
  onSelect,
  onJumpLive,
  phase,
}: {
  events: RoomEvent[];
  selectedEventId: string | null;
  bufferedCount: number;
  onSelect: (eventId: string) => void;
  onJumpLive: () => void;
  phase: "loading" | "empty" | "error" | "success" | "degraded";
}) {
  if (phase === "loading") {
    return (
      <div className="state-block" aria-busy="true">
        History loading before live attach…
      </div>
    );
  }

  if (phase === "empty") {
    return (
      <div className="state-block">
        Agent has not started. Use the composer when permitted, or wait for the host runner.
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="state-block" data-kind="error">
        Timeline unavailable. Loaded history is preserved when present; retry from last sequence.
      </div>
    );
  }

  const groups = groupEventsByTurn(events);

  return (
    <div className="timeline-pane">
      <div className="timeline-scroll" id="timeline-main">
        <div className="sr-only" aria-live="polite" aria-atomic="false" id="timeline-live">
          {events.at(-1) ? `Latest: ${events.at(-1)!.type}` : ""}
        </div>
        <ol className="timeline-list" aria-label="Room timeline">
          {groups.map((group) => (
            <li key={group.turnId} className="turn-group">
              <div className="turn-group__title">Turn: {group.title}</div>
              <ol className="timeline-list">
                {group.events.map((event) => (
                  <li key={event.eventId}>
                    <button
                      type="button"
                      className="event-row"
                      data-animate="true"
                      aria-selected={selectedEventId === event.eventId}
                      onClick={() => onSelect(event.eventId)}
                    >
                      <span className="event-row__kind">{event.type}</span>
                      <span className="event-row__body">{eventSummary(event)}</span>
                      <span className="event-row__meta">
                        {event.actor.displayName ?? event.actor.id} · #{event.sequence}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      </div>
      {bufferedCount > 0 ? (
        <button type="button" className="live-edge" onClick={onJumpLive}>
          {bufferedCount} new events
        </button>
      ) : null}
    </div>
  );
}
