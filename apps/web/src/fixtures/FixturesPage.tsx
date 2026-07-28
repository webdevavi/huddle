import type { ReactNode } from "react";

export function StateBlock({
  kind,
  title,
  children,
}: {
  kind: "loading" | "empty" | "error" | "success" | "degraded";
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      className="state-block"
      data-kind={kind === "error" ? "error" : undefined}
      data-state={kind}
    >
      <strong>{title}</strong>
      <div>{children}</div>
    </div>
  );
}

export const FIXTURE_STATES = [
  {
    id: "room-loading",
    feature: "Room shell",
    kind: "loading" as const,
    title: "Loading",
    body: "Skeleton retains known room/repo identity while history loads.",
  },
  {
    id: "room-empty",
    feature: "Room shell",
    kind: "empty" as const,
    title: "Empty",
    body: "Host has not connected; waiting_for_runner with next-step explanation.",
  },
  {
    id: "room-error",
    feature: "Room shell",
    kind: "error" as const,
    title: "Error",
    body: "Diagnostic reference and valid retry/exit. AUTHZ_PERMISSION_DENIED.",
  },
  {
    id: "room-success",
    feature: "Room shell",
    kind: "success" as const,
    title: "Success",
    body: "Active room with ordered timeline and live connection.",
  },
  {
    id: "room-degraded",
    feature: "Room shell",
    kind: "degraded" as const,
    title: "Degraded",
    body: "reconnecting — readable degraded mode with retry affordance.",
  },
  {
    id: "timeline-empty",
    feature: "Timeline",
    kind: "empty" as const,
    title: "Empty",
    body: "Agent has not started plus permitted primary action.",
  },
  {
    id: "composer-degraded",
    feature: "Composer",
    kind: "degraded" as const,
    title: "Degraded",
    body: "Comment/suggest allowed while queue/steer disabled offline.",
  },
  {
    id: "approval-success",
    feature: "Approval",
    kind: "success" as const,
    title: "Success",
    body: "Evidence-first allow/deny with immutable receipt after resolve.",
  },
  {
    id: "driver-loading",
    feature: "Driver",
    kind: "loading" as const,
    title: "Loading",
    body: "Lease state loading before request/handoff controls enable.",
  },
  {
    id: "inspector-empty",
    feature: "Inspector",
    kind: "empty" as const,
    title: "Empty",
    body: "Explain how to select an event.",
  },
] as const;

export function FixturesPage({ onOpenRoom }: { onOpenRoom: (seed: string) => void }) {
  return (
    <main className="fixtures-page">
      <p className="brand-mark">Huddle</p>
      <h1>UI state fixtures</h1>
      <p>Canonical loading / empty / error / success / degraded samples for room UI.</p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
        {(["active", "empty", "error", "degraded", "approval", "reconnect"] as const).map(
          (seed) => (
            <button key={seed} type="button" className="btn" onClick={() => onOpenRoom(seed)}>
              Open {seed} room
            </button>
          ),
        )}
      </div>

      <div className="fixtures-grid">
        {FIXTURE_STATES.map((fixture) => (
          <section key={fixture.id} className="fixture-panel" aria-labelledby={fixture.id}>
            <h2 className="fixture-panel__title" id={fixture.id}>
              {fixture.feature} · {fixture.title}
            </h2>
            <div className="fixture-panel__body">
              <StateBlock kind={fixture.kind} title={fixture.kind}>
                {fixture.body}
              </StateBlock>
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
