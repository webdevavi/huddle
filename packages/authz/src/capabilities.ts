/** Persistent membership roles (§8.1 C). Driver is a lease, not a role. */
export const MEMBERSHIP_ROLES = ["viewer", "collaborator", "owner"] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

/**
 * Capability-based authorization surface (§14.2).
 * Roles map to capability sets; UI may present roles while checks use capabilities.
 */
export const CAPABILITIES = [
  "room.read",
  "room.comment",
  "room.suggest",
  "room.queue",
  "room.steer",
  "room.interrupt",
  "driver.request",
  "driver.handoff",
  "driver.reclaim",
  "member.manage",
  "policy.update",
  "room.archive",
  "approval.comment",
  "approval.resolve.workspace_write",
  "approval.resolve.test_command",
  "approval.resolve.network",
  "approval.resolve.git_publish",
  "approval.resolve.deployment",
  "approval.resolve.outside_workspace",
  "export.create",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export const ROLE_CAPABILITIES: Readonly<Record<MembershipRole, readonly Capability[]>> = {
  viewer: ["room.read", "approval.comment"],
  collaborator: [
    "room.read",
    "room.comment",
    "room.suggest",
    "driver.request",
    "approval.comment",
  ],
  owner: [
    "room.read",
    "room.comment",
    "room.suggest",
    "room.queue",
    "room.steer",
    "room.interrupt",
    "driver.request",
    "driver.handoff",
    "driver.reclaim",
    "member.manage",
    "policy.update",
    "room.archive",
    "approval.comment",
    "approval.resolve.workspace_write",
    "approval.resolve.test_command",
    "approval.resolve.network",
    "approval.resolve.git_publish",
    "approval.resolve.deployment",
    "approval.resolve.outside_workspace",
    "export.create",
  ],
};

export function roleHasCapability(role: MembershipRole, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}

export function capabilitiesForRole(role: MembershipRole): readonly Capability[] {
  return ROLE_CAPABILITIES[role];
}
