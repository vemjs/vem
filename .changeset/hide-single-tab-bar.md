---
'@vemjs/renderer-vecto': patch
---

A lone buffer no longer shows a tab bar: `VemWorkspace` opts into `@vectojs/ui` 1.9.5's `autoHideTabBar` (Vim `showtabline=1` semantics), so a fresh start renders only the intro splash — like `vim` with no arguments — and the bar appears once a second buffer opens. Layout heights follow the live bar height via `effectiveTabBarHeight`. Engine floors raised to `@vectojs/core@^1.9.2` / `@vectojs/ui@^1.9.5`.
