---
'@vemjs/renderer-vecto': patch
---

Fix the command-line `:` prefix rendering taller than the typed command in the Tauri (WebKitGTK) build. The prefix used `bold 14px monospace` while the input uses `14px monospace`; WebKitGTK synthesizes bold monospace with different metrics, so the glyphs didn't line up. The prefix now uses the exact same font as the input — which also matches Vim, whose command line is plain Normal text.
