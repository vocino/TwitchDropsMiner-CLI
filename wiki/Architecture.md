# Architecture

How the CLI mirrors [DevilXD/TwitchDropsMiner](https://github.com/DevilXD/TwitchDropsMiner) headlessly. Parity file: repo `docs/parity.md` — this page is the readable summary.

## Stack

- **Runtime:** Node `>=22.14.0`, TypeScript `5.7`, ESM (`type: module`), `tsc` → `dist/`, `node --test` (no extra test runner)
- **HTTP:** `undici` (fetch) + `ProxyAgent` for `config.proxy`; `ws` for PubSub; `zod` for `ConfigSchema` (`src/config/schema.ts`); `pino` logger; `commander` (`@commander-js/extra-typings`) for CLI
- **State:** XDG (`~/.config/tdm/` + `~/.local/state/tdm/`), SQLite `node:sqlite` builtin (WAL) with JSONL fallback (`src/ops/history.ts`), device cache `X-Device-Id` (`src/state/deviceStore.ts`)

## Module map

```
src/auth/          deviceAuth, sessionManager, cookieImport, tokenImport, validate
src/config/        schema (zod), store (XDG load/save, 600)
src/integrations/  gqlClient, gqlOperations (11 ops + hashes), httpClient, twitchPubSub (pool), twitchSpade (beacon)
src/domain/        inventory (preconditionsMet, baseEarnConditions, canEarnWithin), channel
src/core/          miner (orchestrator), watchLoop (59s tick), channelService (slug+directory), stateMachine, maintenance (hourly + timers), runtime (pino + lock), constants
src/ops/           metrics (MetricsRegistry + HTTP), history (SQLite), systemd (unit gen), webhooks
src/state/         authStore, cookieStore, deviceStore, sessionState
src/cli/           index + 14 commands (run, auth, status, config, games, doctor, healthcheck, service, logs, history, metrics, watch, drops, hooks/export, calendar/optimize/simulate, rules)
```

## GQL operations (11, synced 2026-07-30)

| Op | Hash prefix | File | Purpose |
|---|---|---|---|
| Inventory | `8337eb…` | `gqlOperations.ts` | In-progress drops for your account |
| ViewerDropsDashboard (Campaigns) | `d9cae7…` | `campaigns` | All campaigns for the account |
| DirectoryPage_Game | `86bcce…` | `directory` | Live channels for a game (`limit 30, imageWidth 50, includeCostreaming false, SUB_ONLY_LIVE, RELEVANCE, JIRA-VXP-2397`) |
| DirectoryGameRedirect (SlugRedirect) | `1f0300…` | `slug` | Canonical game slug (not naive lowercasing) |
| VideoPlayerStreamInfoOverlayChannel (GetStreamInfo) | `198492…` | `streamInfo` | Real `broadcast_id` for spade |
| PlaybackAccessToken | `ed230a…` | `playback` | HLS token (available, not required for beacons) |
| DropsHighlightService_AvailableDrops | `782dad…` | `availableDrops` | Strict per-channel drop match (optional, `availableDropsCheck`) |
| DropCurrentSessionContext (CurrentDrop) | `4d06b7…` | `currentDrop` | PubSub fallback freshness |
| DropsPage_ClaimDropRewards (ClaimDrop) | `a455de…` | `claim` | Auto-claim eligible drops |
| DropCampaignDetails | `039277…` | `campaignDetails` | Campaign detail enrichment |
| ChannelPointsContext | `374314…` | `channelPoints` | Aux (parity, not used for points) |

Hashes pinned in `src/integrations/gqlOperations.ts`; overrides via `config.gqlHashOverrides` when Twitch rotates them. Upstream source of truth: DevilXD `TwitchDropsMiner/constants.py` + `twitch_gql/` — daily `tdm-dev-loop` fetches upstream `/tmp/upstream-pyminer` for comparison.

## PubSub pool & channel scale

Upstream: `MAX_WEBSOCKETS=8`, `WS_TOPICS_LIMIT=50` → `MAX_TOPICS=398` → `MAX_CHANNELS=199`.

CLI `src/integrations/twitchPubSub.ts` shards into `SingleSocket` instances — new socket at 50 topics, shrinks when under-utilized. Per channel 2 topics: `video-playback-by-id` + `broadcast-settings-update`. Base topics: `user-drop-events` + `onsite-notifications`. `getSocketCount()`, `getMaxChannels()==199`. PubSub also drives `channelSwitchesTotal` and `pubsubConnected`.

## Inventory & chains

`src/domain/inventory.ts` — upstream `preconditions_met` / `_can_earn_within` / 24h claim window:

- `preconditionsMet` — all `preconditionDropIds` claimed.
- `baseEarnConditions` — `preconditionsMet` plus campaign benefits / chain participation.
- `canEarnWithin(stamp)` — `baseEarnConditions && endsAt > now && startsAt < stamp`.
- 24h post-campaign window for `ClaimDrop`; chain tests ensure drop 2 blocked until drop 1 claimed.

Special games `SPECIAL_GAME_IDS = {509663, 509672}` (IRL — `src/core/constants.ts:isSpecialGameId`) can earn watching **any** game (upstream b5e1993).

## Spade beacon

`src/integrations/twitchSpade.ts` — minute-watched POST to `spade.twitch.tv` (or `buildSpadeGqlPayload()` gzip+b64 GQL alternative). Payload mirrors upstream `channel.py`:

```json
{ "broadcast_id":"…", "channel_id":"456", "channel":"login", "client_time":"…Z", "game":"WoW", "game_id":"12345", "hidden":false, "is_live":true, "live":true, "location":"channel", "logged_in":true, "minutes_logged":1, "muted":false, "user_id":"789" }
```

`broadcast_id` from directory `node.id`, escalated via `GetStreamInfo` for fidelity. Interval `WATCH_INTERVAL_MS=59_000` (`src/core/constants.ts`), backoff per game on `CaptchaRequired` (5m keep-channel).

## Watch loop & state machine

- `src/core/watchLoop.ts` — 59s tick, spade POST, progress check, claim.
- `src/core/miner.ts` — orchestrator (inventory → wanted games → channelService → watchLoop → PubSub → maintenance).
- `src/core/stateMachine.ts` — `WATCHING` / `MAINTENANCE` / idle, session file `~/.local/state/tdm/session.json` read by `tdm status`.
- `src/core/maintenance.ts` — hourly inventory refresh + campaign start/end timers.

## Config & device

- `src/config/schema.ts` — `ConfigSchema` (zod) — `priority`, `priorityMode`, `exclude`, `proxy`, `channelFetchConcurrency`, `gqlHashOverrides`, `webhooks`, etc. See [[Configuration]].
- `src/state/deviceStore.ts` — persistent 32-hex `deviceId` + 16-hex `sessionId` → `X-Device-Id` / `Client-Session-Id` headers (upstream `unique_id` cookie).

## Tests & guards

- `npm test` → `tsc` + `node --test dist/tests/index.js` — 58+ tests (`src/tests/unit`, `parity`, `integration`): spade payload, inventory chains, PubSub pool, hash pinning.
- Guards: `~/.hermes/scripts/oss-master-guard.sh` + repo `.github/workflows/security.yml` scan private subnets / secrets before push. Commit identity `Travis Vocino <travis@vocino.com>` per `.mailmap`.

*Last synced: 0.6.1 — 2026-08-06*
