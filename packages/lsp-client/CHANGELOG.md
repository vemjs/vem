# @vemjs/lsp-client

## 0.2.0 (unreleased)

### Minor Changes

- Add `JsonRpcClient` — JSON-RPC 2.0 engine over WebSocket with pending-Map correlation and notification dispatch
- Add `LSPClient` — full LSP lifecycle: initialize handshake, textDocument/didOpen, didChange, didClose, completion, hover, publishDiagnostics
- Wire `VemEditorState` events to automatic document sync
- Bridge `publishDiagnostics` notifications to `VemEditorState.setDiagnostics()`

## 0.1.0

### Features

- Initial `LSPClient` stub with WebSocket connect and completion request placeholders
