---
'@vemjs/core': minor
---

**Batch 2 of Vim-native features:**

- INSERT mode: Ctrl-w (delete word back), Ctrl-u (delete line back), Ctrl-t/Ctrl-d (indent/outdent), Ctrl-r (insert register), Ctrl-n/Ctrl-p (word completion)
- <C-w> window commands: h/j/k/l (navigate), q (close), o (only), v (vertical split), s (horizontal split)
- g-prefix: g; (older change), g, (newer change), gu/gU (lowercase/uppercase), gJ (join without space)
- Motion: ge (go backward to end of previous word)
- z-prefix: z. (center cursor line), z- (bottom cursor line), z<CR> (top cursor line)
- Operators: > (indent), < (outdent)
- Change list tracking for g;/g,
