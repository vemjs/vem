---
'@vemjs/renderer-vecto': patch
---

Tabs are now buffers with stable ids and file-name labels, closable via the × affordance (and virtualized/scrollable when many are open) — closing a middle tab no longer renumbers survivors, `:q` on an unsplit pane closes its tab, and the last tab resets to empty instead of vanishing. The sidebar gains an "Open File" button (single-file open, not just folders) and `toggleSidebar()`/`setSidebarVisible()`. Files open in tabs labeled with their name and wire `:w` to write back to disk; the file tree shows material-style per-extension icons (via the new `fileIcon()` helper and `TreeNode.iconColor`). A macro recording indicator shows in the status bar.
