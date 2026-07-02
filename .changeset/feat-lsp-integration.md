---
'@vemjs/core': minor
'@vemjs/lsp-client': minor
---

feat(lsp): implement JSON-RPC 2.0 client, document sync, diagnostics & completion

- Add `JsonRpcClient` — JSON-RPC 2.0 engine over WebSocket with pending-Map request/response correlation and notification dispatch
- Add `LSPClient` — full LSP lifecycle (initialize handshake, textDocument/didOpen, didChange, didClose, completion, hover, publishDiagnostics bridging)
- Add `Diagnostic` / `DiagnosticSeverity` types to `@vemjs/core`
- Add `VemEditorState.setDiagnostics()`, `getDiagnostics()`, `onPublishDiagnostics()` API
- Add `VemEditorState.getText()` public buffer content accessor
