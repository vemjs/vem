---
'@vemjs/core': patch
---

Add Vim scroll motions Ctrl-D/U (half page), Ctrl-F/B (full page), and Ctrl-E/Y (line), so those keystrokes move the cursor instead of leaving the browser to hijack them (Ctrl-D bookmark, Ctrl-F find, …). Line counts are fixed approximations since core has no viewport model.
