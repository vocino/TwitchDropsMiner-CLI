# TwitchDropsMiner-CLI

Headless, npm-installable CLI rewrite of TwitchDropsMiner for Linux server operation.

## Install

```bash
npm install -g twitchdropsminer-cli
tdm doctor
```

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

## Run miner

```bash
tdm run
tdm run --verbose
tdm run --dry-run --verbose   # log actions only; no spade/claim network writes
```

### How it mines drops

1. **Inventory** – Fetches your in-progress campaigns and drop state via Twitch GQL.
2. **Wanted games** – From config `priority`, `exclude`, and `priorityMode` (e.g. `priority_only`, `ending_soonest`).
3. **Channels** – Fetches live channels per game (GameDirectory GQL), filters by drops-enabled and wanted game, orders by priority and viewers.
4. **Watch simulation** – Sends “minute-watched” beacons to Twitch’s spade endpoint for the selected channel (no video stream).
5. **Progress** – PubSub user-drop-events and optional CurrentDrop GQL keep drop minutes in sync; stream-state topics trigger channel refresh.
6. **Claims** – Eligible drops are claimed automatically via ClaimDrop GQL (24h post-campaign window).
7. **Maintenance** – Hourly inventory refresh and campaign time triggers (start/end) drive channel cleanup and re-fetch.

Config keys that affect mining: `priority` (game names), `exclude`, `priorityMode`, `enableBadgesEmotes`. See `docs/ops/drops-validation.md` for validation steps.

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

