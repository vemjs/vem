# @vemjs/core

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
