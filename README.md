# UPSY Courses

AI course search in the UPSY theme. The flow is the one coursecorrect.fyi uses: a one-box home page,
a two-pane results page with an assistant on the left and the ranked list on the right, and a course page
that keeps the assistant beside it. Separate product vertical: no loan, EMI or semester-plan logic here.

## Pages

Static site, no build step. Open through any static server (`python -m http.server` in this folder).

- `index.html`: hero with the search box (Ctrl+K focuses it). Submitting goes to `search.html?q=`.
- `search.html`: assistant panel (opening line, suggestion chips, message box) + results list with sort
  and a Filters drawer (Level, Resource type, Provider, Language, Free, Certificate, Duration; built from
  the data). The query is ranked locally at once, then by the model when it answers, with a reason under
  each picked course. Asking the assistant to choose re-ranks the list.
- `course.html?id=`: the course, with the assistant answering about that course.
- `saved.html`: bookmarked courses (localStorage).
- `catalog/courses.json`: the catalogue (`courses[]`; `_note` becomes the banner, delete it for real data).
  Fields: `id, title, provider, institution, type, level, selfPaced, free, certificate, language,
  durationLabel, durationHours, rating, numRatings, summary, skills[], careers[{title, salary}], url, subject`.
  The preview holds 11 courses scraped from coursecorrect.fyi subject pages (headless Chrome on public
  pages; their `/api/` is disallowed by robots and was not used).
- `app.js`: helpers, the card, saved courses, the local search layer (`understand()`, `localSearch()`),
  the assistant panel (`mountAssistant()`), and the API client.

## API (`api/`)

One Node file, no dependencies. Both endpoints hand the whole catalogue to the model and return JSON.

- `POST /ask {query}` → `{understood, results:[{id, reason}], answer}`
- `POST /chat {messages, context}` → `{reply, results:[{id, reason}]}`; `context` carries the search
  query and on-screen ids, or the course id on a course page.

Env: `OPENROUTER_API_KEY` (required), `OPENROUTER_MODEL` (default `openai/gpt-4o-mini`), `CATALOG_URL`.
The page never waits on it: local ranking shows first and a fallback reply is used if it is unreachable.

## Deploy

Source of truth is https://github.com/eklavya2201/upsy-courses, branch `main`.

- Site: Render static site `upsy-courses` from the repo root, https://upsy-courses.onrender.com.
- API: Render web service `upsy-courses-api` from root `api`, `npm install` / `npm start`,
  https://upsy-courses-api.onrender.com. The page finds it there; override with `window.UPSY_API_URL`.
