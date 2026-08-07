# Observability

Every minute is counted locally. Four ways to watch.

## 1. CLI — status, drops, history, watch

```bash
tdm status                 # human — watching, sessionAge, parity 199
tdm status --json | jq
tdm status --verbose       # + session file path, device id
tdm drops                  # remaining, progress %, canClaim, precondMet
tdm drops --claimable
tdm drops --game Overwatch
tdm drops --json | jq

tdm history --summary      # ticks per game/channel, time range
tdm history --last 50
tdm history --paths        # db path + backend (sqlite/jsonl)
tdm history --prune-days 30
tdm history --export csv   # CSV for your own analysis

tdm watch                  # live TUI — polls session + history + metrics (2s)
tdm watch --interval 5

tdm doctor --json | jq     # structured checks/parity/issues
tdm healthcheck --json     # minimal machine ping
```

DB: `~/.local/state/tdm/history.db` — SQLite WAL via `node:sqlite` builtin, JSONL fallback. See `src/ops/history.ts`.

## 2. Metrics server (Prometheus + Glance)

Run the miner with the server on:

```bash
tdm run --metrics-port 9098 --metrics-host 0.0.0.0
```

Endpoints:

| Path | What it returns |
|---|---|
| `GET /` or `/health` | JSON summary: `watchingChannelLogin`, `watchingGame`, `minutesPerGame`, `watchingChannelId`, `minutesPerChannel`, `claimedTotal`, `eligibleCampaigns`, `campaignsTotal`, `pubsubConnected`, `uptimeSeconds`, `version`, plus `watchTicksTotal` / `watchErrorsTotal` / `channelSwitchesTotal` / `inventoryFetchTotal` |
| `GET /status` | `health` + `activeDrop`, `wantedGames`, `channelsCount`, `state` — merged for Glance |
| `GET /drops` | Top active drops `[{game,name,progress,remaining,required,canClaim}]` sorted claimable-first |
| `GET /metrics` | Prometheus text exposition `twitch_drops_*` |

Try it:

```bash
curl -s http://127.0.0.1:9098/health | jq
curl -s http://127.0.0.1:9098/drops  | jq
# [{"game":"Overwatch","name":"EWC Diamond","progress":0.75,"remaining":182,"required":720,"canClaim":false}]
curl -s http://127.0.0.1:9098/metrics | grep twitch_drops_watching
# twitch_drops_watching{channel="warn",channel_id="53648099",game="Overwatch"} 1
```

Prometheus metrics (registry `src/ops/metrics.ts:MetricsRegistry`):

- `twitch_drops_watching` (gauge `1` when watching, labels `channel,channel_id,game`)
- `twitch_drops_minutes_total` (counter-ish gauge, label `game`)
- `twitch_drops_minutes_total_per_channel` (counter, label `channel`)
- `twitch_drops_campaigns_total`, `twitch_drops_eligible_campaigns`
- `twitch_drops_claimed_total`, `twitch_drops_watch_ticks_total` (labels `channel,game`), `twitch_drops_watch_errors_total`, `twitch_drops_channel_switches_total`, `twitch_drops_inventory_fetch_total`
- `twitch_drops_pubsub_connected` (0/1), `twitch_drops_up` (1), `twitch_drops_info` (label `version`)

### Prometheus scrape

```yaml
scrape_configs:
  - job_name: tdm
    static_configs:
      - targets: ['127.0.0.1:9098']
```

PromQL: `twitch_drops_watching`, `twitch_drops_minutes_total`, `twitch_drops_claimed_total`, `increase(twitch_drops_watch_ticks_total[1h])`.

### Glance widget

TDM exposes `/status` + `/drops` so [glanceapp/glance](https://github.com/glanceapp/glance) `custom-api` widgets can render a live card with Go templates. Full styled example with progress bars at `docs/examples/glance-tdm-widget.yml`:

```yaml
- type: custom-api
  title: 🎮 Twitch Drops Miner
  cache: 15s
  url: http://127.0.0.1:9098/status
  template: |
    {{ $s := .JSON }}
    {{ $watching := $s.String "watchingChannelLogin" }}
    {{ $game := $s.String "watchingGame" }}
    {{ $dropsReq := newRequest "http://127.0.0.1:9098/drops" | getResponse }}
    {{ $drops := $dropsReq.JSON.Array "" }}
    <div class="flex flex-column gap-12">
      {{ if ne $watching "" }}<div>WATCHING {{ $watching }} · {{ $game }}</div>{{ end }}
      {{ range $drops }}<div>{{ .String "name" }} — {{ .Int "remaining" }}m left ({{ printf "%.0f" (mul (.Float "progress") 100) }}%)</div>{{ end }}
    </div>
```

## 3. Webhooks & export

```bash
tdm hooks --json
tdm export --what history --format csv --limit 1000
tdm export --what metrics --format prometheus
tdm export --what drops --format json
```

Webhooks (`config.webhooks.*`) fire on claim/progress/channel-switch/error — URL or `exec:` target, templates `{{game}} {{dropName}} {{channelLogin}} {{dropId}} {{campaignId}}`. See [[Homelab-Integrations]].

## 4. Files on disk

```
~/.local/state/tdm/history.db      # SQLite WAL — `tdm history --paths` shows which backend
~/.local/state/tdm/device.json     # X-Device-Id
~/.config/tdm/config.json          # user config
~/.config/tdm/auth.json            # token
```

`tdm doctor --json` also exposes parity and stale-state warnings.

*Last synced: 0.6.1 — 2026-08-06*
