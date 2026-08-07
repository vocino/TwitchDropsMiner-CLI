# Strategy Engine

Plan what to farm — CLI-only superpowers beyond the Python GUI.

All three commands read live inventory + your history; they need a valid login (`tdm auth validate`) but do not require the miner to be running.

## Calendar — what’s ending soon

```bash
tdm calendar                 # next 14 days, human
tdm calendar --days 30
tdm calendar --active        # only currently earnable
tdm calendar --upcoming      # not yet started
tdm calendar --json | jq
```

Shows campaign, game, drop names, required minutes, start/end, time remaining — so you can queue short drops before they expire.

## Optimize — what order to farm

```bash
tdm optimize                 # history mode (default) — scores by your past efficiency + scarcity
tdm optimize --mode ending_soonest
tdm optimize --mode low_avbl_first
tdm optimize --json | jq
```

- `history` — reads `~/.local/state/tdm/history.db` to score games you actually get channels for.
- `ending_soonest` — expiring campaigns first.
- `low_avbl_first` — campaigns with few live drops-enabled channels first.

Apply the suggestion:

```bash
tdm optimize --json | jq -r '.priority'
tdm config set priority '["Game A","Game B"]'
```

## Simulate — will I finish in time?

```bash
tdm simulate                 # 24h horizon
tdm simulate --hours 72
tdm simulate --json | jq
```

Predicts completions given current `priority` + estimated channel counts — answers “if I farm 72h on this order, which drops complete?”.

## Rules — local prioritization

```bash
tdm rules                    # list
tdm rules --add 'viewers < 100 => skip'
tdm rules --add 'game == "Overwatch" => boost'
tdm rules --remove 0
tdm rules --clear
tdm rules --json | jq
```

Stored at `~/.config/tdm/rules.json`. Evaluated locally against channel candidates before picking — see `src/cli/commands/rules.ts` and `src/core/channelService.ts`.

## Recipe

```bash
tdm calendar --days 7
tdm optimize                  # pick the top suggestion
tdm simulate --hours 48       # sanity-check
tdm config set priority '["...","..."]'
systemctl --user restart tdm
tdm drops --game "Top Game"
```

*Last synced: 0.6.1 — 2026-08-06*
