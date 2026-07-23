## Security Policy

### No Secrets in Repo

**This is a PUBLIC repo. Never commit secrets.**

The following must NEVER be committed:
- Twitch `auth.json` (accessToken), `device.json` (deviceId), `session.json`
- NPM tokens, GitHub PATs, API keys, private keys
- Slack/Discord webhooks
- Real LAN IPs (use generic 192.168.1.100 example)
- Real paths for NAS/Media, home dirs, 1Password refs

### How We Enforce

**Local (before push):**
- `oss-master-guard.sh` — runs on every push via automation
  - `oss-attribution-guard.sh` — no internal agent signals, author is vocino only
  - `oss-private-guard.sh` — no real LAN IPs, no NAS mounts, no Discord IDs
  - `oss-secrets-guard.sh` — detects tokens, API keys, private keys, webhooks, .env tracked

**CI (GitHub Actions):**
- `.github/workflows/security.yml` — same checks on PRs + main, plus npm audit

**Git:**
- `.gitignore` blocks `.env`, `auth.json`, `device.json`, `history.db`, `hooks.json`, `rules.json`, `session.json`, `*.key`, `*.pem`

### If You Accidentally Leak

1. Immediately revoke the secret (regenerate Twitch token, rotate npm token, delete PAT)
2. `git rm` file, commit, push
3. If pushed to public history, filter-branch/BFG + force push + purge cache

### Reporting

Contact travis@vocino.com for security issues. Do not open public issue for leaked credentials.

### Scope

- `auth.json` lives at `~/.config/tdm/auth.json` (XDG), not in repo
- `device.json` at `~/.local/state/tdm/device.json`
- History DB at `~/.local/state/tdm/history.db` (SQLite, gitignored)
- All user data stays local, never uploaded
