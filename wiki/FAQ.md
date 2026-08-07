# FAQ

**Do I need to stream or watch video?**
No — TDM sends minute-watched beacons to `spade.twitch.tv` (or GQL). No video pipeline, no GPU.

**Will I get banned?**
This reimplements the same GQL + spade + PubSub the upstream Python miner uses, which has been used widely. Use your own risk tolerance — Twitch ToS can change. TDM never shares credentials.

**Python miner vs this CLI?**
Upstream is Python + GUI (desktop). This is a headless TypeScript port for servers: same inventory chains, same spade payload (`game, game_id, client_time, is_live, minutes_logged`), same 199-channel pool, plus `calendar/optimize/simulate/rules`, webhooks, history DB, `/metrics`. Parity: [[Architecture]] and repo `docs/parity.md`.

**I set `priority` but nothing watches.**
Empty or misspelled `priority` → idle. Names must exactly match `tdm games` (casing, punctuation). Link accounts at [twitch.tv/drops/campaigns](https://www.twitch.tv/drops/campaigns) so more games appear. Check [[Troubleshooting#no-channel-candidates]].

**How many games at once?**
One channel at a time. `priority` is a fallthrough list — try game 1, then 2, etc. Special IRL games (IDs 509663, 509672) can earn watching any game.

**How long until minutes show on Twitch?**
1–3 minutes. Verify at [twitch.tv/drops/inventory](https://www.twitch.tv/drops/inventory) while running `tdm run --verbose` (look for `Watch tick sent`).

**What about claims?**
Auto-claimed via `ClaimDrop` GQL when eligible, within the 24h post-campaign window. `tdm drops --claimable` + webhooks `onClaim` + [[Homelab-Integrations]].

**How do I run it on boot?**
`tdm service install --user --autostart && tdm service start`. See [[Service-Mode]].

**Metrics & dashboards?**
`tdm run --metrics-port 9098 --metrics-host 0.0.0.0` → `/health`, `/status`, `/drops`, `/metrics`. Prometheus + Glance widget documented at [[Observability]].

**Proxy?**
`tdm config set proxy 'http://user:pass@host:port'` — Undici `ProxyAgent` for HTTP/GQL; WS proxy via `https-proxy-agent` if installed. See [[Configuration]].

**Docker?**
No official image yet — `node:24-slim`, `npm ci && npm run build`, `ENTRYPOINT ["node","dist/cli/index.js","run"]`, mount `~/.config/tdm` and `~/.local/state/tdm` as volumes, expose `9098` if you want metrics.

**Node version?**
`>=22.14.0` (engines). 24 recommended for provenance.

**Can I farm multiple Twitch accounts?**
Run separate OS users or containers, each with its own `~/.config/tdm/` (XDG per user / volume per container).

**Where is the code / how accurate is this wiki?**
Main repo: [vocino/TwitchDropsMiner-CLI](https://github.com/vocino/TwitchDropsMiner-CLI). This wiki is rebuilt from that repo on each release — footer shows the last sync. If wiki and repo disagree, the repo is the source of truth — open an issue.

*Last synced: 0.6.1 — 2026-08-06*
