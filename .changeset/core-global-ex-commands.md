---
'@vemjs/core': patch
---

Add `VemEditorState.registerGlobalExCommand(name, handler)` — editor-global ex commands (Vim semantics) that every state sees, including pane/tab states created later; handlers receive the argument text and the invoking state.
