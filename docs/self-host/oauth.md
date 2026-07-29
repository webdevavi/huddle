# GitHub OAuth setup

Huddle uses GitHub OAuth for production auth. When credentials are unset, the
control plane stays in **fake** auth mode (`x-huddle-user` header) for local DX.

## Create a GitHub OAuth App

1. GitHub → Settings → Developer settings → OAuth Apps → New OAuth App.
2. Homepage URL: your public base (`HUDDLE_BASE_URL`), e.g. `https://huddle.example`.
3. Authorization callback URL:

```text
https://huddle.example/v1/auth/github/callback
```

For local bring-up:

```text
http://127.0.0.1:8787/v1/auth/github/callback
```

4. Copy Client ID and generate a Client Secret.

## Configure the control plane

```bash
export HUDDLE_GITHUB_CLIENT_ID=...
export HUDDLE_GITHUB_CLIENT_SECRET=...
export HUDDLE_BASE_URL=http://127.0.0.1:8787
# optional: where browser redirects after login
export HUDDLE_WEB_BASE_URL=http://127.0.0.1:5173
```

Compose / container: set the same variables in `deploy/container/.env`.

## Flows

| Client | Flow |
|---|---|
| Browser | `GET /v1/auth/github/start` → GitHub → callback (state-validated) → session cookie → redirect |
| CLI | `huddle auth login` → device code → poll `/v1/auth/github/device/poll` → `~/.huddle/session.json` |

Check mode:

```bash
curl -s "$HUDDLE_BASE_URL/v1/auth/mode"
```

Expected when configured: `{ "mode": "github", "githubConfigured": true, ... }`.

## Security notes

- Callback `state` is required and single-use (in-memory; single-node control plane).
- Device pending codes expire (~15 minutes).
- Do not commit client secrets. Rotate if leaked.
- Org membership checks are not yet enforced (tracked for hosted beta).
