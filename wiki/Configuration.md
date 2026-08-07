# Configuration

All user config lives in one file. Show it:

```bash
tdm config path          # ~/.config/tdm/config.json
tdm config get           # pretty JSON
tdm config validate      # zod parse — reports unknown keys
```

Edit via CLI or directly (`600` permissions). Changes apply on next `tdm run` (or `systemctl --user restart tdm`).

## Minimal example

```json
{
  "priority": ["Overwatch", "Marvel Rivals"],
  "priorityMode": "priority_only",
  "exclude": [],
  "language": "English",
  "channelFetchConcurrency": 4
}
```

## Keys

| Key | Type | Default | What it does |
|---|---|---|---|
| `priority` | `string[]` | `[]` | **Wanted games** — exact names from `tdm games`. Empty = idle. Order matters in `priority_only`. Managed by `tdm games --add`. See below. |
| `priorityMode` | `priority_only \| ending_soonest \| low_avbl_first` | `priority_only` | How to order wanted games when more than one is active. `ending_soonest` pushes expiring campaigns first; `low_avbl_first` pushes scarce campaigns first. |
| `exclude` | `string[]` | `[]` | Never watch these games, even if they appear in inventory. |
| `availableDropsCheck` | `boolean` | `false` | If `true`, per-channel `AvailableDrops` GQL filter (expensive — one GQL per candidate). Leave off unless you need strict drop↔channel matching. |
| `channelFetchConcurrency` | `1..10` | `4` | Parallel `DirectoryPage_Game` fetches. `1` = gentle, `10` = fast but bursty. |
| `language` | `string` | `English` | Twitch browse language. |
| `proxy` | `string` | `""` | HTTP proxy URL (`http://user:pass@host:port`). Wired via Undici `ProxyAgent` in `httpClient`/`gqlClient`. Leave empty for direct. |
| `gqlHashOverrides` | `Record<string,string>` | `{}` | Pin GQL operation hashes when Twitch rotates them before a release. Key = op name (e.g. `Inventory`), value = new hash. See [[Troubleshooting#gql-hash-rotation]]. |
| `webhooks.onClaim / onProgress / onChannelSwitch / onError` | `string` | `""` | URLs or `exec:` commands — templated. See [[Homelab-Integrations]]. |
| `sleepMode` | `boolean` | `true` | Idle sleep when no wanted games live. |
| `connectionQuality` | `1..6` | `1` | Reserved (upstream parity). |
| `enableBadgesEmotes` | `boolean` | `false` | Upstream parity flag — no effect on drops. |
| `darkMode`, `trayNotifications`, `autostartTray` | `boolean` | `false/true/false` | GUI parity flags — ignored in CLI. |

## `tdm games` — the companion to `priority`

```bash
tdm games                 # human table — campaign, game, time left
tdm games --json | jq
tdm games --add "Exact Game Name"   # appends to priority, saves config
```

Use the **exact** Twitch game name — casing and punctuation must match. Verify with `tdm config get` after adding. Link accounts at [twitch.tv/drops/campaigns](https://www.twitch.tv/drops/campaigns) to make more games show up.

Example priority ordering (with `priority_only`):

```bash
tdm config set priority '["Overwatch", "Marvel Rivals", "Just Chatting"]'
# Miner tries Overwatch first; falls through if no live drops-enabled channel.
```

## GQL hash overrides (when Twitch rotates hashes)

Symptom: `inventoryFetch 400`, `doctor` shows `twitchGql 400`, `gqlHashOverrides` warning. Fix:

```bash
# Compare hashes from /tmp/upstream-pyminer (fetched by tdm-dev-loop) vs src/integrations/gqlOperations.ts
tdm config set gqlHashOverrides '{"Inventory":"NEW_HASH","ViewerDropsDashboard":"NEW_HASH"}'
systemctl --user restart tdm
tdm doctor --json | jq .checks
```

Remove the override after the next CLI release that bakes the new hash: `tdm config set gqlHashOverrides '{}'`.

## Paths & permissions

```
~/.config/tdm/config.json       # 600 — your settings (XDG)
~/.config/tdm/auth.json         # 600 — token (authStore)
~/.local/state/tdm/device.json  # deviceId + sessionId (X-Device-Id)
~/.local/state/tdm/history.db   # watch ticks (SQLite WAL, node:sqlite)
~/.local/state/tdm/lock.file    # single-instance guard
```

`tdm config path` creates the dir `700` if missing. Never commit these files — `.gitignore` covers them.

*Last synced: 0.6.1 — 2026-08-06*
