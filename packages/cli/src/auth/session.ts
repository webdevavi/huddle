import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export type HuddleSession = {
  sessionId: string;
  userId: string;
  displayName: string;
  expiresAt: string;
  serverUrl?: string;
};

export function huddleHomeDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.HUDDLE_HOME?.trim() || join(homedir(), ".huddle");
}

export function sessionFilePath(env: NodeJS.ProcessEnv = process.env): string {
  return join(huddleHomeDir(env), "session.json");
}

export async function readSession(
  env: NodeJS.ProcessEnv = process.env,
): Promise<HuddleSession | null> {
  try {
    const raw = await readFile(sessionFilePath(env), "utf8");
    const parsed = JSON.parse(raw) as HuddleSession;
    if (!parsed?.sessionId || !parsed.userId) return null;
    if (parsed.expiresAt && Date.parse(parsed.expiresAt) <= Date.now()) {
      await clearSession(env);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function writeSession(
  session: HuddleSession,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const dir = huddleHomeDir(env);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(sessionFilePath(env), `${JSON.stringify(session, null, 2)}\n`, {
    mode: 0o600,
  });
}

export async function clearSession(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  try {
    await unlink(sessionFilePath(env));
  } catch {
    // already absent
  }
}

export function identityHeader(env: NodeJS.ProcessEnv = process.env): string {
  return env.HUDDLE_USER?.trim() || "alice:Alice";
}
