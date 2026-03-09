# Drops validation playbook

This playbook helps confirm that the CLI actually advances and claims Twitch Drops as intended, without opening a browser stream.

## Prerequisites

- A Twitch account (test account recommended).
- CLI installed and built: `npm run build`.
- Auth completed: `tdm auth login --no-open` (or paste token when prompted).

## 1. Configure for a single game

- Choose an active Drops campaign with a **short first drop** (e.g. 15–30 minutes) so you can see progress quickly.
- In config (e.g. `~/.config/tdm/config.json` or project `tdm.config.json`), set:
  - `priority`: `["<Game Name>"]` (exact game name from the campaign).
  - `priorityMode`: `"priority_only"` so only that game is mined.
  - `exclude`: `[]` (or leave default).

## 2. Dry run (no network writes)

- Run with dry-run and verbose to see intended actions only:
  ```bash
  tdm run --dry-run --verbose
  ```
- Confirm logs show:
  - Inventory fetch and campaign list.
  - Wanted games = your priority game.
  - Channel fetch and selected channel.
  - “Would send watch” (no real spade POST).
  - “Would claim” for any claimable drop (no real ClaimDrop GQL).
- Stop with Ctrl+C.

## 3. Live run and Twitch Inventory check

- In a browser, open [Twitch Drops Inventory](https://www.twitch.tv/drops/inventory) and log in with the same account.
- Note the current “minutes watched” (and “Claim” button if the drop is ready) for the target campaign.
- Start the miner:
  ```bash
  tdm run --verbose
  ```
- Let it run for at least one watch interval (about 1 minute). You should see “Watch tick sent for channel …” in the logs.
- Refresh the Twitch Inventory page: “minutes watched” for the active drop should increase (may take 1–2 minutes to reflect).
- If the drop becomes claimable, the CLI should auto-claim; check logs for “Claimed drop” and confirm the drop shows as claimed in the Inventory.

## 4. Compare with Python miner (optional)

- Using the same Twitch account and same priority game:
  - Run the Python TwitchDropsMiner and note progression/claim time.
  - Run the CLI with the same config and note progression/claim time.
- Progression and claim times should be comparable (allow for Twitch-side variance).

## 5. Status command

- While the miner is running (or after it has run), in another terminal:
  ```bash
  tdm status
  tdm status --json
  ```
- Confirm `state` (e.g. WATCHING or MAINTENANCE) and `activeDrop` (e.g. “Game Name: Drop Name”) look correct.

## Success criteria

- With a test account and active drops campaign:
  - `tdm run` increases “minutes watched” for the targeted drop on Twitch Inventory without opening a stream in the browser.
  - Drops are claimed automatically when eligible (or a manual step is documented).
  - `tdm run --dry-run --verbose` logs intended watch and claim actions without performing spade/claim network calls.
  - `tdm status` shows a sensible state and active drop.

## Troubleshooting

- **No channels / “No channel candidates”**: Ensure the game has live streams with Drops enabled; try a different game or relax `priorityMode`.
- **Watch tick failed**: Spade URL extraction or auth may be failing; run with `--verbose` and check logs.
- **Minutes not updating**: Twitch can delay updates; wait 2–3 minutes and refresh the Inventory page. Ensure you’re watching a channel that has Drops for that campaign.
