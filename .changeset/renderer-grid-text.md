---
'@vemjs/renderer-vecto': patch
---

Draw the editor gutter and buffer text directly on the monospace character grid instead of flowing them through Text/RichText: paragraph-flow layout collapsed whitespace runs (indentation vanished, caret drifted from glyphs) and used a subtly different line advance than the caret/selection math (gutter numbers sank below their lines). Grid drawing also virtualizes to visible rows, re-measures charWidth once webfonts load, renders relative line numbers when `layoutConfig.lineNumbers` is `relative`, shows core statusMessage feedback in the status bar, and `splitPane`/`splitActivePane` accept `initialText` for Vim-style `:help` splits.
