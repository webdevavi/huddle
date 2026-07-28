import {
  authorizeMutation,
  type MutationAuthzInput,
  type MutationAuthzResult,
} from "@huddle/authz";

export type LocalPolicyDecision =
  | { ok: true }
  | { ok: false; reason: string; authz?: MutationAuthzResult };

export type LocalPolicyContext = MutationAuthzInput & {
  affectedPaths?: readonly string[];
  workspaceRoot?: string;
  pathsContained?: boolean;
};

/**
 * Local policy hooks: capability/lease checks plus workspace containment gate.
 */
export function evaluateLocalPolicy(input: LocalPolicyContext): LocalPolicyDecision {
  const authz = authorizeMutation(input);
  if (!authz.ok) {
    return { ok: false, reason: authz.reason, authz };
  }
  if (input.affectedPaths && input.affectedPaths.length > 0 && input.pathsContained === false) {
    return { ok: false, reason: "workspace_escape" };
  }
  return { ok: true };
}

export function approvalCapabilityFor(category: string): `approval.resolve.${string}` {
  return `approval.resolve.${category}`;
}
