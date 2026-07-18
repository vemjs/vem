---
'@vemjs/renderer-vecto': patch
---

Fix text duplication on i/a after ESC: the a11y change handler was
processing single-key values from the shadow textarea as INSERT mode
input, duplicating the first character of every new INSERT session
(e.g. pressing i entered INSERT mode but also inserted "i" as text,
and after an edit, pressing i/ESC/i replayed the entire previous edit
via the change/value cycle).
