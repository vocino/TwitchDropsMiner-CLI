# Homelab Integrations

TDM was built for homelabs — webhooks, Prometheus, Glance, and export for everything else.

## Webhooks — push on claim / progress / switch / error

In `~/.config/tdm/config.json` (`tdm config get`) set URLs or `exec:` commands. CLI:

```bash
tdm hooks                    # list configured hooks
tdm hooks --json | jq
```

Raw config keys (`config.webhooks` in `src/config/schema.ts`):

- `onClaim` — drop claimed
- `onProgress` — minute tick / progress bump
- `onChannelSwitch` — channel changed
- `onError` — tick/GQL error

Each value is a URL or `exec:` command with templates:

```
{{game}} {{dropName}} {{channelLogin}} {{channelId}} {{dropId}} {{campaignId}}
```

Examples:

```bash
tdm config set webhooks.onClaim 'https://ntfy.sh/my-topic'
tdm config set webhooks.onClaim 'https://discord.com/api/webhooks/ID/TOKEN'
tdm config set webhooks.onClaim 'exec:/usr/local/bin/notify.sh {{game}} {{dropName}} {{channelLogin}}'
tdm config set webhooks.onError  'exec:/usr/local/bin/page.sh {{game}} error'
```

Test with dry-run: `tdm run --dry-run --verbose` logs `Would fire webhook onClaim`.

### ntfy

Any `https://ntfy.sh/...` URL works — TDM POSTs a JSON payload with drop detail. Subscribe on your phone.

### Discord

Paste a webhook URL — rich claim ping with game/drop/channel. Keep the URL secret (redacted in `tdm hooks` unless `--show-secrets`).

### Home Assistant

HA `rest_command` or `webhook` trigger — point `onClaim` at HA’s webhook URL. Add an automation on `dropName` to flash lights, etc.

### exec:

`exec:/path/to/script arg {{template}}` — runs locally on the miner host. Use for MQTT (`mosquitto_pub`), Gotify, email, custom glue. Stdout/stderr logged via `src/ops/webhooks.ts`.

## Prometheus → Grafana

Scrape `http://host:9098/metrics` — see [[Observability#2-metrics-server-prometheus--glance]] for metric names and PromQL snippets.

## Glance dashboard

Live card with watching channel, per-drop progress bars, remaining minutes — see [[Observability#glance-widget]] and `docs/examples/glance-tdm-widget.yml`.

## Export → your own analysis

```bash
tdm export --what history  --format csv  --limit 1000 > history.csv
tdm export --what metrics  --format prometheus
tdm export --what drops    --format json | jq
tdm export --what all      --format json | jq
```

`--what all` merges history + drops + metrics. Pipe to `jq`, pandas, Sheets, whatever.

*Last synced: 0.6.1 — 2026-08-06*
