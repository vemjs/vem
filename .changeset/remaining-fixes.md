---
'@vemjs/core': minor
'@vemjs/renderer-vecto': patch
---

- :set number/:set relativenumber persistence (survives buffer switch and page refresh via onCreateOptions + activeDefaultLayoutConfig + localStorage)
- Jump list: Ctrl-o/Ctrl-i navigation
- Buffer dedup: reopening the same file no longer creates duplicate tabs
- gu/gU added to parser as valid g-prefix commands
- Ctrl-o/Ctrl-i added to parser commands
- executeSetOption made public for host-side option restoration
