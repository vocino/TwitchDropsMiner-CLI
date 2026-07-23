## Security Policy

### No Secrets in Repo

**This is a PUBLIC repo. Never commit secrets.**

The following must NEVER be committed:
- Twitch `auth.json` (accessToken), `device.json` (deviceId), `session.json`
- NPM tokens `_authToken`, GitHub PATs `ghp_`, `github_pat_`
- API keys, private keys `BEGIN PRIVATE KEY`, Slack/Discord webhooks
- Real LAN IPs (192.168.6.98, 192.168.5.161, etc — use `192.168.1.100` generic example)
- Real paths `/mnt/nas`, `/home/zeta`, 1Password refs `op://`

### How We Enforce

**Local (before push):**
- `~/.hermes/scripts/oss-master-guard.sh` — runs on every push via automation
  - `oss-attribution-guard.sh` — no internal agent signals, author is vocino only
  - `oss-private-guard.sh` — no real LAN IPs, no /mnt/nas, no Discord IDs, no 1P vault IDs
  - `oss-secrets-guard.sh` — detects `ghp_`, `github_pat_`, `npm_`, `AKIA`, private keys, `Bearer`, slack/discord webhooks, `.env` tracked, `auth.json` tracked

**CI (GitHub Actions):**
- `.github/workflows/security.yml` — same checks on PRs + main, plus `npm audit --audit-level=high` and `git ls-files` for secret files

**Git:**
- `.gitignore` blocks `.env`, `auth.json`, `device.json`, `history.db`, `hooks.json`, `rules.json`, `session.json`, `*.key`, `*.pem`

### If You Accidentally Leak

1. Immediately revoke the secret (regenerate Twitch token, rotate npm token, delete PAT)
2. `git rm` file, commit, push
3. If pushed to public history, `git filter-branch` or `BFG Repo-Cleaner` + force push + GitHub support to purge cache

### Reporting

Contact travis@vocino.com for security issues. Do not open public issue for leaked credentials.

### Scope

- `auth.json` lives at `~/.config/tdm/auth.json` (XDG), not in repo
- `device.json` at `~/.local/state/tdm/device.json`
- History DB at `~/.local/state/tdm/history.db` (SQLite, gitignored)
- All user data stays local, never uploaded
