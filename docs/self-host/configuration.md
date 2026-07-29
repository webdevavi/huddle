# Self-host configuration

Environment variables for the control-plane container. Defaults favor a safe local stub.

| Variable | Purpose | Notes |
|---|---|---|
| `HUDDLE_HOST` / `HOST` | Bind address | Default `0.0.0.0` in containers |
| `HUDDLE_PORT` / `PORT` | HTTP port | Default `8080` in containers |
| `HUDDLE_BASE_URL` | Public base URL | OAuth callbacks + invite links |
| `HUDDLE_WEB_BASE_URL` | Browser redirect after OAuth | Defaults to `HUDDLE_BASE_URL` |
| `HUDDLE_DATABASE_URL` | Database | `sqlite:///data/huddle.db` or Postgres URL |
| `HUDDLE_SQLITE_PATH` | Explicit SQLite file | Used when not on Postgres |
| `HUDDLE_DATA_DIR` | Durable data directory | Mount as a volume |
| `HUDDLE_GITHUB_CLIENT_ID` | OAuth client id | Required for real auth — see [OAuth](./oauth.md) |
| `HUDDLE_GITHUB_CLIENT_SECRET` | OAuth secret | Required for real auth |
| `HUDDLE_SESSION_SECRET` | Session signing | Generate a strong random value |
| `HUDDLE_SIGNING_SECRET` | General signing | Generate a strong random value |
| `HUDDLE_TELEMETRY` | Operator telemetry | Self-host default **`off`** |
| `HUDDLE_INVITE_TTL_HOURS` | Invite lifetime | Default `24` |
| `HUDDLE_MIGRATIONS_PATH` | Schema SQL path | Set in the container image |

## SQLite path and backup

1. Keep the database file on a named volume (`/data`), never on ephemeral rootfs.
2. Back up `/data` before upgrades or image rolls.
3. SQLite is single-writer oriented — do not scale write replicas against one file.
4. Migration lock / restore tooling ships with the persistence package; until then treat
   volume snapshots as the recovery mechanism.

## CLI targeting

```bash
export HUDDLE_SERVER=https://huddle.acme.internal
huddle doctor compatibility
huddle codex --non-interactive --no-open
```

Or pass `--server` per invocation. Config precedence is CLI flags > `HUDDLE_*` env >
project-safe config > user config > defaults. Credentials never enter repository config.

## Related

- [Quickstart](./quickstart.md)
- [Container packaging](../../deploy/container/README.md)
