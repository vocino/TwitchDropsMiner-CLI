# TwitchDropsMiner-CLI

Headless CLI that mines Twitch Drops on a server. No browser, no video, no GPU.

## Install

Docker — no Node on host (recommended for homelab / NAS):

```bash
curl -fsSL https://raw.githubusercontent.com/vocino/TwitchDropsMiner-CLI/main/docker-compose.yml -o docker-compose.yml
docker compose run --rm tdm auth login --no-open   # URL + code, enter on phone
docker compose up -d
```

Update: `docker compose pull && docker compose up -d` — `:latest` rebuilds on every push to main.

npm:

```bash
npm install -g twitchdropsminer-cli
tdm doctor
```

From source:

```bash
git clone https://github.com/vocino/TwitchDropsMiner-CLI.git
cd TwitchDropsMiner-CLI
npm ci && npm run build
npx tdm doctor
```

Requires Node `>=22.14.0`.

## Auth — bring your own Twitch app

Twitch deactivated the shared first-party client IDs for new authorizations,
so every user registers their own application. No project credentials are
shipped or needed — yours stay in your local `~/.config/tdm/` files only.

```bash
# 1. Register at https://dev.twitch.tv/console/apps
#    Name: anything, Redirect: http://localhost:3000, Category: Other
# 2. Store your app's credentials (secret stays local, never committed):
tdm config set oauthClientId <your-client-id>
tdm config set oauthClientSecret <your-client-secret>   # omit for public apps
# 3. Log in with your own app:
tdm auth login --no-open   # prints URL + code, enter on phone
tdm auth validate
```

Notes (verified 2026-09-22): Twitch's drops endpoints additionally enforce a
client integrity check that no currently obtainable token passes — neither
fresh third-party app tokens (resolve as anonymous) nor first-party
device/browser tokens (reads and watch heartbeats work; catalog, details, and
claims fail the check). So the miner currently runs watch-only: progress
accrues to your account, claim finished drops by hand on twitch.tv.
`tdm auth import --token <token>` from a logged-in browser session is the
current auth source. If Twitch relaxes this, your own app's token flows
through automatically via the stored client binding.

## Use

```bash
tdm auth login --no-open   # prints URL + code, enter on phone
tdm auth validate
tdm games                  # list games with active Drops
tdm games --add "Overwatch"
tdm run --verbose
```

Keep alive:

```bash
tdm service install --user --autostart
tdm service start
tdm logs --follow
```

Docker: `docker compose logs -f`

Check progress:

```bash
tdm status
tdm drops
tdm history --summary
```

## What this does

Inventory -> wanted games (priority) -> live channels per game -> pick channel -> minute-watched beacons to spade.twitch.tv -> PubSub + CurrentDrop in sync -> auto-claim 24h window. No video stream, ever.

Extra: `calendar` / `optimize` / `simulate` / `rules` for planning, `hooks` / `export` for homelab (ntfy, Discord, HA, Prometheus), `watch` for TUI.

Full docs in the wiki — that's the manual now.

## Docs

All user docs live in the wiki: https://github.com/vocino/TwitchDropsMiner-CLI/wiki

- Start here: https://github.com/vocino/TwitchDropsMiner-CLI/wiki/Getting-Started
- Every command: https://github.com/vocino/TwitchDropsMiner-CLI/wiki/CLI-Reference
- Config, Service, Observability, Troubleshooting, Architecture — all in the wiki sidebar.

This README stays minimal on purpose. If wiki and README disagree, wiki wins.

## What's inside

```
src/cli/            commands (run, auth, status, config, games, doctor, service, history, metrics, drops, watch, hooks/export, calendar/optimize/simulate, rules)
src/core/           miner, watchLoop 59s tick, channelService, stateMachine, maintenance
src/integrations/   gqlClient, gqlOperations 12 ops, twitchPubSub pool 8*50->199, twitchSpade beacon
src/domain/         inventory chains, channel
src/config/         zod schema, XDG store 600
src/state/          authStore, deviceStore, sessionState
examples/           glance-tdm-widget.yml, docker-compose.yml
Dockerfile          multi-stage node:22-alpine, non-root
```

## Develop

```bash
npm test            # tsc + node --test dist/tests/index.js
npm run build
```

Wiki lives in its own git: `https://github.com/vocino/TwitchDropsMiner-CLI.wiki.git` (branch `master`). Edit it directly.

## Credits

Original idea from [DevilXD/TwitchDropsMiner](https://github.com/DevilXD/TwitchDropsMiner). This is an independent TypeScript rewrite for headless server use — different codebase, same Drop-mining concept.

If the miner earns its keep, you can [sponsor the project](https://github.com/sponsors/vocino).

License MIT.
