---
'@vemjs/core': minor
'@vemjs/renderer-vecto': minor
---

Fix a batch of vem.run UX and correctness bugs, plus expose new APIs for the web build's persistence layer:

- **Long lines no longer hide the cursor.** `VemEditorEntity` had vertical scroll-to-cursor but no horizontal equivalent — a line longer than the viewport rendered the cursor off-screen. Added `scrollX` mirroring `scrollY`, applied consistently to text, selection, diagnostics, and the cursor itself, matching Vim's default sidescroll behavior.
- **`:q` on a modified buffer now warns instead of silently discarding edits** (`E37: No write since last change (add ! to override)`), matching real Vim. `:q!`/`:quit!`/`:exit!` force it. `:w` now correctly clears the modified flag (it never did before, which would have made every future `:q` show E37 even right after a successful save).
- **Opening a file replaces a pristine "untitled" buffer in place** instead of stacking a new tab next to an empty one nobody asked to keep — matches `:e` in a fresh Vim session. New `VemWorkspace.isActiveBufferPristine()` API backs this.
- **`WorkspaceExplorer.closeWorkspace()`**: once a folder was opened there was no way to open a different one — the Dir/File buttons were removed and nothing ever restored them. Adds a "Close" button next to the file tree that returns to the picker buttons and drops stale file handles.
- **Square Dir/File buttons** instead of the old wide "Open Folder"/"Open File" pills.
- New `VemWorkspace.getBuffersSnapshot()`/`restoreBuffersSnapshot()` for a host app (like vem-website) to persist open buffers across a page reload — the web build has no backing filesystem to reopen from, so a refresh previously wiped all unsaved work.
