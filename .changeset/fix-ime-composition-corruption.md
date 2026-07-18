---
'@vemjs/renderer-vecto': patch
---

Fix severe text corruption bug: typing in INSERT mode (including pressing `i`/`a` to enter it, or pressing Enter for newlines) could duplicate or scramble large portions of the buffer under real network/rendering latency.

Root cause: the previous IME-composition detection trusted a `composition` field forwarded by `@vectojs/core`'s accessibility layer on every `change`/`input` event from the shadow textarea. That field is `null` both for a just-committed IME composition AND for an ordinary direct keystroke — the two cases are indistinguishable from the event payload alone. Under load (slow page load, a11y sync racing with keydown), a queued `change` event carrying stale/full buffer text was misidentified as a composition commit and re-inserted verbatim, producing the reported "typing anything returns a long garbled string" and "same file opens with duplicated content" symptoms.

Fix: attach dedicated `compositionstart`/`compositionend` listeners directly on the shadow textarea and track composition state ourselves. Only the one `change` event that fires synchronously inside `compositionend`'s own listener chain (the real IME commit) is ever inserted as text; every other `change` event — regardless of its `value` or `composition` field — is ignored, since direct key input is already fully handled by the `keydown` handler. Verified with a stress test that previously reproduced heavy corruption (10-line typed loop, numeric input, ESC/re-enter INSERT) — all pass cleanly now.

Also includes two smaller fixes bundled in this release:

- `zz`/`zb` no longer collapse to a 1-line scroll fallback when `visibleLines` hasn't synced yet (falls back to `halfPageLines`).
- The text-render clip region now reserves the bottom 30px for the status/command bar, so scrolled buffer text can no longer paint underneath the ruler or overlap the command-mode input line.
