---
'@vemjs/core': patch
---

Command-mode and macro improvements: backspacing over the empty `:` prompt now leaves COMMAND mode (Vim behavior) instead of trapping you until Escape; `:q!` force-quits and passes a `force` flag to quit handlers; `:wq`/`:x` save-then-quit; and full macro support — `q{reg}` … `q` records, `@{reg}` replays, `@@` repeats, exposed via `isRecording()`/`getRecordingRegister()`.
