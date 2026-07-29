import type { Context } from "hono";
import type { ControlPlaneDeps } from "../config.js";
import type { FakeAuthService } from "./fake.js";
import { newStateToken } from "./fake.js";
import { withSessionCookie } from "../http/session.js";
import { huddleError, jsonError } from "../http/errors.js";

export type AuthMode = "fake" | "github";

export function githubConfigured(): boolean {
  return Boolean(
    process.env.HUDDLE_GITHUB_CLIENT_ID?.trim() &&
      process.env.HUDDLE_GITHUB_CLIENT_SECRET?.trim(),
  );
}

export function authMode(): AuthMode {
  return githubConfigured() ? "github" : "fake";
}

type DevicePending = {
  deviceCode: string;
  userCode: string;
  createdAtMs: number;
  expiresAtMs: number;
  accessToken?: string;
  userId?: string;
  displayName?: string;
};

/** In-memory device-code pending map (single-node control-plane). */
const devicePending = new Map<string, DevicePending>();

const GITHUB_AUTHORIZE = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN = "https://github.com/login/oauth/access_token";
const GITHUB_USER = "https://api.github.com/user";

export type GithubAuthMount = {
  deps: ControlPlaneDeps;
  auth: FakeAuthService;
  /** Public base URL for OAuth callback, e.g. http://127.0.0.1:8787 */
  publicBaseUrl: () => string;
};

/**
 * Register GitHub OAuth + device-code stub routes on a Hono app.
 * When GitHub env is unset, only `/v1/auth/mode` is meaningful; start/callback return 503.
 */
export function registerGithubAuthRoutes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app: { get: Function; post: Function },
  mount: GithubAuthMount,
): void {
  app.get("/v1/auth/mode", (c: Context) => c.json({ mode: authMode() }));

  app.get("/v1/auth/github/start", (c: Context) => {
    if (!githubConfigured()) {
      return jsonError(
        huddleError("INTERNAL", "GitHub OAuth is not configured", "github_disabled"),
        503,
      );
    }
    const clientId = process.env.HUDDLE_GITHUB_CLIENT_ID!;
    const state = newStateToken();
    const redirectUri = `${mount.publicBaseUrl()}/v1/auth/github/callback`;
    const url = new URL(GITHUB_AUTHORIZE);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", "read:user");
    url.searchParams.set("state", state);
    return c.redirect(url.toString(), 302);
  });

  app.get("/v1/auth/github/callback", async (c: Context) => {
    if (!githubConfigured()) {
      return jsonError(
        huddleError("INTERNAL", "GitHub OAuth is not configured", "github_disabled"),
        503,
      );
    }
    const code = c.req.query("code");
    if (!code) {
      return jsonError(huddleError("INTERNAL", "missing code", "oauth_missing_code"), 400);
    }
    const clientId = process.env.HUDDLE_GITHUB_CLIENT_ID!;
    const clientSecret = process.env.HUDDLE_GITHUB_CLIENT_SECRET!;
    const redirectUri = `${mount.publicBaseUrl()}/v1/auth/github/callback`;

    const tokenRes = await fetch(GITHUB_TOKEN, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });
    if (!tokenRes.ok) {
      return jsonError(
        huddleError("INTERNAL", "GitHub token exchange failed", "oauth_token_failed"),
        502,
      );
    }
    const tokenJson = (await tokenRes.json()) as { access_token?: string; error?: string };
    if (!tokenJson.access_token) {
      return jsonError(
        huddleError("INTERNAL", tokenJson.error ?? "no access_token", "oauth_token_failed"),
        502,
      );
    }

    const userRes = await fetch(GITHUB_USER, {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${tokenJson.access_token}`,
        "user-agent": "huddle-control-plane",
      },
    });
    if (!userRes.ok) {
      return jsonError(
        huddleError("INTERNAL", "GitHub user fetch failed", "oauth_user_failed"),
        502,
      );
    }
    const ghUser = (await userRes.json()) as { id?: number; login?: string; name?: string | null };
    const userId = `github:${ghUser.id ?? ghUser.login ?? "unknown"}`;
    const displayName = ghUser.name || ghUser.login || userId;
    const session = await mount.auth.createSessionForUser({ userId, displayName });
    const headers = withSessionCookie(session.sessionId);
    headers.set("content-type", "application/json");
    return new Response(JSON.stringify({ session, mode: "github" }), { status: 200, headers });
  });

  /** Device-code flow stub for CLI. */
  app.post("/v1/auth/github/device", async (c: Context) => {
    const deviceCode = newStateToken();
    const userCode = newStateToken().slice(0, 8).toUpperCase();
    const now = mount.deps.clock.nowMs();
    const pending: DevicePending = {
      deviceCode,
      userCode,
      createdAtMs: now,
      expiresAtMs: now + 15 * 60 * 1000,
    };
    devicePending.set(deviceCode, pending);
    return c.json({
      deviceCode,
      userCode,
      verificationUri: githubConfigured()
        ? "https://github.com/login/device"
        : `${mount.publicBaseUrl()}/v1/auth/github/device/fake`,
      expiresIn: 900,
      interval: 5,
    });
  });

  /**
   * Poll device flow. Completes when:
   * - header `x-huddle-device-complete: 1` (test/fake), or
   * - pending entry already has accessToken from a real completion path.
   */
  app.post("/v1/auth/github/device/poll", async (c: Context) => {
    const body = (await c.req.json().catch(() => ({}))) as { deviceCode?: string };
    if (!body.deviceCode) {
      return jsonError(huddleError("INTERNAL", "deviceCode required", "bad_request"), 400);
    }
    const pending = devicePending.get(body.deviceCode);
    if (!pending) {
      return jsonError(huddleError("INTERNAL", "unknown device code", "device_unknown"), 404);
    }
    if (mount.deps.clock.nowMs() > pending.expiresAtMs) {
      devicePending.delete(body.deviceCode);
      return jsonError(huddleError("INTERNAL", "device code expired", "device_expired"), 410);
    }

    const completeHeader = c.req.header("x-huddle-device-complete");
    if (completeHeader === "1" || completeHeader === "true") {
      const identity = c.req.header("x-huddle-user") ?? "cli-user:CLI User";
      const [userIdPart, ...rest] = identity.split(":");
      const userId = userIdPart && userIdPart.length > 0 ? userIdPart : "cli-user";
      const displayName = rest.length > 0 ? rest.join(":") : userId;
      const session = await mount.auth.createSessionForUser({ userId, displayName });
      devicePending.delete(body.deviceCode);
      const headers = withSessionCookie(session.sessionId);
      headers.set("content-type", "application/json");
      return new Response(
        JSON.stringify({ status: "complete", session }),
        { status: 200, headers },
      );
    }

    if (pending.accessToken && pending.userId) {
      const session = await mount.auth.createSessionForUser({
        userId: pending.userId,
        displayName: pending.displayName ?? pending.userId,
      });
      devicePending.delete(body.deviceCode);
      const headers = withSessionCookie(session.sessionId);
      headers.set("content-type", "application/json");
      return new Response(
        JSON.stringify({ status: "complete", session }),
        { status: 200, headers },
      );
    }

    return c.json({ status: "pending" });
  });
}

/** Test helper: mark a device code complete with a synthetic GitHub identity. */
export function completeDeviceCodeForTests(
  deviceCode: string,
  user: { userId: string; displayName: string; accessToken?: string },
): boolean {
  const pending = devicePending.get(deviceCode);
  if (!pending) return false;
  pending.accessToken = user.accessToken ?? "test-token";
  pending.userId = user.userId;
  pending.displayName = user.displayName;
  return true;
}
