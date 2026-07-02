---
'@vemjs/core': patch
'@vemjs/renderer-vecto': patch
---

feat(config): add browser-compatible configuration evaluation and pane splits keybindings inheritance

- Expose `getCustomKeybindings()` in `VemEditorState` to query custom keymap bindings
- Inherit custom keybindings when performing pane splits inside `WorkspaceLayout`
- Implement `loadConfigFromJsString` in `ConfigLoader` utilizing browser-native Object URL dynamic imports
- Expose `onDidOpenDirectory` hook in `WorkspaceExplorer` to capture directory handle loaded events
