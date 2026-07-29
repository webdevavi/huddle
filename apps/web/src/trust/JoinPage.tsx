import { useEffect, useState } from "react";

const TRUST_POINTS = [
  "Execution, provider credentials, Git credentials, and the unredacted repository remain local on the host.",
  "Prompts, selected structured output, diffs, approval evidence, participant identity, and room metadata may be relayed and stored under the shown retention.",
  "Redaction reduces accidental disclosure but is not guaranteed DLP.",
  "Invite links are one-time; identity is required before membership.",
] as const;

export type JoinPageProps = {
  /** When set, shows a room id field prefilled for live control-plane joins. */
  initialRoomId?: string;
  live?: boolean;
  onJoin: (input: { roomId: string }) => void | Promise<void>;
};

export function JoinPage({ onJoin, initialRoomId = "", live = false }: JoinPageProps) {
  const [acked, setAcked] = useState(false);
  const [roomId, setRoomId] = useState(initialRoomId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialRoomId) setRoomId(initialRoomId);
  }, [initialRoomId]);

  async function continueJoin() {
    setError(null);
    setBusy(true);
    try {
      const target = roomId.trim() || "room_demo";
      await onJoin({ roomId: target });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="join-page" aria-labelledby="join-title">
      <p className="brand-mark">Huddle</p>
      <h1 id="join-title">Join room</h1>
      <p>Review what stays local and what may be stored before exchanging this invite.</p>
      <ul className="trust-list">
        {TRUST_POINTS.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      {live ? (
        <label style={{ display: "block", marginTop: 12 }}>
          <span style={{ display: "block", marginBottom: 4 }}>Room id</span>
          <input
            type="text"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            placeholder="uuid from CLI / share link"
            style={{ width: "100%", minHeight: 44, padding: "8px 12px" }}
          />
        </label>
      ) : null}
      <label style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 44, marginTop: 12 }}>
        <input type="checkbox" checked={acked} onChange={(e) => setAcked(e.target.checked)} />I
        understand the host/guest data boundary and retention.
      </label>
      {error ? (
        <p role="alert" style={{ color: "var(--danger, #b00020)" }}>
          {error}
        </p>
      ) : null}
      <div style={{ marginTop: 16 }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!acked || busy || (live && !roomId.trim())}
          onClick={() => void continueJoin()}
        >
          {busy ? "Joining…" : "Continue to room"}
        </button>
      </div>
    </main>
  );
}
