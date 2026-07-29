import type { ControlPlaneDeps } from "../config.js";
import type { WsTicketRecord } from "@huddle/persistence";

const TICKET_TTL_MS = 60_000;

export async function mintWsTicket(
  deps: ControlPlaneDeps,
  input: {
    roomId: string;
    subjectType: "member" | "runner";
    subjectId: string;
  },
): Promise<WsTicketRecord> {
  const now = deps.clock.nowIso();
  const ticket: WsTicketRecord = {
    id: deps.ids.uuid(),
    roomId: input.roomId,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    expiresAt: new Date(deps.clock.nowMs() + TICKET_TTL_MS).toISOString(),
    consumedAt: null,
    createdAt: now,
  };
  await deps.store.createWsTicket(ticket);
  return ticket;
}
