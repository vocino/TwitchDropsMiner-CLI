# Getting Started

The path from zero to farming. Five minutes.

## 1. Install

```bash
npm install -g twitchdropsminer-cli
tdm --version          # 0.6.1
tdm doctor             # env + auth + GQL sanity — run this first
```

Requires Node `>=22.14.0`. No Python, no GUI. See [[Installation]] for Pi / Docker / from-source.

## 2. Log in (headless)

Your server has no browser — device-code flow handles it:

```bash
tdm auth login --no-open
# verification_uri=https://www.twitch.tv/activate
# user_code=ABCD-EFGH
# interval=5
```

Open the URL **on another device** (phone/laptop already logged into Twitch), enter the code, authorize, then on the server:

```bash
tdm auth validate        # Remote validation — prints user id on success
tdm auth export          # redacted env dump; --show-secrets to reveal
```

No browser on the server is ever opened. Alternatives: `tdm auth import --token-file`, `tdm auth import-cookie --cookie-file`. Details: [[Authentication]].

Already farming with the Python GUI? You can export its `auth-token` and import it — same Twitch account, same drops. See [[Authentication#import-from-the-python-miner]].

## 3. Choose which games to mine

The miner only watches games you explicitly list. List what Twitch offers **your** account right now:

```bash
tdm games
tdm games --json | jq   # structured, exact names in .[].name
```

Copy an **exact name** and add it:

```bash
tdm games --add "Overwatch"
tdm games --add "Marvel Rivals"
tdm config get          # see priority array
```

Or set it directly:

```bash
tdm config set priority '["Overwatch", "Marvel Rivals"]'
```

> If `priority` is empty, the miner has no wanted games and will idle — `tdm games` will remind you. Link game accounts at [twitch.tv/drops/campaigns](https://www.twitch.tv/drops/campaigns) so more games appear.

Tuning: `priorityMode` (`priority_only` | `ending_soonest` | `low_avbl_first`), `exclude`, `availableDropsCheck`. See [[Configuration]].

## 4. Dry run, then live

```bash
tdm run --dry-run --verbose   # logs “Would send watch / Would claim”, no POST
# stop with Ctrl+C
tdm run --verbose             # live — sends spade beacons + claims
```

What you should see in verbose: inventory fetch, wanted games, channel fetch, selected channel, `Watch tick sent`, PubSub connected. See [[Running-the-Miner]].

**Stopping:** `Ctrl+C` (SIGINT) or `tdm service stop` / `systemctl --user stop tdm` (SIGTERM) — graceful, removes lock. Only `rm ~/.local/state/tdm/lock.file` if the process was `kill -9` / crashed / power-loss (stale lock). See [[Troubleshooting#stale-lock]].

## 5. Stay alive after SSH closes

```bash
tdm service install --user --autostart   # writes ~/.config/systemd/user/tdm.service
tdm service start
tdm service status
tdm logs --follow
# Metrics while running:
curl -s http://127.0.0.1:9098/health | jq   # if run with --metrics-port 9098
```

Want Prometheus / Glance / Discord ping on claim? See [[Service-Mode]] and [[Homelab-Integrations]].

## 6. Check you are progressing

- Browser → [Twitch Drops Inventory](https://www.twitch.tv/drops/inventory) (same account) → minutes should tick up within 2–3 minutes.
- `tdm drops` — claimable, remaining, preconditions.
- `tdm status --json | jq` — watching channel, session age.
- `tdm history --summary` — per game/channel tick totals.

Validation playbook: [[Development]] / repo `docs/ops/drops-validation.md`.

## Next

- Pick precise wanted games — [[Configuration]]
- Keep it running — [[Service-Mode]]
- Watch dashboards — [[Observability]]
- Optimize order — [[Strategy-Engine]]

*Last synced: 0.6.1 — 2026-08-06*
