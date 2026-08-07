# Installation

## Requirements

- **Node** `>=22.14.0` (engines field, provenance needs >=22.14, 24 recommended)
- Outbound **HTTPS** (`https://gql.twitch.tv`, `https://id.twitch.tv`, `https://spade.twitch.tv`) and **WSS** (`wss://pubsub-edge.twitch.tv`)
- ~30 MB disk + ~60 MB RAM while running; SQLite at `~/.local/state/tdm/history.db` (WAL)

## From npm (recommended)

```bash
npm install -g twitchdropsminer-cli
tdm doctor
```

Pin a version:

```bash
npm install -g twitchdropsminer-cli@0.6.1
```

## From GitHub (same CLI, no npm)

```bash
npm install -g github:vocino/TwitchDropsMiner-CLI
tdm doctor
```

## From source (dev / contribute)

```bash
git clone https://github.com/vocino/TwitchDropsMiner-CLI.git
cd TwitchDropsMiner-CLI
npm ci
npm run build
npx tdm doctor
npx tdm run --dry-run --verbose
npm test                  # node --test dist/tests/index.js (58+ tests)
```

## Platforms

| Platform | Notes |
|---|---|
| **Linux headless / server / NAS / VPS** | Primary target. Use `tdm service install --user`. See [[Service-Mode]]. |
| **Raspberry Pi (arm64)** | Node 24 arm64 works. `--metrics-port` optional. |
| **macOS** | Works — same commands; service = `launchd` manual or just `tdm run`. |
| **Windows** | Works under WSL2 (recommended) or native; service = Scheduled Task / NSSM. Stale lock at `%USERPROFILE%\\.local\\state\\tdm\\lock.file`. |
| **Docker** | No official image yet — `node:24-slim`, copy repo, `npm ci && npm run build`, `ENTRYPOINT ["node","dist/cli/index.js","run"]`, volume `~/.config/tdm` + `~/.local/state/tdm`. See [[FAQ#docker]]. |

## Verify the install

```bash
tdm --version
tdm doctor           # JSON: tdm doctor --json | jq
tdm doctor --json    # { checks: [...], parity, issues: [] }
```

`tdm doctor` checks: Node version, auth present, token validity (remote unless `--local-only`), GQL hash overrides shape, proxy URL if set, expected GQL ops count, parity report. Hook it into CI / install scripts — exit code 1 on issues.

## Updating

```bash
npm update -g twitchdropsminer-cli
# or pinned:
npm install -g twitchdropsminer-cli@latest
tdm --version
systemctl --user restart tdm   # if running as a service
```

Push-to-main also triggers the repo updater if you run from source (`git pull && npm run build`). Homelab auto-updates daily 06:00 via `tdm-auto-update` (fetch → build → restart).

## Uninstall

```bash
tdm service uninstall --user   # if installed
npm uninstall -g twitchdropsminer-cli
# optional: rm -rf ~/.config/tdm ~/.local/state/tdm
```

*Last synced: 0.6.1 — 2026-08-06*
