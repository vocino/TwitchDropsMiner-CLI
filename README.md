# TwitchDropsMiner-CLI

Headless, npm-installable CLI rewrite of TwitchDropsMiner for Linux server operation.

## Install

**Global install** (puts `tdm` on your PATH):

```bash
npm install -g twitchdropsminer-cli
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

### Troubleshooting

- **"Another tdm instance appears to be running"** – Only one miner can run at a time (lock file). If the previous run was **force-killed**, **crashed**, or didn’t exit cleanly, remove the lock and try again:  
  **Windows:** delete `%USERPROFILE%\.local\state\tdm\lock.file`  
  **Linux/macOS:** `rm -f ~/.local/state/tdm/lock.file`

