import type { ControlPlaneDeps } from "../config.js";
import type { AuthSession, FakeAuthService } from "../auth/fake.js";
import { huddleError, jsonError } from "./errors.js";

export type RequestContext = {
  deps: ControlPlaneDeps;
  auth: FakeAuthService;
  session: AuthSession | null;
};

export function readSessionId(headers: Headers): string | undefined {
  const cookie = headers.get("cookie") ?? "";
  const match = /(?:^|;\s*)huddle_session=([^;]+)/.exec(cookie);
  if (match?.[1]) return decodeURIComponent(match[1]);
  const bearer = headers.get("authorization");
  if (bearer?.startsWith("Bearer ")) return bearer.slice("Bearer ".length).trim();
  const header = headers.get("x-huddle-session");
  return header ?? undefined;
}

export function withSessionCookie(sessionId: string, init?: ResponseInit): Headers {
  const headers = new Headers(init?.headers);
  headers.append(
    "set-cookie",
    `huddle_session=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax`,
  );
  return headers;
}

export function requireSession(ctx: RequestContext): AuthSession | Response {
  if (ctx.session) return ctx.session;
  return jsonError(
    huddleError(
      "AUTHZ_PERMISSION_DENIED",
      "Authentication required. Sign in with fake identity header x-huddle-user.",
      "auth_missing",
    ),
    401,
  );
}
