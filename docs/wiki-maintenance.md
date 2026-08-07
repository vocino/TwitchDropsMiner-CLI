# Wiki Maintenance

GitHub wikis are a separate git repo at `https://github.com/vocino/TwitchDropsMiner-CLI.wiki.git` (branch `master`). This project uses it as the user-facing front door. Repo `docs/` is source for parity/ops docs; wiki pages are hand-edited but auto-synced for certain pages.

## Structure

- Wiki repo (`/tmp/tdm-wiki` when cloned): 14+ pages + `CLI-Reference.md`
  - Hand-edited: `Home.md`, `Getting-Started.md`, `Installation.md`, `Authentication.md`, `Configuration.md`, `Running-the-Miner.md`, `Service-Mode.md`, `Observability.md`, `Strategy-Engine.md`, `Homelab-Integrations.md`, `Architecture.md`, `Troubleshooting.md`, `Development.md`, `FAQ.md`, `_Sidebar.md`, `_Footer.md`
  - Auto-generated: `CLI-Reference.md` (grouped Core / Auth / Config & Games / Service & Logs / Observability / Strategy / Other)
  - `_Sidebar.md` organizes Start Here / Core Usage / Observability / Power Features / Reference
  - `_Footer.md` shared footer

- Main repo:
  - `src/cli/commands/*.ts` — 16 files → 19 top-level commands via `src/cli/index.ts`
  - `src/config/schema.ts` — zod config shape → [[Configuration]]
  - `src/integrations/gqlOperations.ts` — 11 GQL ops + hashes → [[Architecture]]
  - `scripts/generate-wiki-reference.js` — minimal no-deps generator for CLI-Reference.md
  - `docs/wiki-maintenance.md` — this file
  - `.github/workflows/wiki.yml` — automation

## How to edit wiki

Local edit (preferred for multi-page changes):

```bash
# first time
git clone https://github.com/vocino/TwitchDropsMiner-CLI.wiki.git /tmp/tdm-wiki
cd /tmp/tdm-wiki
# edit
vim CLI-Reference.md Home.md _Sidebar.md
git diff
git add CLI-Reference.md Home.md _Sidebar.md
git -c user.name="Travis Vocino" -c user.email="travis@vocino.com" commit -m "docs(wiki): update CLI reference and sidebar for 0.6.1"
git push origin master
```

GitHub UI: edit page → Preview → Save. Ok for single-page typos but loses atomic multi-page grouping.

Repo docs overlay: if you add `docs/wiki/*.md`, `wiki.yml` copies them into `wiki/` on next push to `main`. Use for curated sync (e.g., parity table).

## Automation — `wiki.yml`

Trigger:

- `push` to `main` when `src/cli/**`, `src/config/schema.ts`, `src/integrations/gqlOperations.ts`, `docs/**`, `README.md`, `scripts/generate-wiki-reference.js`, `scripts/generate-wiki.sh`, `.github/workflows/wiki.yml` change
- `workflow_dispatch` (manual)

Behavior:

1. Checkout main repo (`actions/checkout@v4` depth 0)
2. Checkout wiki repo (`vocino/TwitchDropsMiner-CLI.wiki` @ `master` path `wiki`) using `secrets.WIKI_PAT || secrets.GITHUB_TOKEN`
   - `WIKI_PAT` needs `repo` scope classic PAT — GITHUB_TOKEN can push to wiki only if Settings → Actions → Workflow permissions = Read and write
3. `npm ci --ignore-scripts` (fallback `npm install`)
4. Regenerate CLI-Reference.md: `node scripts/generate-wiki-reference.js > /tmp/CLI-Reference.md.new`, diff vs `wiki/CLI-Reference.md`, copy only if changed
5. Sync `docs/wiki/*.md` overlays if present, bump `Home.md` `*Last synced: VERSION — DATE*` token
6. Commit as `Travis Vocino <travis@vocino.com>` with message `docs(wiki): sync CLI-Reference and overlays for $VERSION [skip ci]`
   - Skips if no diff (`git diff --quiet`)
   - Does NOT blindly overwrite hand-edited pages — only CLI-Reference.md + overlays + Last synced stamp
   - Push with retry (pull --rebase on conflict)

Why not overwrite all pages? Wiki has hand-written narratives (e.g., [[Running-the-Miner]] 64 lines). Auto-overwrite would destroy craft. Guard it.

## When to update manually vs auto

- Auto: new CLI flags (`src/cli/commands/*` → CLI-Reference), new config keys (`schema.ts` → Configuration manually though — generator only sketches), GQL hash sync (Architecture), version bump (Home Last synced)
- Manual: narrative changes, new examples, troubleshooting tips, homelab webhook shapes, strategy-engine behavior, installation platforms — edit wiki page same PR as code.

## Best practices for GitHub wikis

- Use `[[Page]]` and `[[Page#anchor]]` for cross-links — GitHub wiki syntax, not `[Page](Page.md)`. Keep sidebar `[[Link]]` only.
- Keep pages <150 lines where possible, code blocks with `bash` language.
- Each page top: `# Title` + one-line purpose.
- Footer: `*Last synced: VERSION — DATE*`.
- Sidebar sections: Start Here / Core Usage / Observability / Power Features / Reference — matches user journey (install → run → observe → optimize → deep-dive).
- Keep `CLI-Reference.md` grouped (Core / Auth / Config & Games / Service & Logs / Observability / Strategy / Other) not alphabetical — task-oriented.
- Link back to repo files (`src/...`) with relative context so readers can locate.
- Single source for auth file permissions (`600`), XDG paths, Node version.
- Don't commit `node_modules`, lock.file, device.json.

## Versioning

- Current: `0.6.1` (2026-08-07)
- GQL synced: `2026-07-30`
- Parity: [[Architecture]] + `docs/parity.md`
- When bumping `package.json` version: update Home.md Current + Last synced, update CLI-Reference.md Last synced, sidebar if new commands, and let wiki.yml re-sync on push.

## Troubleshooting wiki push

- `403` — missing `WIKI_PAT` or workflow permissions need Read and write; create classic PAT (repo) in GitHub Settings → Developer → Tokens, save as repo secret `WIKI_PAT`
- `master` not found — wiki's default branch is `master` not `main`; use `ref: master` always
- Empty commit — check `git status --porcelain` in wiki dir before commit — generator may have no diff
- Link break — GitHub wiki is case-sensitive on filenames but links are `[[CLI-Reference]]` without `.md`. Ensure file exists exactly `CLI-Reference.md`

*Last synced: 0.6.1 — 2026-08-07*
