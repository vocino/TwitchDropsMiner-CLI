# TwitchDropsMiner-CLI

Headless, npm-installable CLI rewrite of [TwitchDropsMiner](https://github.com/DevilXD/TwitchDropsMiner) for Linux server operation.

**Based on:** [DevilXD/TwitchDropsMiner](https://github.com/DevilXD/TwitchDropsMiner) — the original Python/GUI app that AFK mines timed Twitch drops with automatic claiming and channel switching. This CLI reimplements the same behavior (GQL, spade, PubSub, priority lists) for headless and server use.

**Parity:** As of 0.6.0 (2026-08-03), CLI achieves upstream parity: 11 GQL ops synced 2026-07-30 (Inventory 8337eb.., Campaigns d9cae7.., DirectoryPage_Game 86bcce.. + SlugRedirect, PlaybackAccessToken, GetStreamInfo, AvailableDrops, CampaignDetails), MAX_CHANNELS 199 (8x50 pool), broadcast-settings-update topics, precondition chain-aware inventory, full spade payload (game, game_id, client_time, is_live, minutes_logged), device cache (X-Device-Id), proxy + CaptchaRequired hardening, rich status/doctor, plus strategy engine (calendar/optimize/simulate/rules) and homelab glue (webhooks/export/sleep). See `docs/parity.md`.

## Install

**Global install from npm** (recommended; puts `tdm` on your PATH):

```bash
npm install -g twitchdropsminer-cli
tdm doctor
```

**Alternative: global install from GitHub** (equivalent CLI, installs directly from this repo):

```bash
npm install -g github:vocino/TwitchDropsMiner-CLI
tdm doctor
```

**Run from project** (no global install): from the repo root run `npm install`, `npm run build`, then use `npx tdm`:

```bash
npm install && npm run build
npx tdm run --dry-run --verbose
npx tdm status --json
```

## First-time setup

1. **Log in** (headless-friendly device code; no browser on the server):

   ```bash
   tdm auth login --no-open
   ```
   Visit the printed URL on another device, enter the code, then:

   ```bash
   tdm auth validate
   ```

2. **Choose which games to mine** – the miner only watches games you list. List campaigns Twitch shows for your account:

   ```bash
   tdm games
   ```
   Copy the exact **game name** from the list (first column). Add one to your priority list:

   ```bash
   tdm games --add "Exact Game Name"
   ```
   Or set the full list manually (config file path: `tdm config path`):

   ```bash
   tdm config set priority '["Game One", "Game Two"]'
   ```

3. **Run the miner**:

   ```bash
   tdm run
   tdm run --verbose
   ```

**Config file:** `~/.config/tdm/config.json` (or run `tdm config path` to print it). The file is created on first use; you can edit it directly or use `tdm config set <key> <value>` and `tdm config get`.

## Headless authentication

```bash
tdm auth login --no-open
tdm auth validate
```

Alternative imports:

```bash
tdm auth import --token-file /secure/path/token.txt
tdm auth import-cookie --cookie-file /secure/path/cookies.txt
```

## Choosing which games to mine

- **List available games** (from Twitch, for your account):

  ```bash
  tdm games
  tdm games --json
  ```

- **Add a game to your priority list:** `tdm games --add "Exact Game Name"` (uses exact name from `tdm games`).

- **Set priority manually:** `tdm config set priority '["Game A", "Game B"]'`. Use exact game names from `tdm games`.

- **Config location:** `tdm config path` prints the path (e.g. `~/.config/tdm/config.json`). Options: `priority`, `exclude`, `priorityMode` (`priority_only` | `ending_soonest` | `low_avbl_first`), `enableBadgesEmotes`. See `docs/ops/drops-validation.md`.

If you never set `priority`, the miner will have no “wanted games” and will not watch any channel. Link game accounts at [twitch.tv/drops/campaigns](https://www.twitch.tv/drops/campaigns) so more games appear in `tdm games`.

## Run miner

```bash
tdm run
tdm run --verbose
tdm run --dry-run --verbose   # log actions only; no spade/claim network writes
```

### Stopping the miner

Stop it gracefully so the lock file is removed automatically:

- **In a terminal:** **Ctrl+C** (Windows or Linux/macOS). The miner handles SIGINT, shuts down, and exits; the lock is cleared on exit.
- **As a systemd service:** `tdm service stop` or `systemctl --user stop tdm` (sends SIGTERM; same clean shutdown).

You only need to [remove the lock file manually](#troubleshooting) if the process was **force-killed** (e.g. kill -9), **crashed**, or the machine lost power—cases where the process never got to run its exit handler.

### How it mines drops

1. **Inventory** – Fetches your in-progress campaigns and drop state via Twitch GQL.
2. **Wanted games** – From config `priority`, `exclude`, and `priorityMode` (e.g. `priority_only`, `ending_soonest`).
3. **Channels** – Fetches live channels per game (GameDirectory GQL), filters by drops-enabled and wanted game, orders by priority and viewers.
4. **Watch simulation** – Sends “minute-watched” beacons to Twitch’s spade endpoint for the selected channel (no video stream).
5. **Progress** – PubSub user-drop-events and optional CurrentDrop GQL keep drop minutes in sync; stream-state topics trigger channel refresh.
6. **Claims** – Eligible drops are claimed automatically via ClaimDrop GQL (24h post-campaign window).
7. **Maintenance** – Hourly inventory refresh and campaign time triggers (start/end) drive channel cleanup and re-fetch.

## Service mode

```bash
tdm service install --user --autostart
tdm service start
tdm service status
tdm logs --follow
```

More ops docs:

- `docs/ops/linux-install.md`
- `docs/ops/authentication.md`
- `docs/ops/service-management.md`
- `docs/ops/systemd-hardening.md`
- `docs/ops/drops-validation.md` – validate drops progression and claims

## Observability — what am I farming?

This CLI was built for tinkerers. Every minute is counted locally, and you can query it in multiple ways:

### CLI

```bash
# Rich status — watching channel, session age, parity (199 pool 8x50), history summary
tdm status --json | jq

# Detailed drop list with remaining mins, progress %, canClaim, precondMet
tdm drops                    # human
tdm drops --claimable        # only claimable
tdm drops --json | jq        # structured
tdm drops --game Overwatch   # filter

# Watch history — SQLite at ~/.local/state/tdm/history.db (node:sqlite builtin, WAL)
tdm history --summary          # total ticks, per game, per channel, time range
tdm history --paths            # db location + backend (sqlite/jsonl)
tdm history --last 50          # recent ticks
tdm history --prune-days 30    # keep last 30d
tdm history --export csv       # CSV for your own analysis

# Live TUI — polls session + history + metrics, progress bars
tdm watch

# Strategy — calendar, optimization, simulation, rules
tdm calendar --days 14         # next drops expiring
tdm optimize --mode history    # suggest priority order based on your watch history
tdm simulate --hours 24        # predict completions
tdm rules --add 'viewers < 100 => skip'  # local rules engine ~/.config/tdm/rules.json
```

### Metrics endpoints (for dashboards, Prometheus)

Run with metrics server:

```bash
tdm run --metrics-port 9098 --metrics-host 0.0.0.0
```

Then you get:

- `GET /` or `/health` → JSON summary: `watchingChannelLogin`, `watchingGame`, `minutesPerGame`, `claimedTotal`, `eligibleCampaigns`, `pubsubConnected`, uptime
- `GET /status` → same plus `activeDrop`, `wantedGames`, `channelsCount`, `state` — merged for Glance
- `GET /drops` → top active drops `[{game,name,progress,remaining,required,canClaim}]` sorted claimable first — perfect for dashboards
- `GET /metrics` → Prometheus text exposition `twitch_drops_*` (up, watching gauge, minutes_total, watch_ticks_total, campaigns_total, eligible, claimed_total, pubsub_connected, etc.)

Example:

```bash
curl -s http://localhost:9098/drops | jq
# [{"game":"Overwatch","name":"EWC Diamond","progress":0.75,"remaining":182,"required":720,"canClaim":false}]
curl -s http://localhost:9098/metrics | grep twitch_drops_watching
# twitch_drops_watching{channel="warn",channel_id="53648099",game="Overwatch"} 1
```

### Cool things you can do

**1. Glance app dashboard — live widget ([glanceapp/glance](https://github.com/glanceapp/glance))**

[Glance](https://github.com/glanceapp/glance) is a fast, self-hosted dashboard for homelabs. It supports `custom-api` widgets with Go templates that can fetch any JSON endpoint. `tdm` exposes `/status` + `/drops` exactly for this.

Example widget (full styling with progress bars in [`docs/examples/glance-tdm-widget.yml`](docs/examples/glance-tdm-widget.yml)):

```yaml
# ~/.config/glance/glance.yml snippet — requires tdm run --metrics-port 9098 --metrics-host 0.0.0.0
- type: custom-api
  title: 🎮 Twitch Drops Miner
  cache: 15s
  url: http://localhost:9098/status
  template: |
    {{ $s := .JSON }}
    {{ $watching := $s.String "watchingChannelLogin" }}
    {{ $game := $s.String "watchingGame" }}
    {{ $dropsReq := newRequest "http://localhost:9098/drops" | getResponse }}
    {{ $drops := $dropsReq.JSON.Array "" }}
    <div class="flex flex-column gap-12">
      {{ if ne $watching "" }}
        <div>WATCHING {{ $watching }} · {{ $game }}</div>
      {{ end }}
      {{ range $drops }}
        <div>{{ .String "name" }} — {{ .Int "remaining" }}m left ({{ printf "%.0f" (mul (.Float "progress") 100) }}%)</div>
      {{ end }}
    </div>
```

Result: a live card showing currently watched channel, LIVE/OFF (pubsubConnected), active drops with progress bars, remaining minutes, claimable highlight, total claimed, eligible/total campaigns. In our homelab it lives in Night City Grid next to Jellyfin/Sonarr at `http://localhost:8080` and refreshes every 15s.

**2. Prometheus + Grafana** — scrape `http://host:9098/metrics`, build panels:

```promql
twitch_drops_watching
twitch_drops_minutes_total
twitch_drops_claimed_total
twitch_drops_eligible_campaigns
```

**3. Home Assistant / ntfy / MQTT / Discord** — `tdm` has webhooks:

```bash
tdm config set webhooks.onClaim 'https://ntfy.sh/my-topic'
tdm config set webhooks.onClaim 'exec:/usr/local/bin/notify.sh {{game}} {{dropName}} {{channelLogin}}'
tdm config set webhooks.onClaim 'https://discord.com/api/webhooks/...'
```

Templating: `{{game}} {{dropName}} {{channelLogin}} {{dropId}} {{campaignId}}`. Get push notification when `Life Preserver Spray` gets claimed.

**4. Export + analyze** — `tdm history --export csv > history.csv` then chart minutes per game per day, optimize priority order with `tdm optimize --mode history` (reads your SQLite history to score games by availability vs your past efficiency). DB at `~/.local/state/tdm/history.db` (node:sqlite WAL, no native deps, JSONL fallback)

All user data stays at `~/.config/tdm/` + `~/.local/state/tdm/` (XDG), never uploaded.

### Troubleshooting

- **"Another tdm instance appears to be running"** – Only one miner can run at a time (lock file). If the previous run was **force-killed**, **crashed**, or didn’t exit cleanly, remove the lock and try again:  
  **Windows:** delete `%USERPROFILE%\.local\state\tdm\lock.file`  
  **Linux/macOS:** `rm -f ~/.local/state/tdm/lock.file`

## Versioning

This project follows [Semantic Versioning 2.0.0](https://semver.org) — `MAJOR.MINOR.PATCH`

- **MAJOR** — breaking CLI change or incompatible config change
- **MINOR** — new feature (new command, strategy, webhook) backwards-compatible
- **PATCH** — bugfix, parity fix with upstream DevilXD, docs/ops fix

We’re `0.y.z` initial development, so MINOR may include breaking-ish changes with notes in release.

Releases via Conventional Commits → release-please:

- `fix:` → PATCH (e.g., spade payload parity)
- `feat:` → MINOR (e.g., new `tdm optimize` mode)
- `feat!:` / `BREAKING CHANGE:` → MAJOR (or MINOR while `0.y.z`)

Tag `vX.Y.Z` triggers `npm publish` via OIDC trusted publisher with provenance (auto via `publishConfig`). Requires Node `>=22.14.0` per `engines`. Current: `0.6.1`

## Documentation

- **Wiki (user-facing, always current):** [Home](https://github.com/vocino/TwitchDropsMiner-CLI/wiki) — [Getting Started](https://github.com/vocino/TwitchDropsMiner-CLI/wiki/Getting-Started) · [Installation](https://github.com/vocino/TwitchDropsMiner-CLI/wiki/Installation) · [Authentication](https://github.com/vocino/TwitchDropsMiner-CLI/wiki/Authentication) · [Configuration](https://github.com/vocino/TwitchDropsMiner-CLI/wiki/Configuration) · [Running the Miner](https://github.com/vocino/TwitchDropsMiner-CLI/wiki/Running-the-Miner) · [Service Mode](https://github.com/vocino/TwitchDropsMiner-CLI/wiki/Service-Mode) · [Observability](https://github.com/vocino/TwitchDropsMiner-CLI/wiki/Observability) · [Strategy Engine](https://github.com/vocino/TwitchDropsMiner-CLI/wiki/Strategy-Engine) · [Homelab Integrations](https://github.com/vocino/TwitchDropsMiner-CLI/wiki/Homelab-Integrations) · [Architecture](https://github.com/vocino/TwitchDropsMiner-CLI/wiki/Architecture) · [Troubleshooting](https://github.com/vocino/TwitchDropsMiner-CLI/wiki/Troubleshooting) · [Development](https://github.com/vocino/TwitchDropsMiner-CLI/wiki/Development) · [FAQ](https://github.com/vocino/TwitchDropsMiner-CLI/wiki/FAQ)
- **Repo docs (source):** `docs/parity.md` + `docs/ops/*.md` — deep ops reference. Wiki is the front door; repo docs are the source for ops detail.
- **Wiki sync:** wiki sources live in `wiki/` and are pushed to `https://github.com/vocino/TwitchDropsMiner-CLI.wiki.git` (branch `master`) via `scripts/sync-wiki.sh` and `.github/workflows/wiki.yml` (on `push` to `main` when `wiki/**` or `docs/**` change, plus `workflow_dispatch`). When you update code or `docs/`, update `wiki/` in the same PR: `npm run wiki:sync -- --dry-run` to preview, `npm run wiki:sync` to push locally. See the [Development wiki page](https://github.com/vocino/TwitchDropsMiner-CLI/wiki/Development).

## Credits

This CLI is based on [**TwitchDropsMiner**](https://github.com/DevilXD/TwitchDropsMiner) by [DevilXD](https://github.com/DevilXD) — the original desktop app that mines Twitch drops without streaming video. TwitchDropsMiner-CLI reimplements its behavior (inventory, spade beacons, PubSub, game priority, auto-claim) for headless and server use.

