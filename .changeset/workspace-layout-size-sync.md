---
'@vemjs/renderer-vecto': patch
---

Propagate workspace size to every tab layout on update. Tabs does not size its content entities, so layouts kept their construction width and bled past the hosting Panel clip by the divider width (a 3.2px right-edge escape flagged by the @vectojs/devtools scene audit).
