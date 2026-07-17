---
'@vemjs/core': patch
---

Implement `:s`/`:%s` substitute command with `/pattern/replacement/flags` syntax.
Supports `g` (global), `i` (case-insensitive) flags, and Vim-style backreferences
(`$1`..`$9`, `$&`, `$``, `$'`).
