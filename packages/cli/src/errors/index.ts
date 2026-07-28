export type { DxCatalogEntry, DxError, DxErrorCode } from "./types.js";
export { DX_CATALOG, catalogEntry } from "./catalog.js";
export {
  createDxError,
  nextDiagnosticId,
  renderDxError,
  resetDiagnosticIds,
  type RenderOptions,
} from "./render.js";
