# @vemjs/lsp-client

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

- Updated dependencies [0498765]
- Updated dependencies [3fa4848]
  - @vemjs/core@0.2.0

## 0.2.0 (unreleased)

### Minor Changes

- Add `JsonRpcClient` — JSON-RPC 2.0 engine over WebSocket with pending-Map correlation and notification dispatch
- Add `LSPClient` — full LSP lifecycle: initialize handshake, textDocument/didOpen, didChange, didClose, completion, hover, publishDiagnostics
- Wire `VemEditorState` events to automatic document sync
- Bridge `publishDiagnostics` notifications to `VemEditorState.setDiagnostics()`

## 0.1.0

### Features

- Initial `LSPClient` stub with WebSocket connect and completion request placeholders
