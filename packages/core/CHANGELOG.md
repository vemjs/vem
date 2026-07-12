# @vemjs/core

## 0.2.0

### Minor Changes

- 76ef0d5: Vim-parity pass: fixed Insert-mode Arrow/Home/End/PageUp/PageDown (previously no-ops), added dot-repeat (`.`), `f`/`F`/`t`/`T` find-char motions, `r{char}` replace, `*`/`#` whole-word search, the Vim `:set {option}!` toggle suffix, `:quit`/`:exit` as friendlier aliases for `:q`, and system-clipboard integration via `:set clipboard=unnamed`/`unnamedplus` (core exposes a pluggable `ClipboardProvider`; `renderer-vecto` wires in the browser Clipboard API). Also fixed the CommandBar's `:`/`/` prefix sitting on a different baseline than the typed command text.

## 0.1.13

### Patch Changes

- `ConfigLoader`'s theme/layout are now Vim's vimrc-style global options: they
  also update `VemEditorState`'s static defaults (`setDefaultTheme`/
  `setDefaultLayoutConfig`), so a buffer opened AFTER the config loads —
  another tab, a split, a file passed on a CLI — inherits it too. Previously a
  vemrc only ever touched the one state that happened to be active when it
  loaded; every subsequently opened buffer silently reverted to vem's built-in
  defaults.

## 0.1.12

### Patch Changes

- Vim-fidelity pass:

  - **core**: uppercase operators/motions (`D`, `C`, `Y`, `X`, `s`, `S`, `W`/`B`/`E`
    WORD motions, `^`, `%` bracket matching), a `/` search prompt with
    wrapscan `n`/`N` repeat.
  - **renderer-vecto**: command-line bar now uses the editor background (not the
    StatusLine highlight) and the `:`/`/` prefix sits flush against the typed
    text; exactly one pane is ever the "current window" (clicking a pane, or a
    fresh `:sp`/`:vsp`/`:help` split, updates both keyboard routing and which
    cursor renders solid — previously every split left every pane's cursor
    hollow until clicked); the INSERT-mode cursor is always a thin vertical bar
    regardless of focus, matching GUI Vim; Ctrl-D/U/F/B/E/Y/O now translate and
    preventDefault correctly on a pane's own a11y textarea (previously only the
    window-level router had the full table, so these leaked to the browser
    once a pane itself had focus); mouse wheel scrolls the viewport 3 lines per
    notch without moving the cursor (Vim's `mousescroll` default).

## 0.1.11

### Patch Changes

- Vim `mouse=a` groundwork: `setCursor` now extends the visual selection's active end while in VISUAL mode (the cursor is the active end in Vim), so pointer-driven cursor placement behaves like a motion.

## 0.1.10

### Patch Changes

- Vim-faithful defaults: `nonumber` is now the default (`:set number`/`nonumber`/`nu`/`nonu` toggle it, joining `rnu`); a `modified` flag + `shouldShowIntro()` gate the intro splash; the default theme matches Vim (near-black bg, grey LineNr, blue NonText, reverse StatusLine) with a new `VemTheme.nonText` color.

## 0.1.9

### Patch Changes

- eb1f231: Add Vim scroll motions Ctrl-D/U (half page), Ctrl-F/B (full page), and Ctrl-E/Y (line), so those keystrokes move the cursor instead of leaving the browser to hijack them (Ctrl-D bookmark, Ctrl-F find, …). Line counts are fixed approximations since core has no viewport model.

## 0.1.8

### Patch Changes

- a96c4af: Command-mode and macro improvements: backspacing over the empty `:` prompt now leaves COMMAND mode (Vim behavior) instead of trapping you until Escape; `:q!` force-quits and passes a `force` flag to quit handlers; `:wq`/`:x` save-then-quit; and full macro support — `q{reg}` … `q` records, `@{reg}` replays, `@@` repeats, exposed via `isRecording()`/`getRecordingRegister()`.

## 0.1.7

### Patch Changes

- 5cebaa1: Add `VemEditorState.registerGlobalExCommand(name, handler)` — editor-global ex commands (Vim semantics) that every state sees, including pane/tab states created later; handlers receive the argument text and the invoking state.

## 0.1.6

### Patch Changes

- 1426c10: Add an extensible ex-command layer: `registerExCommand(name, handler)` lets apps add commands like `:docs`/`:help`; unknown commands and options now surface Vim-style `E492`/`E518` feedback via the new transient `statusMessage` field (cleared on the next key); `:set relativenumber`/`rnu`/`norelativenumber`/`nornu` toggles the new `layoutConfig.lineNumbers` mode.

## 0.1.5

### Patch Changes

- 4203dae: Suppress Vite dynamic import analysis warnings for runtime-loaded Vem configuration modules.

## 0.1.4

### Patch Changes

- Add `setCommandText()` so renderers can synchronize command-line input through the core editor state.
- Limit published package contents to built `dist` files.

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
