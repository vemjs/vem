---
'@vemjs/renderer-vecto': patch
---

feat(renderer): implement diagnostic highlights (wavy underlines) and autocomplete popover menu on the Canvas editor

- Render diagnostic wavy lines under text characters based on severity levels (error, warning, info, hint)
- Implement interactive autocomplete popup menu rendered directly below the cursor
- Support active item selection and scrolling inside the canvas-rendered popover
- Expose methods on VemEditorEntity to control autocomplete states (setAutocompleteItems, selectNextAutocomplete, selectPrevAutocomplete, clearAutocomplete)
