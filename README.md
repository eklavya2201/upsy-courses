# UPSY Courses

A course and college listing in the UPSY theme, modelled on the listing mechanics of coursecorrect.fyi
(search, filters, course cards, compare, detail page). Separate product vertical: there is deliberately
no loan, EMI or semester-plan logic in this folder and nothing links into the voice agent or /docs.

Static site, no build step. Open `index.html` through any static server (`python -m http.server` in this folder).

- `catalog/courses.json`: the catalogue. `colleges[]` and `courses[]` (each course carries `collegeId`).
  `_note` is shown as the banner; delete it once real data is loaded.
- `app.js`: shared helpers (money formatting, compare tray in localStorage, course card).
- `index.html`: search + filters (built from the data, no code change for a new sheet) + cards.
- `course.html?id=`: detail page. `compare.html`: up to three side by side. `colleges.html`: colleges with their courses.

Deployed as its own Render static site from the `courses-listing` branch, root directory `courses`.
