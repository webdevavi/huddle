/**
 * @huddle/web — Vite + React room UI.
 * Application entry is `main.tsx`. This module re-exports shared client types for tests.
 */
export type { ControlPlaneClient, RoomSnapshot, ComposerMode } from "./client/types.js";
export { MockControlPlaneClient } from "./client/MockControlPlaneClient.js";
export {
  roomViewReducer,
  initialRoomViewState,
  composerModesFor,
  groupEventsByTurn,
} from "./state/roomView.js";
