# Authentication

TDM stores auth at XDG paths with tight permissions — no upload, no sharing.

- Token / cookies: `~/.config/tdm/` via `authStore` (file `~/.config/tdm/auth.json`, mode `600`) — `src/state/authStore.ts`
- Config: `~/.config/tdm/config.json` (`600`)
- Device id: `~/.local/state/tdm/device.json` (32-hex `X-Device-Id` + 16-hex `Client-Session-Id`)
- History: `~/.local/state/tdm/history.db` (node:sqlite WAL, fallback JSONL)

## Device-code login (recommended, headless-friendly)

```bash
tdm auth login --no-open
```

Prints:

```
verification_uri=https://www.twitch.tv/activate
user_code=ABCD-EFGH
interval=5
expires_in=300
```

1. Open `verification_uri` **on another device** already logged into Twitch.
2. Enter `user_code`, authorize `TwitchDropsMiner`.
3. On the server, the CLI polls `https://id.twitch.tv/oauth2/device` until you authorize, then stores `accessToken`.

Then:

```bash
tdm auth validate          # remote Twitch validate — prints user id
tdm auth validate --local-only
```

`--no-open` is the default on servers — the CLI never tries to open a local browser.

## Import an existing token

If you already have an `auth-token`:

```bash
tdm auth import --token "auth-token=XXXX"
tdm auth import --token "XXXX"                 # raw value also accepted
tdm auth import --token-file /secure/path/token.txt
```

File should contain the raw header value or `auth-token=...` line.

## Import cookies

```bash
tdm auth import-cookie --cookie "auth-token=XXXX; _twitch_session=YYY; ..."
tdm auth import-cookie --cookie-file /secure/path/cookies.txt
```

Accepts a raw `Cookie:` header or a Netscape `cookies.txt`.

## Validate, export, logout

```bash
tdm auth validate --local-only   # no network, just presence
tdm auth validate                # remote — hits id.twitch.tv/oauth2/validate
tdm auth export                  # env format, secrets redacted
tdm auth export --format json
tdm auth export --show-secrets   # raw — use with care, never paste in issues
tdm auth logout                  # clears stored token/cookies (keeps file)
```

`export` without `--show-secrets` prints `<redacted>` — safe to paste in diagnostics.

## Import from the Python miner

The upstream Python miner stores `auth-token` in its config. Export it (e.g. from its settings UI or config file) and:

```bash
tdm auth import --token "auth-token=VALUE_FROM_PYTHON_MINER"
tdm auth validate
```

Same Twitch account → same inventory and campaign set — `tdm games` should match.

## Token expiry & rotation

- Validate on a schedule: `tdm auth validate` in cron or `tdm doctor` which includes an auth check.
- On `401` / `twitchAuth 401` health, re-run `tdm auth login --no-open`.
- Updater and `doctor --json` surface `twitchAuth` status via `validateAuthRemote()` (`src/auth/validate.ts`).

## Permissions & security

- `~/.config/tdm/` is created `700`; files `600`. Never commit them. `.gitignore` covers `auth.json`/`device.json`.
- Repo `security.yml` workflow scans PRs for leaked `authToken` / `ghp_` / private subnets.
- If you run multi-user, prefer `--user` systemd units — they isolate per user.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `No auth material found` | `tdm auth login --no-open` then `validate` |
| `Remote token validation failed` / 401 | Token expired — re-login. Check `tdm auth export` vs Inventory login. |
| Device polling times out | Re-run `login --no-open` — codes expire in ~5 min. |
| `CaptchaRequired` / 400 on inventory | Transient Twitch — auto backoff per game; check [[Troubleshooting#gql-400]]. |

*Last synced: 0.6.1 — 2026-08-06*
