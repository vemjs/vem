---
'@vemjs/renderer-vecto': patch
---

Fix two interaction bugs from the 2026-07-16 audit:

- Split panes now re-layout when the workspace box changes: `WorkspaceLayout`
  calls `PanelGroup.resize()` instead of writing width/height bare, so
  opening the Explorer/PluginLab or resizing the window after `:vsp`/`:sp`
  no longer leaves panes at stale sizes overflowing off-screen.
- Mouse clicks land on the character cell containing the pointer (Vim
  mouse=a semantics): the x→column mapping used `Math.round`, sending
  right-half clicks one cell to the right; it now floors and clamps at 0.
