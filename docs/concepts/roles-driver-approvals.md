# Roles, driver, and approvals

Collaboration in a Huddle room is structured — not a shared terminal.

## Roles (summary)

| Role | Typical powers |
|---|---|
| Host | Creates the room, manages invites, can archive |
| Member | Observes, may request driver / submit interventions per policy |
| Guest | Join via one-time invite; limited by room policy |
| Driver | Holds the lease to steer the active run |
| Approver | Resolves network / publish / other gated actions |

Exact capability matrices live in `@huddle/authz` once wired into the control plane.

## Driver lease

Only one driver lease is active at a time. Concurrent requests serialize; stale leases
are rejected. Closing a browser does not instantly drop an in-flight turn — grace and
requestable handoff apply when the full runner lands.

## Approvals

Risky effects (network, Git publish, and similar) require explicit approval evidence.
Approvals are content-addressed and verified locally before execution so the control
plane cannot silently broaden what runs on the host.

## Input modes

Participants observe a shared timeline. Steering and suggestions go through validated
operations — Huddle does **not** expose a general-purpose remote shell.

See also: [Data boundary](./data-boundary.md) · [Host a room](../getting-started/host-a-room.md)
