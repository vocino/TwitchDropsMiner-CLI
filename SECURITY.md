## Security Policy

### No secrets in repo

This is a PUBLIC repo. Never commit secrets.

Never commit:
- Twitch auth tokens, device IDs, session files (`auth.json`, `device.json`)
- Package registry tokens, GitHub PATs, API keys, private keys
- Webhooks (Slack, Discord)
- Real internal IPs or infrastructure paths
- Password or credential manager references

### How we enforce

Local - before push, dev machine only:
- Local guard scripts — run automatically on every push in autonomous loop
  - Checks for secret tokens, private infrastructure references, internal signals
  - Real private values live **only** in local guard scripts outside any repo
  - Public repo never contains actual private values

CI - public, in this repo:
- `.github/workflows/security.yml` - generic scans only
  - No private values in workflow file — only checks for common leak categories
  - Real private checks stay local, not in CI, to avoid leaking via the check itself
- Dependency audit `npm audit --audit-level=high`

**Git:**
- `.gitignore` blocks sensitive files — they live in XDG state/config dirs, not repo

### Why public CI doesn't list private values

Listing private IPs/paths in a public `security.yml` to scan for them is itself a leak.
So:
- Public CI: generic patterns only (e.g., subnet detection, token formats)
- Local guards (outside repo, not committed): specific values for your homelab

### If you accidentally leak

1. Immediately revoke the secret (regenerate token, rotate credential)
2. `git rm` file, commit, push
3. If pushed to public history, use `BFG Repo-Cleaner` + force push + purge cache

### Reporting

Contact travis@vocino.com for security issues. Do not open public issue for leaked credentials.

### Scope

- Auth lives in XDG config dir, not repo
- Device ID in XDG state dir
- History DB (SQLite) gitignored
- All user data stays local, never uploaded
