# @vemjs/plugin-api

## 0.1.11

### Patch Changes

- Updated dependencies [6eb5c20]
  - @vemjs/core@0.7.0

## 0.1.10

### Patch Changes

- Updated dependencies
  - @vemjs/core@0.6.0

## 0.1.9

### Patch Changes

- Updated dependencies [99d4703]
- Updated dependencies [cfe0e76]
  - @vemjs/core@0.5.0

## 0.1.8

### Patch Changes

- Updated dependencies [9ea701f]
  - @vemjs/core@0.4.0

## 0.1.7

### Patch Changes

- 7476fbd: Plugin-architecture fixes from the 2026-07-16 audit. `@vemjs/core`: new static `VemEditorState.onDidCreateState(cb)` hook (fires for every state construction — splits, new tabs, snapshot restores — so hosts can attach per-state services like the plugin registry; returns an unsubscribe, cleared by `resetDefaults`) and `executePluginCommand` is now public (command palettes no longer need to reach into the private callback list). `@vemjs/plugin-api`: `PluginRegistry.register()` is idempotent (re-invocation can no longer stack duplicate buffer/mode/save listeners), new `has(name)`, and the registry accepts optional `PluginHostCapabilities` (`openFile`, `gitDiff`) surfaced on the plugin context — plugins must treat them as absent-able. `@vemjs/renderer-vecto`: `VemWorkspace.onLastTabClose(cb)` notifies hosts after the final tab closes and the workspace has self-reset, letting the desktop build exit like Vim's `:q` while the web build keeps the splash.
- Updated dependencies [7476fbd]
  - @vemjs/core@0.3.1

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
