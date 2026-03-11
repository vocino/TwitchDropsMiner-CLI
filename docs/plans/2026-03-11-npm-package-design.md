# NPM Packaging & Distribution Design

**Goal:** Make `twitchdropsminer-cli` installable directly from npm (`npm install -g twitchdropsminer-cli`) with a reliable CLI entrypoint and minimal, correct package contents.

**Architecture:** Use a standard npm CLI package layout with a built `dist/cli/index.js` as the `bin` target. Ensure `prepublishOnly` builds TypeScript before publish, restrict published files via the `files` field, and keep the CLI as the primary surface (library APIs are out of scope for now).

**Tech Stack:** Node.js >= 20, TypeScript, npm registry, Commander-based CLI.

---

### Packaging Behavior
- Package name remains `twitchdropsminer-cli` (unscoped, public).
- `bin.tdm` points at `dist/cli/index.js`, which already has a `#!/usr/bin/env node` shebang and uses ES modules.
- `type: "module"` is kept; `dist` output continues to be ESM and executed by Node 20+.
- `main` is kept as `dist/cli/index.js` for now (even though this is CLI-first) to avoid breaking any direct programmatic uses.

### Publish-Time Build & Contents
- Add a `prepublishOnly` script that runs `npm run build` so the `dist` folder is always present when publishing.
- Keep a narrow `files` whitelist so only `dist`, `docs/ops`, and `resources/systemd` ship to npm.
- Ensure README and license live at the repo root (npm includes them automatically; no extra config needed).

### Install & Usage Flow
- After publish, global install becomes:
  - `npm install -g twitchdropsminer-cli`
  - `tdm doctor` / `tdm run` etc.
- README is updated to prefer the npm registry install, keeping the GitHub install path as an alternative.

### Out of Scope
- No additional exports or library API surface for now.
- No changes to CLI command structure or behavior; this is a packaging-only change.
