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

License MIT.
