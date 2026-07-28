import { useState } from "react";

const TRUST_POINTS = [
  "Execution, provider credentials, Git credentials, and the unredacted repository remain local on the host.",
  "Prompts, selected structured output, diffs, approval evidence, participant identity, and room metadata may be relayed and stored under the shown retention.",
  "Redaction reduces accidental disclosure but is not guaranteed DLP.",
  "Invite links are one-time; identity is required before membership.",
] as const;

export function JoinPage({ onJoin }: { onJoin: () => void }) {
  const [acked, setAcked] = useState(false);

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
      <label style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 44 }}>
        <input type="checkbox" checked={acked} onChange={(e) => setAcked(e.target.checked)} />I
        understand the host/guest data boundary and retention.
      </label>
      <div style={{ marginTop: 16 }}>
        <button type="button" className="btn btn-primary" disabled={!acked} onClick={onJoin}>
          Continue to room
        </button>
      </div>
    </main>
  );
}
