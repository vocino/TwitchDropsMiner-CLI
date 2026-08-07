# Running the Miner

## Commands

```bash
tdm run                          # foreground, logs to stdout/stderr
tdm run --verbose                # debug logs (spade payload, GQL vars)
tdm run --dry-run --verbose      # no spade POST, no ClaimDrop GQL — log only
tdm run --no-lock                # skip stale-lock guard (recovery)
tdm run --metrics-port 9098 --metrics-host 0.0.0.0   # expose observability
```

`Ctrl+C` (SIGINT) → graceful shutdown, clears `~/.local/state/tdm/lock.file`. Service `stop` sends SIGTERM — same path. Only `rm lock.file` on `kill -9` / crash / power-loss.

## What happens each cycle

```
1  Inventory (GQL `Inventory` 8337eb..) → in-progress campaigns + drop chains
2  ViewerDropsDashboard (d9cae7..) → full campaign list for your account
3  Filter wanted games = priority ∩ active ∩ not excluded, ordered by priorityMode
4  Per wanted game: DirectoryPage_Game (86bcce..) — live channels, dropsEnabled, ACL-bonus sorted
     └─ concurrency = channelFetchConcurrency (default 4), limit 30 per game
5  Pick top channel (priority + viewers), refresh slug via SlugRedirect (1f0300..) when needed
6  Beacon minute-watched → spade.twitch.tv (full payload: game, game_id, client_time, is_live, minutes_logged, …)
7  Progress via PubSub user-drop-events + CurrentDrop GQL (4d06b7..); claim via ClaimDrop GQL (a455de..)
8  Hourly inventory refresh + campaign start/end timers → re-fetch channels & rotate
   Special games (IDs 509663, 509672 — IRL) can earn watching ANY game.
```

No video stream is ever played — only the beacon.

## Dry-run

```bash
tdm run --dry-run --verbose
```

- Still fetches inventory/campaigns/channels.
- Logs `Would send watch tick` and `Would claim drop X` instead of POSTing.
- PubSub still connects read-only so you can observe events.

## Spade & PubSub details

- **Spade** payload mirrors upstream `channel.py` `gql_payload` (gzip+b64 alt available via `buildSpadeGqlPayload()`): `broadcast_id`, `channel_id`, `channel`, `client_time`, `game`, `game_id`, `is_live`, `live`, `location=channel`, `logged_in`, `minutes_logged=1`, `muted=false`, `hidden=false`, `user_id`. `broadcast_id` from directory `node.id`, escalated via `GetStreamInfo` (198492..) when higher fidelity needed; `PlaybackAccessToken` (ed230a..) available for HLS context.
- **PubSub** pool: `MAX_WEBSOCKETS=8`, `WS_TOPICS_LIMIT=50` → `MAX_CHANNELS=199` (`(8*50-2)/2`, base topics = `user-drop-events` + `onsite-notifications`, +2 per channel = `video-playback-by-id` + `broadcast-settings-update`). Auto-shards and shrinks. See [[Architecture]].

## Inventory / chains

- Drop chains use `preconditionsMet` (all precondition drop IDs claimed) and `baseEarnConditions` — second drop cannot earn until first is claimed. Claim window is 24h after campaign ends. See [[Architecture#inventory--chains]] and `docs/parity.md`.

## Tuning

| Knob | Effect |
|---|---|
| `priority` / `priorityMode` / `exclude` | Which campaigns get a channel at all. |
| `channelFetchConcurrency` | Throughput vs burst. Lower if rate-limited. |
| `availableDropsCheck` | Adds per-channel `AvailableDrops` (782dad..) call — strict but expensive. Off by default. |
| `gqlHashOverrides` | Hot-fix when Twitch rotates hashes — see [[Configuration#gql-hash-overrides]] and [[Troubleshooting#gql-hash-rotation]]. |

## Logging

Pino logger (`src/core/runtime.ts`). `TDM_LOG_LEVEL=debug` when `--verbose`. Without it, `info` + `warn` + errors only.

*Last synced: 0.6.1 — 2026-08-06*
