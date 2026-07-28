import type { RoomState, RunState } from "@huddle/protocol";
import type { ConnectionStatus, RoomSnapshot } from "../client/types.js";

function roomTone(
  state: RoomState,
  connection: ConnectionStatus,
): "success" | "warning" | "danger" | "offline" {
  if (state === "failed" || connection === "offline")
    return state === "failed" ? "danger" : "offline";
  if (
    state === "reconnecting" ||
    state === "degraded" ||
    connection === "reconnecting" ||
    connection === "catching_up"
  ) {
    return "warning";
  }
  return "success";
}

function runLabel(run: RunState): string {
  switch (run) {
    case "running":
      return "Running";
    case "awaiting_approval":
      return "Awaiting approval";
    case "idle":
      return "Idle";
    case "starting":
      return "Starting";
    case "completed":
      return "Completed";
    case "interrupted":
      return "Interrupted";
    case "failed":
      return "Failed";
  }
}

function connectionLabel(connection: ConnectionStatus): string {
  switch (connection) {
    case "live":
      return "Host online";
    case "connecting":
      return "Connecting";
    case "catching_up":
      return "Catching up";
    case "reconnecting":
      return "reconnecting";
    case "offline":
      return "offline";
  }
}

export function StatusStrip({
  room,
  connection,
}: {
  room: RoomSnapshot;
  connection: ConnectionStatus;
}) {
  const tone = roomTone(room.roomState, connection);
  return (
    <header className="status-strip" aria-label="Room status">
      <div>
        <div className="brand-mark">Huddle</div>
        <div className="status-strip__meta" aria-label="Repository">
          <span>
            {room.repoName} · {room.branch}
          </span>
          <span>{room.policySummary}</span>
        </div>
      </div>
      <div className="status-strip__meta">
        <span className="status-pill" data-tone={tone}>
          {connectionLabel(connection)}
        </span>
        <span className="status-pill" data-tone={room.runState === "failed" ? "danger" : "success"}>
          {runLabel(room.runState)}
        </span>
        <span className="status-pill">Driver: {room.driver.displayName ?? "unassigned"}</span>
        <span className="status-pill">People ({room.members.length})</span>
      </div>
    </header>
  );
}
