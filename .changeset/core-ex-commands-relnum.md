---
'@vemjs/core': patch
---

Add an extensible ex-command layer: `registerExCommand(name, handler)` lets apps add commands like `:docs`/`:help`; unknown commands and options now surface Vim-style `E492`/`E518` feedback via the new transient `statusMessage` field (cleared on the next key); `:set relativenumber`/`rnu`/`norelativenumber`/`nornu` toggles the new `layoutConfig.lineNumbers` mode.
