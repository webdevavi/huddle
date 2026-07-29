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

type OAuthState = {
  createdAtMs: number;
  expiresAtMs: number;
  /** Optional device code to complete when browser OAuth finishes with this state. */
  deviceCode?: string;
  returnTo?: string;
};

type DevicePending = {
  deviceCode: string;
  userCode: string;
  createdAtMs: number;
  expiresAtMs: number;
  intervalSec: number;
  /** GitHub device_code when using real GitHub device grant. */
  githubDeviceCode?: string;
  accessToken?: string;
  userId?: string;
  displayName?: string;
};

/** In-memory OAuth state (single-node control-plane). */
const oauthStates = new Map<string, OAuthState>();
/** In-memory device-code pending map (single-node control-plane). */
const devicePending = new Map<string, DevicePending>();

const GITHUB_AUTHORIZE = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN = "https://github.com/login/oauth/access_token";
const GITHUB_USER = "https://api.github.com/user";
const GITHUB_DEVICE_CODE = "https://github.com/login/device/code";

function pruneMaps(nowMs: number): void {
  for (const [key, value] of oauthStates) {
    if (value.expiresAtMs < nowMs) oauthStates.delete(key);
  }
  for (const [key, value] of devicePending) {
    if (value.expiresAtMs < nowMs) devicePending.delete(key);
  }
}

async function fetchGithubUser(accessToken: string): Promise<{
  userId: string;
  displayName: string;
}> {
  const userRes = await fetch(GITHUB_USER, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${accessToken}`,
      "user-agent": "huddle-control-plane",
    },
  });
  if (!userRes.ok) {
    throw new Error("GitHub user fetch failed");
  }
  const ghUser = (await userRes.json()) as { id?: number; login?: string; name?: string | null };
  const userId = `github:${ghUser.id ?? ghUser.login ?? "unknown"}`;
  const displayName = ghUser.name || ghUser.login || userId;
  return { userId, displayName };
}

export type GithubAuthMount = {
  deps: ControlPlaneDeps;
  auth: FakeAuthService;
  /** Public base URL for OAuth callback, e.g. http://127.0.0.1:8787 */
  publicBaseUrl: () => string;
};

/**
 * Register GitHub OAuth + device-code routes on a Hono app.
 * When GitHub env is unset, only `/v1/auth/mode` is meaningful; start/callback return 503.
 */
export function registerGithubAuthRoutes(
  // Hono app from createApp — keep loose to avoid Variables schema coupling
  app: {
    get: (path: string, handler: (c: Context) => Response | Promise<Response> | void) => unknown;
    post: (path: string, handler: (c: Context) => Response | Promise<Response> | void) => unknown;
  },
  mount: GithubAuthMount,
): void {
  app.get("/v1/auth/mode", (c: Context) =>
    c.json({
      mode: authMode(),
      githubConfigured: githubConfigured(),
      hint: githubConfigured()
        ? "Use /v1/auth/github/start (browser) or POST /v1/auth/github/device (CLI)."
        : "Set HUDDLE_GITHUB_CLIENT_ID and HUDDLE_GITHUB_CLIENT_SECRET for GitHub OAuth.",
    }),
  );

  app.get("/v1/auth/github/start", (c: Context) => {
    if (!githubConfigured()) {
      return jsonError(
        huddleError("INTERNAL", "GitHub OAuth is not configured", "github_disabled"),
        503,
      );
    }
    pruneMaps(mount.deps.clock.nowMs());
    const clientId = process.env.HUDDLE_GITHUB_CLIENT_ID!;
    const state = newStateToken();
    const now = mount.deps.clock.nowMs();
    const returnTo = c.req.query("return_to") ?? undefined;
    const deviceCode = c.req.query("device_code") ?? undefined;
    oauthStates.set(state, {
      createdAtMs: now,
      expiresAtMs: now + 10 * 60 * 1000,
      ...(returnTo ? { returnTo } : {}),
      ...(deviceCode ? { deviceCode } : {}),
    });
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
    const oauthError = c.req.query("error");
    if (oauthError) {
      return jsonError(
        huddleError("INTERNAL", c.req.query("error_description") ?? oauthError, "oauth_denied"),
        400,
      );
    }
    const code = c.req.query("code");
    const state = c.req.query("state");
    if (!code || !state) {
      return jsonError(huddleError("INTERNAL", "missing code or state", "oauth_missing_code"), 400);
    }
    const pendingState = oauthStates.get(state);
    oauthStates.delete(state);
    if (!pendingState || mount.deps.clock.nowMs() > pendingState.expiresAtMs) {
      return jsonError(huddleError("INTERNAL", "invalid or expired OAuth state", "oauth_bad_state"), 400);
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

    let identity: { userId: string; displayName: string };
    try {
      identity = await fetchGithubUser(tokenJson.access_token);
    } catch {
      return jsonError(
        huddleError("INTERNAL", "GitHub user fetch failed", "oauth_user_failed"),
        502,
      );
    }

    if (pendingState.deviceCode) {
      const device = devicePending.get(pendingState.deviceCode);
      if (device) {
        device.accessToken = tokenJson.access_token;
        device.userId = identity.userId;
        device.displayName = identity.displayName;
      }
    }

    const session = await mount.auth.createSessionForUser(identity);
    const headers = withSessionCookie(session.sessionId);

    const webBase =
      process.env.HUDDLE_WEB_BASE_URL?.trim() ||
      process.env.HUDDLE_BASE_URL?.trim() ||
      mount.publicBaseUrl();
    const returnTo = pendingState.returnTo || `${webBase.replace(/\/$/, "")}/`;
    if (c.req.header("accept")?.includes("application/json")) {
      headers.set("content-type", "application/json");
      return new Response(JSON.stringify({ session, mode: "github", returnTo }), {
        status: 200,
        headers,
      });
    }
    headers.set("location", returnTo);
    return new Response(null, { status: 302, headers });
  });

  /** Device-code flow for CLI (GitHub device grant when configured; otherwise local stub). */
  app.post("/v1/auth/github/device", async (c: Context) => {
    pruneMaps(mount.deps.clock.nowMs());
    const now = mount.deps.clock.nowMs();
    const deviceCode = newStateToken();
    let userCode = newStateToken().slice(0, 8).toUpperCase();
    let verificationUri = `${mount.publicBaseUrl()}/v1/auth/github/device/fake`;
    let verificationUriComplete: string | undefined;
    let intervalSec = 5;
    let expiresIn = 900;
    let githubDeviceCode: string | undefined;

    if (githubConfigured()) {
      const clientId = process.env.HUDDLE_GITHUB_CLIENT_ID!;
      const ghRes = await fetch(GITHUB_DEVICE_CODE, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          client_id: clientId,
          scope: "read:user",
        }),
      });
      if (ghRes.ok) {
        const gh = (await ghRes.json()) as {
          device_code?: string;
          user_code?: string;
          verification_uri?: string;
          verification_uri_complete?: string;
          expires_in?: number;
          interval?: number;
          error?: string;
        };
        if (gh.device_code && gh.user_code) {
          githubDeviceCode = gh.device_code;
          userCode = gh.user_code;
          verificationUri = gh.verification_uri ?? "https://github.com/login/device";
          verificationUriComplete = gh.verification_uri_complete;
          expiresIn = gh.expires_in ?? 900;
          intervalSec = gh.interval ?? 5;
        }
      }
      // Fall through to local browser completion if GitHub device endpoint is unavailable.
      if (!githubDeviceCode) {
        verificationUri = `${mount.publicBaseUrl()}/v1/auth/github/start?device_code=${encodeURIComponent(deviceCode)}`;
      }
    }

    const pending: DevicePending = {
      deviceCode,
      userCode,
      createdAtMs: now,
      expiresAtMs: now + expiresIn * 1000,
      intervalSec,
      ...(githubDeviceCode ? { githubDeviceCode } : {}),
    };
    devicePending.set(deviceCode, pending);
    return c.json({
      deviceCode,
      userCode,
      verificationUri,
      ...(verificationUriComplete ? { verificationUriComplete } : {}),
      expiresIn,
      interval: intervalSec,
    });
  });

  /**
   * Poll device flow. Completes when:
   * - GitHub device grant succeeds,
   * - browser OAuth linked via device_code completes,
   * - header `x-huddle-device-complete: 1` (test/fake).
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
      return new Response(JSON.stringify({ status: "complete", session }), { status: 200, headers });
    }

    if (pending.githubDeviceCode && githubConfigured() && !pending.accessToken) {
      const clientId = process.env.HUDDLE_GITHUB_CLIENT_ID!;
      const clientSecret = process.env.HUDDLE_GITHUB_CLIENT_SECRET!;
      const tokenRes = await fetch(GITHUB_TOKEN, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          device_code: pending.githubDeviceCode,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
      });
      if (tokenRes.ok) {
        const tokenJson = (await tokenRes.json()) as {
          access_token?: string;
          error?: string;
          interval?: number;
        };
        if (tokenJson.access_token) {
          try {
            const identity = await fetchGithubUser(tokenJson.access_token);
            pending.accessToken = tokenJson.access_token;
            pending.userId = identity.userId;
            pending.displayName = identity.displayName;
          } catch {
            return jsonError(
              huddleError("INTERNAL", "GitHub user fetch failed", "oauth_user_failed"),
              502,
            );
          }
        } else if (tokenJson.error === "authorization_pending") {
          return c.json({ status: "pending", interval: pending.intervalSec });
        } else if (tokenJson.error === "slow_down") {
          pending.intervalSec = Math.max(pending.intervalSec, tokenJson.interval ?? pending.intervalSec + 5);
          return c.json({ status: "pending", interval: pending.intervalSec, slowDown: true });
        } else if (tokenJson.error === "expired_token" || tokenJson.error === "access_denied") {
          devicePending.delete(body.deviceCode);
          return jsonError(
            huddleError("INTERNAL", tokenJson.error, "device_denied"),
            tokenJson.error === "expired_token" ? 410 : 403,
          );
        }
      }
    }

    if (pending.accessToken && pending.userId) {
      const session = await mount.auth.createSessionForUser({
        userId: pending.userId,
        displayName: pending.displayName ?? pending.userId,
      });
      devicePending.delete(body.deviceCode);
      const headers = withSessionCookie(session.sessionId);
      headers.set("content-type", "application/json");
      return new Response(JSON.stringify({ status: "complete", session }), { status: 200, headers });
    }

    return c.json({ status: "pending", interval: pending.intervalSec });
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

/** Test helper: clear in-memory OAuth maps between tests. */
export function resetGithubAuthStateForTests(): void {
  oauthStates.clear();
  devicePending.clear();
}
