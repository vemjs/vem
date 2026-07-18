---
'@vemjs/renderer-vecto': patch
---

Throttle scene redraws to ~30fps during rapid keyboard input: holding j/k
no longer triggers a full canvas render on every browser key repeat event,
fixing janky cursor movement on high-DPI displays.
