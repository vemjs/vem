# Changelog

Vem is a monorepo. **Per-package, machine-generated changelogs are the source of truth:**

- [`@vemjs/core`](./packages/core/CHANGELOG.md)
- [`@vemjs/renderer-vecto`](./packages/renderer-vecto/CHANGELOG.md)
- [`@vemjs/lsp-client`](./packages/lsp-client/CHANGELOG.md)
- [`@vemjs/plugin-api`](./packages/plugin-api/CHANGELOG.md)

This file keeps a curated, high-level history. Versioning follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) via
[Changesets](https://github.com/changesets/changesets).

---

## Highlights

### 0.1.0 — 2026-07-02

Initial development milestone. All packages are pre-release (`0.x`).

#### `@vemjs/core`

- **Vim state machine engine** — Full modal editing with NORMAL / INSERT / VISUAL / COMMAND modes, cursor motions (`h j k l w b e W B E`), operators (`d y c`), text objects (`iw aw i" a"` …), `x`, `r`, `~`, `J`, yank/paste registers, `u`/`<C-r>` undo-redo stack.
- **`VimBuffer`** — Line-level buffer with `insertText`, `deleteRange`, `deleteLines`, `setLine`, and reactive `onChange` callbacks used by all downstream consumers.
- **Plugin event hooks** — `onDidOpenBuffer`, `onDidChangeBuffer`, `onDidChangeMode`, `onExecutePluginCommand` callbacks enabling zero-coupling plugin integration.
- **Diagnostics API** — `setDiagnostics()` / `getDiagnostics()` / `onPublishDiagnostics()` supporting LSP error/warning highlighting.
- **`ConfigLoader`** — Dynamic ESM config file loader (`~/.config/vem/vemrc.ts`) for programmatic keybinding and plugin registration.
- **`getText()`** — Public buffer content accessor for LSP document sync.

#### `@vemjs/renderer-vecto`

- **`VemEditorEntity`** — Zero-DOM canvas text editor rendering with line numbers, cursor blink, VISUAL mode selection highlights, scroll, syntax-token colouring stubs, and gutter.
- **`CommandBar`** — VectoUI `Input`-based command palette bound to `:w`, `:q`, `:vsp`, `:sp`.
- **`WorkspaceLayout`** — Resizable `PanelGroup` / `Panel` split panes (vertical + horizontal).
- **`VemWorkspace`** — Tabbed multi-file workspace using VectoUI `Tabs`.
- **`WorkspaceExplorer`** — Full-screen layout: sidebar `TreeView` file picker + `WorkspaceLayout` editor area, `showDirectoryPicker` File System Access API integration, lazy directory expansion, folder-first sort.
- **`FileSystemHandler`** — Recursive directory handle mapper with `TreeNode` lazy expansion.

#### `@vemjs/lsp-client`

- **`JsonRpcClient`** — JSON-RPC 2.0 protocol engine over WebSocket with request/response pending-Map correlation, fire-and-forget notifications, and notification listener dispatch.
- **`LSPClient`** — Full LSP lifecycle: `initialize` handshake, `textDocument/didOpen` + `didChange` + `didClose` document sync wired to `VemEditorState` events, `textDocument/completion` autocomplete requests, `textDocument/hover`, and `textDocument/publishDiagnostics` → `VemEditorState.setDiagnostics()` bridging.

#### `@vemjs/plugin-api`

- **`PluginRegistry`** — Plugin activation lifecycle manager.
- **`PluginContext`** — Plugin SDK: `registerKeybinding`, `registerCommand`, `onDidOpenBuffer`, `onDidChangeBuffer`, `onDidChangeMode` hooks.
- Chord-based custom keybinding with prefix-match buffering and Vim-native keystroke replay fallback.
