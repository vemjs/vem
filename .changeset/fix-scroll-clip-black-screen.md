---
'@vemjs/renderer-vecto': patch
---

Fix a solid-black-screen bug in scrollable buffers: the content clip in `VemEditorEntity.render()` used screen-space coordinates while inside the scroll `translate()`, so once `scrollY * lineHeight` exceeded roughly one screenful (e.g. `:help`'s 64-line buffer scrolled a couple of wheel notches down), the clip region drifted off past the top of the viewport and every glyph drawn after it was silently discarded — text was computed and drawn at the correct coordinates, it just never reached the screen. Affects any buffer/pane, not just `:help`. The clip's Y is now offset to counteract the active scroll transform, keeping it pinned to the pane's actual on-screen bounds regardless of scroll position.
