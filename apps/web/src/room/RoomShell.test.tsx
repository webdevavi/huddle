import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MockControlPlaneClient } from "../client/MockControlPlaneClient.js";
import { FIXTURE_STATES, FixturesPage } from "../fixtures/FixturesPage.js";
import { JoinPage } from "../trust/JoinPage.js";
import { RoomShell } from "./RoomShell.js";

describe("JoinPage", () => {
  it("requires trust acknowledgement before continue", async () => {
    const user = userEvent.setup();
    const onJoin = vi.fn();
    render(<JoinPage onJoin={onJoin} />);
    expect(screen.getByRole("button", { name: /continue to room/i })).toBeDisabled();
    await user.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: /continue to room/i })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /continue to room/i }));
    expect(onJoin).toHaveBeenCalled();
  });
});

describe("FixturesPage", () => {
  it("renders state matrix panels", () => {
    render(<FixturesPage onOpenRoom={() => {}} />);
    expect(screen.getByRole("heading", { name: /ui state fixtures/i })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 }).length).toBe(FIXTURE_STATES.length);
  });
});

describe("RoomShell", () => {
  it("renders timeline-first shell with composer modes", async () => {
    const client = new MockControlPlaneClient({
      memberId: "member_bob",
      displayName: "Bob",
      role: "collaborator",
    });
    client.seedRoom("room_demo", "approval");
    render(<RoomShell client={client} roomId="room_demo" />);

    await waitFor(() => {
      expect(screen.getAllByText("Huddle").length).toBeGreaterThan(0);
    });
    expect(screen.getByLabelText("Room timeline")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Comment" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suggest" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Queue" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Steer" })).toBeDisabled();
    expect(screen.getByText(/decision required/i)).toBeInTheDocument();
  });

  it("shows reconnect affordance in degraded mode", async () => {
    const client = new MockControlPlaneClient();
    client.seedRoom("room_demo", "reconnect");
    render(<RoomShell client={client} roomId="room_demo" />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /retry connection/i })).toBeInTheDocument();
    });
    expect(screen.getAllByText(/reconnecting/i).length).toBeGreaterThan(0);
  });

  it("submits a suggestion", async () => {
    const user = userEvent.setup();
    const client = new MockControlPlaneClient({
      memberId: "member_bob",
      displayName: "Bob",
      role: "collaborator",
    });
    client.seedRoom("room_demo", "active");
    render(<RoomShell client={client} roomId="room_demo" />);
    await waitFor(() => expect(screen.getAllByLabelText("Message").length).toBeGreaterThan(0));
    await user.click(screen.getByRole("button", { name: "Suggest" }));
    const message = screen.getAllByLabelText("Message")[0]!;
    await user.clear(message);
    await user.type(message, "Check DST edge case");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(screen.getByText(/suggest sent/i)).toBeInTheDocument());
  });
});
