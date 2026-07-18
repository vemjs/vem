---
'@vemjs/core': patch
---

Fix a major bug where every g/z/Z/bracket two-key prefix command except `gg` silently failed: `gu`, `gU`, `gq`, `gJ`, `ga`, `g8`, `gf`, `gv`, `gi`, `g;`, `g,`, `zz`, `zt`, `zb`, `ZZ`, `ZQ`, `[[`, `]]`, `[]`, `][` all resolved to `isValid: false` and did nothing when pressed.

Root cause: the parser's lookup tables for these commands (`gPrefixCommands`, `zPrefixCommands`, `ZPrefixCommands`) are keyed by the second character only (e.g. `gPrefixCommands.u === 'gu'`), but the lookups indexed them by the full two-character sequence (`gPrefixCommands['gu']`) — a key that never exists in any of these tables, so the lookup was always `undefined`. `gg` appeared to work only because it has a separately hardcoded motion check that never depended on the broken lookup at all, which is exactly why this went unnoticed for so long.

Also fixes `bracketPrefixCommands`, which additionally had wrong _values_ (`]]` resolved to command `[]`, `][` resolved to `[[`) independent of the lookup-key bug.

Added a dedicated regression test suite (`g/z/Z/bracket two-key prefix commands`) covering every command in NORMAL, VISUAL, and after-operator contexts, verified to fail against the pre-fix parser and pass against the fix.
