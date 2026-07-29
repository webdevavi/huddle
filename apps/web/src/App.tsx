import { useEffect, useMemo, useState } from "react";
import { LiveControlPlaneClient } from "./client/LiveControlPlaneClient.js";
import { MockControlPlaneClient } from "./client/MockControlPlaneClient.js";
import type { MockSeed } from "./client/MockControlPlaneClient.js";
import type { ControlPlaneClient } from "./client/types.js";
import { FixturesPage } from "./fixtures/FixturesPage.js";
import { RoomShell } from "./room/RoomShell.js";
import { JoinPage } from "./trust/JoinPage.js";

type Route =
  { name: "join" } | { name: "room"; roomId: string; seed?: MockSeed } | { name: "fixtures" };

function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, "") || "/join";
  const [pathPart, queryPart] = raw.split("?");
  const path = pathPart || "/join";
  if (path.startsWith("/fixtures")) return { name: "fixtures" };
  if (path.startsWith("/room/")) {
    const parts = path.split("/");
    const roomId = parts[2] || "room_demo";
    const seedParam = new URLSearchParams(queryPart ?? "").get("seed");
    if (seedParam) {
      return { name: "room", roomId, seed: seedParam as MockSeed };
    }
    return { name: "room", roomId };
  }
  return { name: "join" };
}

function createClient(): ControlPlaneClient {
  const apiUrl = import.meta.env.VITE_HUDDLE_API_URL;
  if (typeof apiUrl === "string" && apiUrl.trim()) {
    return new LiveControlPlaneClient({ baseUrl: apiUrl.trim() });
  }
  return new MockControlPlaneClient();
}

export function App() {
  const [route, setRoute] = useState<Route>(() =>
    typeof window !== "undefined" ? parseRoute(window.location.hash) : { name: "join" },
  );

  const client = useMemo(() => createClient(), []);
  const mockClient = client instanceof MockControlPlaneClient ? client : null;

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
        onJoin={() => {
          mockClient?.seedRoom("room_demo", "approval");
          go("/room/room_demo");
        }}
      />
    );
  }

  return <RoomShell client={client} roomId={route.roomId} />;
}
