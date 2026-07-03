# @vemjs/core

## 0.1.3

### Patch Changes

- fix: update workspace dependencies to standard registry versions in package.json files

## 0.1.2

### Patch Changes

- 02d5968: fix: replace workspace protocol references with exact versions on npm publish

## 0.1.1

### Patch Changes

- f5ccf66: feat(config): add browser-compatible configuration evaluation and pane splits keybindings inheritance

  - Expose `getCustomKeybindings()` in `VemEditorState` to query custom keymap bindings
  - Inherit custom keybindings when performing pane splits inside `WorkspaceLayout`
  - Implement `loadConfigFromJsString` in `ConfigLoader` utilizing browser-native Object URL dynamic imports
  - Expose `onDidOpenDirectory` hook in `WorkspaceExplorer` to capture directory handle loaded events

## 0.2.0

### Minor Changes

- 3fa4848: feat(lsp): implement JSON-RPC 2.0 client, document sync, diagnostics & completion

  - Add `JsonRpcClient` — JSON-RPC 2.0 engine over WebSocket with pending-Map request/response correlation and notification dispatch
  - Add `LSPClient` — full LSP lifecycle (initialize handshake, textDocument/didOpen, didChange, didClose, completion, hover, publishDiagnostics bridging)
  - Add `Diagnostic` / `DiagnosticSeverity` types to `@vemjs/core`
  - Add `VemEditorState.setDiagnostics()`, `getDiagnostics()`, `onPublishDiagnostics()` API
  - Add `VemEditorState.getText()` public buffer content accessor

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

## 0.2.0 (unreleased)

### Minor Changes

- Add `Diagnostic` / `DiagnosticSeverity` types
- Add `VemEditorState.setDiagnostics()`, `getDiagnostics()`, `onPublishDiagnostics()` for LSP diagnostic bridging
- Add `VemEditorState.getText()` public buffer content accessor

## 0.1.0

### Features

- Full Vim state machine: NORMAL / INSERT / VISUAL / COMMAND modes
- Cursor motions: `h j k l w b e W B E 0 ^ $ gg G`
- Operators: `d y c` + counts + text objects (`iw aw i" a"` etc.)
- `x`, `r`, `~`, `J`, yank/paste registers, `u` / `<C-r>` undo-redo
- `VimBuffer` with reactive `onChange` callbacks
- Plugin event hooks: `onDidOpenBuffer`, `onDidChangeBuffer`, `onDidChangeMode`
- Custom keybinding registration with chord prefix-match + Vim keystroke replay fallback
- `ConfigLoader` for dynamic ESM config file loading
