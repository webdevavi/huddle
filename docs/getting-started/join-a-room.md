# Join a room

A teammate opens the share URL printed by the host:

```text
https://huddle.dev/r/<room-slug>
```

## What the guest needs

- A browser — **no local CLI install**
- Either an authorized org/member session, or a **one-time guest invite**

## Join rules (V1)

1. Authenticated authorized members enter immediately.
2. Guest invites are exchanged once for a secure browser session and cannot be reused.
3. The guest lands on the room timeline (status, driver, policy, repository name, branch, latest diff).
4. If a run is active, historical events load before live events.

The browser never connects directly to Codex. Execution stays on the host machine; the control plane relays structured events only.

## Host checklist before sharing

```bash
huddle room status <room>
```

Revoke outstanding invites from room status when control-plane invite APIs land.

## Trust notes

- Share links are room-bound and short-lived (default 24h in the stub).
- Guests do not receive a remote shell.
- See [Data boundary](../concepts/data-boundary.md) and [Roles, driver, approvals](../concepts/roles-driver-approvals.md).

Next: [Host a room](./host-a-room.md)
