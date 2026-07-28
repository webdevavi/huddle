export type TransitionResult<T> =
  | { ok: true; state: T; changed: boolean }
  | { ok: false; reason: "invalid_transition" | "terminal"; state: T };

export function allow<T>(state: T, changed = true): TransitionResult<T> {
  return { ok: true, state, changed };
}

export function rejectTerminal<T>(state: T): TransitionResult<T> {
  return { ok: false, reason: "terminal", state };
}

export function rejectInvalid<T>(state: T): TransitionResult<T> {
  return { ok: false, reason: "invalid_transition", state };
}
