---
'@vemjs/core': patch
'@vemjs/plugin-api': patch
'@vemjs/renderer-vecto': patch
---

Plugin-architecture fixes from the 2026-07-16 audit. `@vemjs/core`: new static `VemEditorState.onDidCreateState(cb)` hook (fires for every state construction — splits, new tabs, snapshot restores — so hosts can attach per-state services like the plugin registry; returns an unsubscribe, cleared by `resetDefaults`) and `executePluginCommand` is now public (command palettes no longer need to reach into the private callback list). `@vemjs/plugin-api`: `PluginRegistry.register()` is idempotent (re-invocation can no longer stack duplicate buffer/mode/save listeners), new `has(name)`, and the registry accepts optional `PluginHostCapabilities` (`openFile`, `gitDiff`) surfaced on the plugin context — plugins must treat them as absent-able. `@vemjs/renderer-vecto`: `VemWorkspace.onLastTabClose(cb)` notifies hosts after the final tab closes and the workspace has self-reset, letting the desktop build exit like Vim's `:q` while the web build keeps the splash.
