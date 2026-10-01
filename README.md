# UPSY Courses

A course listing with AI search, in the UPSY theme, modelled on the listing mechanics of coursecorrect.fyi
(search, filters, course cards, compare, detail page). Separate product vertical: there is deliberately
no loan, EMI or semester-plan logic in this folder and nothing links into the voice agent or /docs.

## Layout

Static site, no build step. Open `index.html` through any static server (`python -m http.server` in this folder).

- `catalog/courses.json`: the catalogue, `courses[]`. `_note` is shown as the banner; delete it once real data is loaded.
  Fields per course: `id, title, provider, institution, type, level, selfPaced, free, certificate, language,
  durationLabel, durationHours, rating, numRatings, summary, skills[], careers[{title, salary}], url, subject`.
  The preview holds 11 courses scraped from coursecorrect.fyi subject pages (headless Chrome, public pages
  only; their `/api/` is disallowed by robots and was not used).
- `app.js`: shared helpers, the course card, the compare tray (localStorage), and the LOCAL layer of the AI
  search: `understand()` reads level / free / certificate / provider / time budget / topic out of a sentence,
  `localSearch()` filters and ranks on it.
- `index.html`: the AI search box plus the same filter set as the reference site (Level, Resource type,
  Provider, Language, Free, Certificate, Duration) and its sorts. Filters are built from the data.
- `course.html?id=`: detail page. `compare.html`: up to three side by side. `providers.html`: per platform.
- `api/`: the MODEL layer of the AI search. `POST /ask {query}` sends the whole catalogue (it is small) to
  OpenRouter and returns `{understood, results:[{id, reason}], answer}`. The page ranks locally first and
  replaces the ranking when this answers, so a sleeping free instance costs nothing visible.

## Deploy

Source of truth is this repo, https://github.com/eklavya2201/upsy-courses, branch `main`.

- Site: Render static site `upsy-courses` from the repo root, https://upsy-courses.onrender.com.
- API: Render web service `upsy-courses-api` from root `api`, `npm install` / `npm start`,
  env `OPENROUTER_API_KEY` (and optionally `OPENROUTER_MODEL`, `CATALOG_URL`),
  https://upsy-courses-api.onrender.com. The page finds it there; override with `window.UPSY_API_URL`.
