# @vemjs/plugin-api

## 0.1.6

### Patch Changes

- Updated dependencies [ec10976]
  - @vemjs/core@0.3.0

## 0.1.5

### Patch Changes

- Updated dependencies [76ef0d5]
  - @vemjs/core@0.2.0

## 0.1.4

### Patch Changes

- Limit published package contents to built `dist` files.
- Updated dependencies
  - @vemjs/core@0.1.4

## 0.1.3

### Patch Changes

- fix: update workspace dependencies to standard registry versions in package.json files
- Updated dependencies
  - @vemjs/core@0.1.3

## 0.1.2

### Patch Changes

- 02d5968: fix: replace workspace protocol references with exact versions on npm publish
- Updated dependencies [02d5968]
  - @vemjs/core@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [f5ccf66]
  - @vemjs/core@0.1.1

## 0.1.0

### Patch Changes

- 0498765: chore: release infrastructure, package metadata, and documentation scaffolding

  This changeset covers all release preparation work for the initial 0.1.0 publish:

  **Package metadata** — Added `license`, `repository`, `keywords`, and `publishConfig` fields to
  all four packages so they display correctly on npmjs.com with proper source links, license badges,
  and searchable tags.

  **CI/CD pipeline** — Rewrote `.github/workflows/ci.yml` and `release.yml`:

  - `quality` job: build → test → lint (oxlint) → dead-code scan (knip) on every PR and push
  - `publish` job: automatic `changeset publish` to npm on every merge to `main` via
    `changesets/action@v1` using the `NPM_TOKEN` org secret

  **Changesets** — Initialized `.changeset/` with a `config.json` configured for public access and
  patch-level internal dependency updates, enabling a fully automated release flow.

  **Tooling** — Added `knip.config.ts` (dead-code detection), `oxlintrc.json` (TypeScript-aware
  lint rules), `.lintstagedrc.json` (auto-fix staged files on commit), and updated root
  `package.json` scripts: `build`, `test`, `lint`, `knip`, `changeset`, `version-packages`,
  `release`.

  **Dependabot** — Configured weekly npm dependency scanning with dev/prod groups and
  `@vectojs/*` major-version pin to avoid upstream breaking changes.

  **Repository** — Updated root `README.md` with CI/npm/license badges and package table.
  Updated `SECURITY.md` with all four `@vemjs/*` packages and coordinated-disclosure guidance.
  Added GitHub topics (vim, editor, typescript, vectojs, canvas, modal-editing, lsp) and branch
  protection requiring the `quality` status check before merging to `main`.

  **Build hygiene** — Cleaned all `dist/` directories and rebuilt from source to ensure no
  test artefacts are included in published tarballs. Verified `knip` reports zero issues.

- Updated dependencies [0498765]
- Updated dependencies [3fa4848]
  - @vemjs/core@0.2.0

### Features

- `PluginRegistry` — plugin activation lifecycle manager
- `PluginContext` — plugin SDK: `registerKeybinding`, `registerCommand`, `onDidOpenBuffer`, `onDidChangeBuffer`, `onDidChangeMode`
- Chord-based custom keybinding with prefix-match buffering and Vim-native keystroke replay fallback
