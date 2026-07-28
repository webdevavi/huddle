# Huddle Design System

Calm, dense, task-focused developer UI. The timeline is the visual anchor—not a dashboard of cards.

## Principles

1. One primary workspace: the room timeline.
2. Status always includes text or iconography; never color alone.
3. Cards only for atomic actionable objects (approval, suggestion).
4. Motion communicates insertion, state change, or spatial navigation—and respects `prefers-reduced-motion`.
5. No purple gradients, ornamental shadows, bubbly containers, or decorative icon circles.

## Semantic tokens

Defined as CSS custom properties on `:root` (and `[data-density]`).

| Token                   | Role                                     |
| ----------------------- | ---------------------------------------- |
| `--hud-canvas`          | Page background                          |
| `--hud-surface`         | Raised panel / rail                      |
| `--hud-surface-muted`   | Nested / muted surface                   |
| `--hud-text`            | Primary text                             |
| `--hud-text-muted`      | Secondary text                           |
| `--hud-text-subtle`     | Tertiary / meta                          |
| `--hud-border`          | Default border                           |
| `--hud-border-strong`   | Emphasized border                        |
| `--hud-focus`           | Focus ring                               |
| `--hud-accent`          | Single brand accent (actions, selection) |
| `--hud-accent-contrast` | Text on accent                           |
| `--hud-success`         | Success / applied                        |
| `--hud-warning`         | Warning / reconnecting / stale           |
| `--hud-danger`          | Danger / deny / failed                   |
| `--hud-diff-add`        | Diff addition                            |
| `--hud-diff-del`        | Diff deletion                            |
| `--hud-redacted`        | Redacted content                         |
| `--hud-offline`         | Offline / disconnected                   |
| `--hud-radius`          | Default radius (restrained)              |
| `--hud-space-*`         | 4px spacing scale (`1`–`12`)             |
| `--hud-font-ui`         | UI sans (non-default)                    |
| `--hud-font-mono`       | Monospace for code/commands              |
| `--hud-font-size-body`  | Body ≥ 16px                              |
| `--hud-touch`           | Min touch target (44px)                  |

## Typography

- UI: **IBM Plex Sans** (expressive, developer-familiar, not Inter/Roboto/system).
- Mono: **IBM Plex Mono**.
- Body text never below 16px. Dense metadata may use 14px with AA contrast.

## Density

- `data-density="comfortable"` — default; larger row padding.
- `data-density="compact"` — tighter timeline for power users.
- Spacing uses a 4px scale.

## Components (named)

| Name                    | Job                                  |
| ----------------------- | ------------------------------------ |
| Room shell              | Timeline-first layout + status strip |
| Status strip            | Repo, branch, host, run, driver      |
| Urgent banner           | Oldest actionable approval/handoff   |
| Timeline turn/group/row | Narrative scan of durable events     |
| Event disclosure        | Expand raw / nested detail on demand |
| Live-edge control       | `N new events` when not following    |
| Mode selector           | Comment / Suggest / Queue / Steer    |
| Composer                | Persistent permitted input           |
| Inspector               | Selection detail (rail / sheet)      |
| Diff viewer             | File-first, labeled add/del          |
| Approval evidence       | Exact request + allow/deny           |
| Role/capability display | Honest capability copy               |
| Drawer / dialog / toast | Secondary surfaces                   |
| Empty / error states    | Canonical recovery copy              |

## Canonical content terms

Use these labels exactly when reflecting protocol state:

`queued` · `sent` · `steered` · `applied` · `offline` · `reconnecting` · `stale` · `redacted` · `truncated` · `expired` · `revoked`

## Motion

- Insert timeline rows with a short fade/slide (≤180ms).
- Sheet/rail open with spatial slide.
- Streaming indicators pause when `prefers-reduced-motion: reduce`.
- Never steal focus or scroll when the viewer left the live edge.

## Responsive breakpoints

| Width      | Layout                                                  |
| ---------- | ------------------------------------------------------- |
| ≥1200px    | Timeline + inspector rail                               |
| 768–1199px | Timeline + sticky composer; inspector/people as drawers |
| <768px     | One surface; Timeline / Inspect / People nav            |

## Accessibility

- Landmarks: `header`, `main`, `complementary`, `navigation`.
- Skip link to main timeline.
- Visible focus via `--hud-focus`.
- Timeline is a labelled feed/list; live regions announce completed events (throttled), not token deltas.
- Touch targets ≥ 44×44 CSS px. WCAG AA contrast for body and controls.
- Dialogs trap focus; sheets expose close/back.

## Anti-slop

No dashboard-card mosaic, purple-to-indigo themes, warm-cream + terracotta defaults, broadsheet newspaper columns, glow effects, emoji decoration, or motion for polish alone.
