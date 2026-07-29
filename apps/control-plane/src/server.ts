import { createServer, type Server, type IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import type { ControlPlaneDeps } from "./config.js";
import { createApp } from "./http/app.js";
import { RoomHub, type HubClient } from "./ws/hub.js";

export type StartedServer = {
  deps: ControlPlaneDeps;
  hub: RoomHub;
  server: Server;
  wss: WebSocketServer;
  url: string;
  close: () => Promise<void>;
};

async function visibilityForSubject(
  deps: ControlPlaneDeps,
  roomId: string,
  subjectType: "member" | "runner",
  subjectId: string,
): Promise<Set<string>> {
  if (subjectType === "runner") {
    return new Set(["room", "approvers", "owner"]);
  }
  const member = await deps.store.getMember(roomId, subjectId);
  if (!member || member.removedAt) return new Set();
  if (member.role === "owner") return new Set(["room", "approvers", "owner"]);
  if (member.role === "collaborator") return new Set(["room", "approvers"]);
  return new Set(["room"]);
}

export async function startControlPlane(deps: ControlPlaneDeps): Promise<StartedServer> {
  const hub = new RoomHub(deps);
  const app = createApp(deps, hub);
  const server = createServer((req, res) => {
    void (async () => {
      const host = req.headers.host ?? `${deps.host}:${deps.port}`;
      const url = new URL(req.url ?? "/", `http://${host}`);
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
          for (const v of value) headers.append(key, v);
        } else {
          headers.set(key, value);
        }
      }
      const body =
        req.method === "GET" || req.method === "HEAD"
          ? undefined
          : await readBody(req);
      const init: RequestInit = {
        method: req.method ?? "GET",
        headers,
      };
      if (body) {
        init.body = body;
        // Node fetch requires duplex when a streamed/buffered body is set.
        (init as RequestInit & { duplex?: "half" }).duplex = "half";
      }
      const request = new Request(url, init);
      const response = await app.fetch(request);
      res.statusCode = response.status;
      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });
      const buf = Buffer.from(await response.arrayBuffer());
      res.end(buf);
    })().catch((err) => {
      res.statusCode = 500;
      res.end(err instanceof Error ? err.message : "internal error");
    });
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    void (async () => {
      const host = req.headers.host ?? `${deps.host}:${deps.port}`;
      const url = new URL(req.url ?? "/", `http://${host}`);
      if (url.pathname !== "/v1/ws") {
        socket.destroy();
        return;
      }
      const ticketId = url.searchParams.get("ticket");
      if (!ticketId) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      const ticket = await deps.store.consumeWsTicket(ticketId, deps.clock.nowIso());
      if (!ticket) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req, ticket);
      });
    })().catch(() => {
      socket.destroy();
    });
  });

  wss.on(
    "connection",
    (
      ws: WebSocket,
      _req: IncomingMessage,
      ticket: {
        roomId: string;
        subjectType: "member" | "runner";
        subjectId: string;
        id: string;
      },
    ) => {
      void (async () => {
        const visibility = await visibilityForSubject(
          deps,
          ticket.roomId,
          ticket.subjectType,
          ticket.subjectId,
        );
        if (visibility.size === 0) {
          ws.close(4003, "unauthorized");
          return;
        }
        const highWaterMark = await deps.store.getHighWaterMark(ticket.roomId);
        const client: HubClient = {
          id: ticket.id,
          roomId: ticket.roomId,
          subjectType: ticket.subjectType,
          subjectId: ticket.subjectId,
          visibility,
          lastSequence: highWaterMark,
          send: (payload) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify(payload));
            }
          },
          close: (code, reason) => ws.close(code, reason),
        };
        hub.add(client);
        ws.send(
          JSON.stringify({
            type: "subscribed",
            roomId: ticket.roomId,
            highWaterMark,
            subjectType: ticket.subjectType,
          }),
        );
        ws.on("close", () => hub.remove(client.id));
        ws.on("message", (data) => {
          try {
            const msg = JSON.parse(String(data)) as { type?: string; afterSequence?: number };
            if (msg.type === "ack" && typeof msg.afterSequence === "number") {
              client.lastSequence = Math.max(client.lastSequence, msg.afterSequence);
            }
          } catch {
            // ignore malformed client frames
          }
        });
      })().catch(() => {
        ws.close(1011, "internal");
      });
    },
  );

  await new Promise<void>((resolve) => {
    server.listen(deps.port, deps.host, () => resolve());
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : deps.port;
  const url = `http://${deps.host}:${port}`;

  return {
    deps,
    hub,
    server,
    wss,
    url,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        wss.close((err) => (err ? reject(err) : resolve()));
      });
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

function readBody(req: IncomingMessage): Promise<Buffer | undefined> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      if (chunks.length === 0) resolve(undefined);
      else resolve(Buffer.concat(chunks));
    });
    req.on("error", reject);
  });
}
