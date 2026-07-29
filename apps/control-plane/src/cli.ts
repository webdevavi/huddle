import { createDeps } from "./config.js";
import { SystemClock, UuidGenerator } from "./runtime.js";
import { startControlPlane } from "./server.js";

async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? 8787);
  const host = process.env.HOST ?? "127.0.0.1";
  const sqlitePath = process.env.HUDDLE_SQLITE_PATH ?? ":memory:";
  const databaseUrl = process.env.HUDDLE_DATABASE_URL;

  const deps = createDeps({
    port,
    host,
    sqlitePath,
    ...(databaseUrl === undefined ? {} : { databaseUrl }),
    clock: new SystemClock(),
    ids: new UuidGenerator(),
  });

  const started = await startControlPlane(deps);
  console.log(`@huddle/control-plane listening on ${started.url}`);
  console.log("Fake auth: POST /v1/auth/session with header x-huddle-user: alice:Alice");

  const shutdown = async () => {
    await started.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
