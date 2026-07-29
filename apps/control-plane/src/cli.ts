import { createDeps } from "./config.js";
import { SystemClock, UuidGenerator } from "./runtime.js";
import { startControlPlane } from "./server.js";
import { authMode } from "./auth/github.js";

async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? process.env.HUDDLE_PORT ?? 8787);
  const host = process.env.HOST ?? process.env.HUDDLE_HOST ?? "127.0.0.1";
  const sqlitePath = process.env.HUDDLE_SQLITE_PATH;
  const databaseUrl = process.env.HUDDLE_DATABASE_URL;

  const deps = createDeps({
    port,
    host,
    ...(sqlitePath === undefined ? {} : { sqlitePath }),
    ...(databaseUrl === undefined ? {} : { databaseUrl }),
    clock: new SystemClock(),
    ids: new UuidGenerator(),
  });

  const started = await startControlPlane(deps);
  console.log(`@huddle/control-plane listening on ${started.url}`);
  console.log(`Public base URL: ${deps.publicBaseUrl}`);
  console.log(`Auth mode: ${authMode()}`);
  if (authMode() === "fake") {
    console.log("Fake auth: POST /v1/auth/session with header x-huddle-user: alice:Alice");
    console.log(
      "GitHub OAuth: set HUDDLE_GITHUB_CLIENT_ID and HUDDLE_GITHUB_CLIENT_SECRET to enable.",
    );
  }

  const shutdown = async () => {
    await started.close();
    if ("close" in deps.store && typeof deps.store.close === "function") {
      await (deps.store as { close: () => Promise<void> }).close();
    }
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
