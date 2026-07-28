import type { RoomEvent } from "@huddle/protocol";
import type { RoomSnapshot, SessionIdentity } from "../client/types.js";

export function Inspector({
  open,
  event,
  room,
  session,
  onClose,
  onResolveApproval,
  onHandoff,
  onAcceptSuggestion,
}: {
  open: boolean;
  event: RoomEvent | null;
  room: RoomSnapshot | null;
  session: SessionIdentity | null;
  onClose: () => void;
  onResolveApproval: (approvalId: string, decision: "allow" | "deny") => void;
  onHandoff: (memberId: string) => void;
  onAcceptSuggestion: (suggestionId: string) => void;
}) {
  const approval =
    event?.type === "approval.requested"
      ? room?.pendingApprovals.find(
          (a) => a.approvalId === (event.payload as { approvalId: string }).approvalId,
        )
      : room?.pendingApprovals[0] && !event
        ? room.pendingApprovals[0]
        : undefined;

  const isOwner = session?.role === "owner";

  return (
    <aside className="inspector" data-open={open ? "true" : "false"} aria-label="Inspector">
      <div className="inspector__header">
        <strong>{event ? "Selected event" : approval ? "Pending approval" : "Inspector"}</strong>
        <button type="button" className="btn" onClick={onClose} aria-label="Close inspector">
          Back
        </button>
      </div>
      <div className="inspector__body">
        {!event && !approval ? (
          <div className="state-block">Select a timeline event to inspect details.</div>
        ) : null}

        {event ? (
          <div>
            <p className="event-row__kind">{event.type}</p>
            <p>
              <strong>{event.actor.displayName ?? event.actor.id}</strong> · sequence{" "}
              {event.sequence}
            </p>
            <pre
              style={{ whiteSpace: "pre-wrap", fontFamily: "var(--hud-font-mono)", fontSize: 13 }}
            >
              {JSON.stringify(event.payload, null, 2)}
            </pre>
            {event.type === "agent.diff_updated" ? (
              <div className="approval-card" aria-label="Diff summary">
                <div className="diff-line-add">addition · files changed</div>
                <div className="diff-line-del">deletion · prior lines removed</div>
                <p>{(event.payload as { summary: string }).summary}</p>
              </div>
            ) : null}
            {event.type === "input.suggested" ? (
              <div className="suggestion-card">
                <p>{(event.payload as { text: string }).text}</p>
                {isOwner ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() =>
                      onAcceptSuggestion((event.payload as { suggestionId: string }).suggestionId)
                    }
                  >
                    Accept suggestion
                  </button>
                ) : (
                  <p className="event-row__meta">Pending driver action</p>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {approval ? (
          <div className="approval-card" aria-label="Approval evidence">
            <p>
              <strong>{approval.category}</strong> approval
            </p>
            <p>{approval.summary}</p>
            <p className="event-row__meta">
              Exact evidence: <code>{approval.evidenceDigest}</code>
            </p>
            <p className="event-row__meta">State: {approval.state}</p>
            <div className="approval-card__actions">
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => onResolveApproval(approval.approvalId, "deny")}
              >
                Decline
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onResolveApproval(approval.approvalId, "allow")}
              >
                Approve
              </button>
            </div>
          </div>
        ) : null}

        {room?.driver.state === "requested" && isOwner ? (
          <div className="approval-card" style={{ marginTop: 16 }}>
            <p>
              <strong>Driver handoff</strong>
            </p>
            <p>A collaborator requested control. Confirm to transfer the lease.</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onHandoff("member_bob")}
            >
              Hand off to Bob
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
