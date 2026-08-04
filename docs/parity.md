# Parity with DevilXD/TwitchDropsMiner

This document tracks parity status between CLI (0.2.x+) and Python upstream (DevilXD).

## GQL Operations — ✅ Complete (Phase 1)

| Op | Upstream hash | CLI hash | Status |
|---|---|---|---|
| Inventory | 8337eb... | 8337eb... | ✅ Synced 2026-07-30 |
| ViewerDropsDashboard (Campaigns) | d9cae7... | d9cae7... | ✅ Synced 2026-07-30 |
| DirectoryPage_Game (GameDirectory) | 86bcce... | 86bcce... | ✅ Was 76cb06 -> synced |
| DirectoryGameRedirect (SlugRedirect) | 1f0300... | 1f0300... | ✅ Added |
| VideoPlayerStreamInfoOverlayChannel (GetStreamInfo) | 198492... | 198492... | ✅ Added |
| PlaybackAccessToken | ed230a... | ed230a... | ✅ Added |
| DropsHighlightService_AvailableDrops | 782dad... | 782dad... | ✅ Added |
| DropCurrentSessionContext (CurrentDrop) | 4d06b7... | 4d06b7... | ✅ |
| DropsPage_ClaimDropRewards (ClaimDrop) | a455de... | a455de... | ✅ |
| DropCampaignDetails (CampaignDetails) | 039277... | 039277... | ✅ Added |
| ChannelPointsContext | 374314... | 374314... | ✅ Added (aux) |

All hash overrides supported via `config.gqlHashOverrides` for resilience when Twitch rotates hashes.

## Channel Discovery — ✅ Parity (Phase 2)

- Real slug via SlugRedirect GQL (not naive lowercasing)
- GameDirectory vars: limit 30, imageWidth 50, includeCostreaming false, options.includeRestricted SUB_ONLY_LIVE, sort RELEVANCE, requestID JIRA-VXP-2397 (matches upstream)
- MAX_CHANNELS 100 → 199 (8*50-2)/2 formula from DevilXD constants.py
- ACL bonus sorting preserved
- Bounded concurrency GameDirectory fetches (configurable via channelFetchConcurrency)

## Inventory & Drop Chains — ✅ Parity (Phase 3)

- `preconditionsMet` getter: all precondition drop IDs must be claimed (mirrors upstream `preconditions_met` property)
- `baseEarnConditions` requires preconditionsMet + benefits or precondition chain participation
- `canEarnWithin(stamp)` uses baseEarnConditions + ends_at > now + starts_at < stamp (upstream `_can_earn_within`)
- 24h post-campaign claim window verified and tested
- Chain tests: second drop blocked until first claimed

## Spade minute-watched — ✅ Parity (Phase 3)

Upstream payload:
```json
{
  "broadcast_id": "123",
  "channel_id": "456",
  "channel": "login",
  "client_time": "2024-...Z",
  "game": "WoW",
  "game_id": "12345",
  "hidden": false,
  "is_live": true,
  "live": true,
  "location": "channel",
  "logged_in": true,
  "minutes_logged": 1,
  "muted": false,
  "user_id": "789"
}
```

CLI now includes: game, game_id, client_time, is_live, minutes_logged (was missing before Phase 3). Also provides `buildSpadeGqlPayload()` gzip+b64 alternative mirroring `gql_payload` in channel.py, and `fetchStreamIdViaGql()` helper for real broadcast_id via GetStreamInfo.

- Stream ID from directory (node.id) used as broadcast_id fallback, with GQL GetStreamInfo available for higher fidelity.

## WebSocket Pool — ✅ Parity (Phase 4)

Upstream: `MAX_WEBSOCKETS = 8`, `WS_TOPICS_LIMIT = 50`, total 400 topics, 2 base topics (user-drop-events + onsite-notifications), 2 per channel (video-playback-by-id + broadcast-settings-update) = 199 channels.

CLI:
- Refactored `TwitchPubSub` into sharded pool of SingleSocket instances
- Auto creates new socket when current full (50 topics)
- Shrink pool when under-utilized (recycles topics)
- Supports both video-playback-by-id and broadcast-settings-update topics
- Helpers `buildChannelTopics()` and `getSocketCount()`, `getMaxChannels()` = 199

Tests: pool shards 60 topics into 2 sockets correctly.

## Auth & Hardening — ✅ Parity (Phase 5)

- Proxy: config `proxy` string wired via Undici ProxyAgent in httpClient + gqlClient (upstream uses aiohttp proxy param). WS proxy future via https-proxy-agent if installed.
- CaptchaRequired: detection via body containing captcha/CF challenge/client blocked 5023/5027, throws CaptchaRequiredError (mirrors DevilXD exceptions.CaptchaRequired)
- Device cache: persistent deviceId (32 hex) + sessionId (16 hex) in ~/.local/state/tdm/device.json, injected as X-Device-Id / Client-Session-Id headers (upstream unique_id cookie from twitch.tv page + session_id nonce)
- Doctor command: JSON mode, hash override validation, proxy URL check, GQL ops count sanity, parity report
- AvailableDrops: GQL op present (used for optional filtering; upstream AvailableDrops check optional)

## Ops — ✅ Improved (Phase 6)

- `tdm status --json`: pretty printed (2 space), includes watchedChannelId, updatedAt, sessionAgeMs, stale flag, parity block, verbose flag
- `tdm doctor --json`: structured issues/warnings/checks/parity
- Parity doc this file

## Remaining Gaps (future)

- ChannelPointsContext not actively used for points (low priority for drops mining)
- PlaybackAccessToken not yet used for hls URL generation (CLI doesn't play video, only minute-watched)
- AvailableDrops filtering per channel (optional AvailableDrops check) — implemented op but not yet auto-filtering channels when config.availableDropsCheck=true (needs per-channel GQL call, expensive)
- Image cache (not applicable to CLI)
- GUI tray/notifications (not applicable)

## Version mapping

- CLI 0.2.0 base: single WS, 5 GQL ops, old hash, no precondition chain check, basic spade
- After Phases 1-6 (0.2.0 + d41da55..af14161..): 11 GQL ops, 199 channels, 8x50 pool, chain-aware inventory, full spade payload, proxy/device/captcha, richer status/doctor
- CLI 0.6.0 (2026-08-03): 11 GQL ops synced 2026-07-30 (Inventory 8337eb.., Campaigns d9cae7..), strategy engine (calendar/optimize/simulate/rules), homelab glue (webhooks/export/sleep), observability (status/doctor/glance)
