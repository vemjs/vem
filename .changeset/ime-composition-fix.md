---
'@vemjs/renderer-vecto': patch
---

Fix IME input (Fcitx5, Pinyin/Zhuyin, and other composition-based input methods) being completely unusable. `VemEditorEntity`'s keydown handler had no `isComposing`/`'Process'` guard, so every intermediate composing keystroke was fed straight into the Vim state machine, corrupting the buffer and breaking composition. Composing keydowns are now ignored, and the committed text is inserted via the `'change'` event `@vectojs/core`'s a11y projection already emits once a composition ends.
