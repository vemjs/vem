---
'@vemjs/renderer-vecto': patch
---

Update VectoJS runtime dependencies to `@vectojs/core` ^1.0.1 / `@vectojs/ui` ^1.1.2 (post-rebrand scope), align renderer scene lifecycle with embedded canvas teardown, fix `:vsp`/`:sp` split orientation being inverted, fix stale pane-map entries leaving the surviving pane unresponsive after closing a split, and add `WorkspaceLayout.refreshActivePane()` so externally driven state mutations (e.g. an app-level keydown handler) actually repaint instead of silently mutating state with no visible change.
