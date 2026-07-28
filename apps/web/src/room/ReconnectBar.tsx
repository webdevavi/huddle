import type { ConnectionStatus } from "../client/types.js";

export function ReconnectBar({
  connection,
  onRetry,
}: {
  connection: ConnectionStatus;
  onRetry: () => void;
}) {
  if (connection === "live" || connection === "connecting") return null;

  const label =
    connection === "catching_up"
      ? "Catching up from last durable sequence…"
      : connection === "reconnecting"
        ? "reconnecting — readable degraded mode"
        : "offline — changes wait for acknowledgement";

  return (
    <div className="reconnect-bar" role="status">
      <span>{label}</span>
      <button type="button" className="btn" onClick={onRetry}>
        Retry connection
      </button>
    </div>
  );
}
