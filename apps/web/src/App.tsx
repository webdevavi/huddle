import { useEffect, useMemo, useState } from "react";
import { LiveControlPlaneClient } from "./client/LiveControlPlaneClient.js";
import { MockControlPlaneClient } from "./client/MockControlPlaneClient.js";
import type { MockSeed } from "./client/MockControlPlaneClient.js";
import type { ControlPlaneClient } from "./client/types.js";
import { FixturesPage } from "./fixtures/FixturesPage.js";
import { RoomShell } from "./room/RoomShell.js";
import { JoinPage } from "./trust/JoinPage.js";

type Route =
  | { name: "join"; roomId?: string }
  | { name: "room"; roomId: string; seed?: MockSeed }
  | { name: "fixtures" };

function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, "") || "/join";
  const [pathPart, queryPart] = raw.split("?");
  const path = pathPart || "/join";
  const params = new URLSearchParams(queryPart ?? "");
  if (path.startsWith("/fixtures")) return { name: "fixtures" };
  if (path.startsWith("/room/")) {
    const parts = path.split("/");
    const roomId = parts[2] || "room_demo";
    const seedParam = params.get("seed");
    if (seedParam) {
      return { name: "room", roomId, seed: seedParam as MockSeed };
    }
    return { name: "room", roomId };
  }
  const roomId = params.get("room") ?? undefined;
  return roomId ? { name: "join", roomId } : { name: "join" };
}

function createClient(): ControlPlaneClient {
  // When VITE_HUDDLE_API_URL is set (even to ""), use the live client.
  // Empty string → same-origin Vite proxy to the control plane.
  if (import.meta.env.VITE_HUDDLE_API_URL !== undefined) {
    const configured = String(import.meta.env.VITE_HUDDLE_API_URL).trim();
    const baseUrl =
      configured.length > 0
        ? configured
        : typeof window !== "undefined"
          ? window.location.origin
          : "http://127.0.0.1:5173";
    return new LiveControlPlaneClient({
      baseUrl,
      identity: import.meta.env.VITE_HUDDLE_IDENTITY ?? "bob:Bob",
    });
  }
  return new MockControlPlaneClient();
}

export function App() {
  const [route, setRoute] = useState<Route>(() =>
    typeof window !== "undefined" ? parseRoute(window.location.hash) : { name: "join" },
  );

  const client = useMemo(() => createClient(), []);
  const mockClient = client instanceof MockControlPlaneClient ? client : null;
  const live = client instanceof LiveControlPlaneClient;

  useEffect(() => {
    const onHash = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (route.name === "room" && route.seed && mockClient) {
      mockClient.seedRoom(route.roomId, route.seed);
    }
  }, [mockClient, route]);

  function go(path: string) {
    window.location.hash = path;
    setRoute(parseRoute(`#${path}`));
  }

  if (route.name === "fixtures") {
    return (
      <FixturesPage
        onOpenRoom={(seed) => {
          mockClient?.seedRoom("room_demo", seed as MockSeed);
          go(`/room/room_demo?seed=${seed}`);
        }}
      />
    );
  }

  if (route.name === "join") {
    return (
      <JoinPage
        live={live}
        initialRoomId={route.roomId ?? ""}
        onJoin={async ({ roomId }) => {
          if (mockClient) {
            mockClient.seedRoom(roomId || "room_demo", "approval");
            go(`/room/${roomId || "room_demo"}`);
            return;
          }
          // Live: ensure session can load the room (owner already a member; guests need prior join).
          await client.getRoom(roomId);
          go(`/room/${roomId}`);
        }}
      />
    );
  }

  return <RoomShell client={client} roomId={route.roomId} />;
}
