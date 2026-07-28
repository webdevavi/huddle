import type { ComposerMode } from "../client/types.js";
import type { ModeAvailability } from "../state/roomView.js";

const LABELS: Record<ComposerMode, string> = {
  comment: "Comment",
  suggest: "Suggest",
  queue: "Queue",
  steer: "Steer",
};

export function Composer({
  modes,
  mode,
  draft,
  disabled,
  statusMessage,
  onMode,
  onDraft,
  onSubmit,
  onRequestDriver,
  canRequestDriver,
}: {
  modes: ModeAvailability[];
  mode: ComposerMode;
  draft: string;
  disabled: boolean;
  statusMessage?: string;
  onMode: (mode: ComposerMode) => void;
  onDraft: (draft: string) => void;
  onSubmit: () => void;
  onRequestDriver: () => void;
  canRequestDriver: boolean;
}) {
  const active = modes.find((m) => m.mode === mode);
  const modeDisabled = !active?.enabled || disabled;

  return (
    <footer className="composer" aria-label="Composer">
      <div className="mode-selector" role="group" aria-label="Input mode">
        {modes.map((m) => (
          <button
            key={m.mode}
            type="button"
            aria-pressed={mode === m.mode}
            disabled={!m.enabled}
            title={m.reason}
            onClick={() => onMode(m.mode)}
          >
            {LABELS[m.mode]}
          </button>
        ))}
      </div>
      <textarea
        aria-label="Message"
        placeholder={active?.enabled ? `${LABELS[mode]}…` : (active?.reason ?? "Unavailable")}
        value={draft}
        disabled={modeDisabled}
        onChange={(e) => onDraft(e.target.value)}
      />
      <div className="composer__actions">
        {canRequestDriver ? (
          <button type="button" className="btn" onClick={onRequestDriver}>
            Request driver
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-primary"
          disabled={modeDisabled || draft.trim().length === 0}
          onClick={onSubmit}
        >
          Send
        </button>
      </div>
      {statusMessage || (!active?.enabled && active?.reason) ? (
        <div className="event-row__meta" style={{ flexBasis: "100%" }}>
          {statusMessage ?? active?.reason}
        </div>
      ) : null}
    </footer>
  );
}
