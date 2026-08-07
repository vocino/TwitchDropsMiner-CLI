# Troubleshooting

## Quick triage

```bash
tdm doctor --json | jq
curl -s http://127.0.0.1:9098/health | jq   # if metrics port on
journalctl --user -u tdm.service -n 100 --no-pager
tdm status --json | jq
tdm drops --json | jq | head -80
```

## Stale lock

**Symptom:** `Another tdm instance appears to be running` and no miner is running.

**Cause:** `kill -9`, crash, or power-loss — `SIGINT`/`SIGTERM` handler never cleared `~/.local/state/tdm/lock.file`.

**Fix:**

```bash
# Linux/macOS
rm -f ~/.local/state/tdm/lock.file
tdm run --verbose

# Windows
del %USERPROFILE%\.local\state\tdm\lock.file
```

Recovery flag: `tdm run --no-lock`. Service recovery: `systemctl --user restart tdm` (unit clears it via runtime on clean stop; hard kill still needs `rm`).

`tdm service stop` / `Ctrl+C` always clears the lock — you only need `rm` after a hard kill.

## No channel candidates / Not watching anything

| Check | Command |
|---|---|
| Do you have wanted games? | `tdm config get` — `priority` must be non-empty |
| Are they live with Drops? | `tdm games` — campaign must show a live drops-enabled channel |
| Correct names? | `tdm games --json | jq '.[].name'` — exact casing, copy from there |
| Game accounts linked? | [twitch.tv/drops/campaigns](https://www.twitch.tv/drops/campaigns) |
| `exclude` hiding them? | `tdm config get` — clear `exclude` |
| `availableDropsCheck` too strict? | `tdm config set availableDropsCheck false` |
| Twitch IRL quirk | IRL games 509663/509672 earn on any channel — see [[Architecture#inventory--chains]] |

Try the dry run + a single game: `tdm config set priority '["Just Chatting"]'` then `tdm run --dry-run --verbose`.

## Auth 401 / token expired

```bash
tdm auth validate          # remote — should print user id
# if 401:
tdm auth login --no-open
tdm auth validate
tdm doctor --json | jq .checks
```

Device codes expire in ~5 min — re-run `login --no-open` if polling timed out.

## GQL hash rotation — Inventory 400 / twitchGql 400

Twitch rotates GQL persisted hashes (symptom: `doctor` `twitchGql 400`, `inventoryFetch 400`).

1. Verify upstream: `tdm-dev-loop` fetches `https://github.com/DevilXD/TwitchDropsMiner/raw/main/constants.py` to `/tmp/upstream-pyminer` and compares to `src/integrations/gqlOperations.ts`.
2. Hot-fix without a release:

```bash
tdm config set gqlHashOverrides '{"Inventory":"NEW_HASH","ViewerDropsDashboard":"NEW_HASH"}'
systemctl --user restart tdm
```

3. Remove after next CLI release bakes the hash:

```bash
tdm config set gqlHashOverrides '{}'
```

Track at: [[Configuration#gql-hash-overrides]] and `docs/parity.md`.

## Spade / watch tick failed

- Check `tdm run --verbose` for the spade URL and the exact HTTP body / `CaptchaRequired` detection (strings `captcha`, `CF challenge`, `client blocked 5023/5027` in `src/core/watchLoop.ts`).
- `CaptchaRequired` triggers a 5 min per-game backoff but keeps the channel — no full restart needed.
- If every tick fails, re-validate auth and retry. Upstream parity detail: [[Architecture#spade-beacon]].

## PubSub disconnected (`pubsubConnected 0`)

- WSS `wss://pubsub-edge.twitch.tv/v1` must be reachable — check firewall / proxy (`config.proxy` wires via `ProxyAgent`, WS proxy via `https-proxy-agent` if installed).
- Pool auto-reconnects; `tdm logs --follow` shows `pubsub connected / reconnect`.

## Minutes not advancing on Twitch Inventory

- Twitch can delay 2–3 min — refresh [Inventory](https://www.twitch.tv/drops/inventory).
- Confirm you are watching a drops-enabled channel for a wanted game (`tdm status --json` → `watchingChannelLogin` + `watchingGame`).
- Confirm the drop’s preconditions are met (`tdm drops` → `precondMet` / `preconditionDropIds`).

## File / permission issues

```bash
ls -ld ~/.config/tdm ~/.local/state/tdm
tdm config path; tdm history --paths
tdm config validate
```

Dirs should be `700`, files `600`. Never `sudo tdm` unless you installed a system unit — it writes root-owned files your user can’t read.

## Getting help

Open an issue at [vocino/TwitchDropsMiner-CLI](https://github.com/vocino/TwitchDropsMiner-CLI/issues) with: `tdm doctor --json` (redacted), `tdm status --json`, `journalctl --user -u tdm -n 100 --no-pager`, and `tdm drops --json` tail. Never paste `--show-secrets` output.

*Last synced: 0.6.1 — 2026-08-06*
