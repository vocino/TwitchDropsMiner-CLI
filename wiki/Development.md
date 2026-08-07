# Development

## Environment

```bash
git clone https://github.com/vocino/TwitchDropsMiner-CLI.git
cd TwitchDropsMiner-CLI
npm ci
npm run build
npx tdm doctor
npm test                  # tsc + node --test dist/tests/index.js (58+)
npx tdm run --dry-run --verbose
```

- Node `>=22.14.0` (engines). Provenance needs this floor.
- Upstream: `https://github.com/DevilXD/TwitchDropsMiner` (remote `upstream`), hashes + `SPECIAL_GAME_IDS` + spade parity tracked via `docs/parity.md` and daily fetch to `/tmp/upstream-pyminer`.

## Branch & commits

- **Main is the release branch** — push to `main` publishes (see below). Feature branches → PR → squash/merge.
- **Conventional Commits + release-please:** `fix:` → PATCH, `feat:` → MINOR, `feat!:` / `BREAKING CHANGE:` → MAJOR (MINOR while `0.y.z`). Tag `vX.Y.Z` also publishes.
- **Identity:** `Travis Vocino <travis@vocino.com>` — `.mailmap` enforces it; no AI attribution trailers in public commits.
- **Guard before every push:** `~/.hermes/scripts/oss-master-guard.sh <repo>` — blocks `192.168.4/5/6.x`, `op://`, `ghp_`, `~/.hermes`, etc. CI `security.yml` re-scans PRs.

## Testing

```bash
npm test
npm run build
node --test dist/tests/index.js           # run directly
node --test dist/tests/parity/*.js        # parity only
```

Units at `src/tests/unit`, parity at `src/tests/parity`, integration at `src/tests/integration`. Parity tests pin spade payload shape, inventory chains, `MAX_CHANNELS=199`, and GQL hash expectations.

## Version & publish

Releases via `.github/workflows/publish.yml`:

- **Triggers:** `push` to `tags v*` (`v0.6.1` → `0.6.1`) or `workflow_dispatch`. Push to `main` does not auto-publish unless the version was bumped and not yet published — `skip-if-same-version` guard (`npm view` check).
- **Provenance + OIDC:** `publishConfig.provenance: true`, `permissions: id-token: write`, trusted publisher configured on npmjs.com (`vocino`, `TwitchDropsMiner-CLI`, workflow filename `publish.yml`).
- **Fallback:** `NPM_TOKEN` (Granular Publish on `twitchdropsminer-cli`) if OIDC fails — dual `npm publish` attempt with clear `EOTP` remediation logs.
- **Engines guard:** `engines.node >=22.14` — `setup-node@6` uses `node-version: 24`.

Bumping:

```bash
npm version patch   # or minor / major — updates package.json + tag vX.Y.Z
git push --follow-tags
# or: gh workflow run "Publish to npm"
```

Current: `0.6.1`.

## Auto-update (homelab)

Example homelab two-loop setup:

- **`tdm-auto-update` daily 06:00** (`no_agent`, `tdm-auto-update.sh` v3) — `fetch origin`, fast-forward `main`, `npx tsc --outDir dist`, `rsync dist/` → npm-global, detached `systemd-run` restart, probes `/health` + `/metrics` + `tdm doctor --json`. Silent unless drift.
- **`tdm-active-dev` daily 10:00** (LLM, `tdm-dev-loop.sh` gatherer → `/tmp/tdm-dev-loop-health-*.json`) — audits logs/metrics/doctor, checks parity (hashes, `SPECIAL_GAME_IDS`, `MAX_CHANNELS`, ACL, PubSub), codes fix, tests 58+, guard → push `main` → restart → verify. The active-dev loop for this repo — other repos offloaded separately.

## Wiki sync

**Rule from V (2026-08-06):** wiki is the user-facing front door — when anything updates, update the wiki to match. Repo `docs/` stays the source of truth for some pages (`parity.md`, `ops/*.md`) and the wiki is the readable edition.

Best practices (GitHub wiki = a separate git repo at `https://github.com/vocino/TwitchDropsMiner-CLI.wiki.git`, branch `master`, markdown only):

- Pages are `*.md` at repo root — `Home.md` is the landing; `_Sidebar.md` and `_Footer.md` are special (sidebar + footer). Link with `[[Page-Name]]` or `[[Label|Page-Name]]` — filename is `Page-Name.md` (hyphens, not spaces).
- Keep wiki edits **in the same PR** as the code/`docs/` change they document. Don’t let the wiki lag main.
- Option A (manual, fine for now): clone wiki → edit → commit as `Travis Vocino` → push `master`.

  ```bash
  git clone https://github.com/vocino/TwitchDropsMiner-CLI.wiki.git /tmp/tdm-wiki
  # edit Home.md etc.
  git -C /tmp/tdm-wiki add -A && git -C /tmp/tdm-wiki commit -m "docs(wiki): sync ..."
  git -C /tmp/tdm-wiki push origin master
  ```

- Option B (automation — wiring below): keep wiki sources in repo `wiki/*.md` and let `.github/workflows/wiki.yml` push to `*.wiki.git` on changes to `wiki/**` or `docs/**`. So a docs PR auto-updates the live wiki without a second clone.

### Amendment — optimal development (from V)

V asks for a **clear procedure for efficient development going forward** and for the wiki **to be easy to keep correct**. The recipe:

1. Treat `wiki/*.md` + `docs/*.md` as a single docs PR — one branch, one commit message `docs(wiki): ...` that touches both.
2. Let `wiki.yml` sync to `*.wiki.git` automatically — never edit the wiki repo directly except for hot-fixes.
3. Add a `wiki:check` CI job that fails if `wiki/` and `docs/parity.md` drift (hash table mismatch) or if pages are missing.
4. Keep wiki pages short and command-first — the wiki is onboarding; `docs/ops/*.md` is deep ops. Cross-link, don’t duplicate.

*Last synced: 0.6.1 — 2026-08-06*
