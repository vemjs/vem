/**
 * Single source of truth for Ctrl-combinations Vim owns. Any consumer that
 * listens for native `keydown` (the website's window-level router, or an
 * individual `VemEditorEntity`'s own a11y textarea once it has DOM focus)
 * MUST translate + preventDefault from this table — a second, smaller copy
 * is how Ctrl-D/U/F/B/E/Y ended up hijacked by the browser (bookmark/
 * view-source/find/…) whenever a pane's own textarea had focus instead of
 * the window-level canvas listener.
 */
export const CTRL_VIM_KEYS: Record<string, string> = {
  r: '<C-r>', // redo
  v: '<C-v>', // visual block
  d: '<C-d>', // half page down
  u: '<C-u>', // half page up
  f: '<C-f>', // page down
  b: '<C-b>', // page up
  e: '<C-e>', // scroll line down
  y: '<C-y>', // scroll line up
  o: '<C-o>', // (reserved: jumplist) — captured so the browser open dialog stays shut
};

/**
 * Ctrl-combos we always swallow (preventDefault) even though nothing in the
 * editor is wired to them yet — save/print/find-next/…; letting them through
 * hijacks the tab instead of doing nothing.
 */
export const PREVENT_CTRL_KEYS = new Set(['s', 'p', 'g', 'j', 'k', 'l']);
