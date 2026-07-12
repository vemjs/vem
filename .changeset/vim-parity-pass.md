---
'@vemjs/core': minor
'@vemjs/renderer-vecto': minor
---

Vim-parity pass: fixed Insert-mode Arrow/Home/End/PageUp/PageDown (previously no-ops), added dot-repeat (`.`), `f`/`F`/`t`/`T` find-char motions, `r{char}` replace, `*`/`#` whole-word search, the Vim `:set {option}!` toggle suffix, `:quit`/`:exit` as friendlier aliases for `:q`, and system-clipboard integration via `:set clipboard=unnamed`/`unnamedplus` (core exposes a pluggable `ClipboardProvider`; `renderer-vecto` wires in the browser Clipboard API). Also fixed the CommandBar's `:`/`/` prefix sitting on a different baseline than the typed command text.
