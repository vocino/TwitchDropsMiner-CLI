# TwitchDropsMiner-CLI Wiki

Headless, npm-installable CLI rewrite of [DevilXD/TwitchDropsMiner](https://github.com/DevilXD/TwitchDropsMiner) — mine Twitch Drops on a server with no browser, no GPU, no video stream.

**Current:** `0.6.1` · Node `>=22.14.0` · GQL synced `2026-07-30` · Parity [[Architecture]] · [npm](https://www.npmjs.com/package/twitchdropsminer-cli) · [Main README](https://github.com/vocino/TwitchDropsMiner-CLI#readme)

---

### 60-second quick start

```bash
npm install -g twitchdropsminer-cli
tdm auth login --no-open     # prints URL + code — enter on another device
tdm auth validate
tdm games                    # list games with active Drops for your account
tdm games --add "Overwatch"  # exact name from the list
tdm run --verbose            # watch the logs tick
```

Leave it running or install as a service: `tdm service install --user --autostart && tdm service start`

---

### Where to go next

| You want to… | Read |
|---|---|
| Install on a headless box / Pi / NAS / VPS | [[Installation]] |
| Log in without a browser on the server | [[Authentication]] |
| Pick games, priority, proxy, hashes | [[Configuration]] |
| Understand what `tdm run` actually does | [[Running-the-Miner]] |
| Keep it alive after SSH closes | [[Service-Mode]] |
| Watch progress, history, Prometheus | [[Observability]] |
| Plan which Drops to farm first | [[Strategy-Engine]] |
| Ping Discord / ntfy / HA when a drop claims | [[Homelab-Integrations]] |
| How it works under the hood | [[Architecture]] |
| Fix “stale lock”, “no channels”, 401, GQL 400 | [[Troubleshooting]] |
| Ship a fix, bump version, publish | [[Development]] |
| Quick answers | [[FAQ]] |

---

### How mining works (one paragraph)

Inventory (GQL) -> filter wanted games (`priority` + `priorityMode`) -> GameDirectory per wanted game (live, drops-enabled channels, viewer-sorted) -> pick top channel -> minute-watched beacons to Twitch spade (no video) -> PubSub `user-drop-events` + `CurrentDrop` GQL keep minutes in sync -> auto-claim via `ClaimDrop` GQL within the 24h window -> hourly inventory refresh + campaign timers drive rotation. Details: [[Running-the-Miner]] and [[Architecture]].

### Wiki vs repo docs

- **Wiki (here)** — user-facing, hand-edited, always current. This is the front door.
- **Repo `docs/`** — source docs (`parity.md`, `ops/*.md`) kept in sync via automation — see [[Development]].
- **When you change code or `docs/`**, update the matching wiki page in the same PR. A `wiki.yml` workflow can auto-sync `wiki/` -> `*.wiki.git`.

*Last synced: 0.6.1 — 2026-08-06*
