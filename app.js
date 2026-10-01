// UPSY Courses: shared helpers. Static site, no build step, data in catalog/courses.json.
// Deliberately no loan logic anywhere in this folder (separate product vertical).

const COMPARE_KEY = "upsy-courses-compare";
const COMPARE_MAX = 3;
// The AI search API (courses/api). Empty string = local ranking only.
export const API_URL = (typeof window !== "undefined" && window.UPSY_API_URL) || "https://upsy-courses-api.onrender.com";

let DB = null;

export async function loadData() {
  if (DB) return DB;
  const res = await fetch("catalog/courses.json", { cache: "no-cache" });
  const raw = await res.json();
  DB = { courses: raw.courses, note: raw._note };
  return DB;
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

export function param(name) {
  return new URLSearchParams(location.search).get(name);
}

export function num(n) {
  return n == null ? "-" : Number(n).toLocaleString("en-IN");
}

/** "13 hours", "42 min", "~17 weeks": the provider's own label, or derived from hours. */
export function duration(c) {
  if (c.durationLabel) return c.durationLabel;
  const h = c.durationHours;
  if (h == null) return "-";
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 100) return `${Math.round(h)} hours`;
  return `~${Math.round(h / 10)} weeks`;
}

// ── Compare tray (localStorage, per browser) ─────────────────────────────────
export function compareIds() {
  try {
    const v = JSON.parse(localStorage.getItem(COMPARE_KEY) || "[]");
    return Array.isArray(v) ? v.slice(0, COMPARE_MAX) : [];
  } catch {
    return [];
  }
}
export function toggleCompare(id) {
  const ids = compareIds();
  const i = ids.indexOf(id);
  if (i >= 0) ids.splice(i, 1);
  else if (ids.length < COMPARE_MAX) ids.push(id);
  else return { full: true, ids };
  try { localStorage.setItem(COMPARE_KEY, JSON.stringify(ids)); } catch {}
  return { full: false, ids };
}
export function removeCompare(id) {
  const ids = compareIds().filter((x) => x !== id);
  try { localStorage.setItem(COMPARE_KEY, JSON.stringify(ids)); } catch {}
  return ids;
}
export function clearCompare() {
  try { localStorage.removeItem(COMPARE_KEY); } catch {}
}

export function renderTray(db) {
  let tray = document.querySelector(".tray");
  const ids = compareIds();
  if (!ids.length) { if (tray) tray.remove(); return; }
  if (!tray) {
    tray = document.createElement("div");
    tray.className = "tray";
    document.body.appendChild(tray);
  }
  const names = ids.map((id) => db.courses.find((c) => c.id === id)).filter(Boolean);
  tray.innerHTML = `
    <strong>Compare (${names.length}/${COMPARE_MAX})</strong>
    <div class="names">${names.map((c) => `<span>${esc(c.title.slice(0, 28))}${c.title.length > 28 ? "…" : ""}</span>`).join("")}</div>
    <a class="btn" href="compare.html">Compare${names.length < 2 ? " (pick 2+)" : ""}</a>
    <button type="button" data-clear>Clear</button>`;
  tray.querySelector("[data-clear]").addEventListener("click", () => {
    clearCompare();
    renderTray(db);
    document.querySelectorAll("[data-compare]").forEach((b) => { b.classList.remove("on"); b.textContent = "+ Compare"; });
  });
}

// ── Course card: the same shape as the reference site's card ─────────────────
export function courseCard(c, extra = {}) {
  const on = compareIds().includes(c.id);
  return `
  <article class="card" data-id="${esc(c.id)}">
    <div class="chiprow">
      <span class="tag type">${esc(c.type)}</span>
      ${c.level ? `<span class="tag">${esc(c.level)}</span>` : ""}
      ${c.selfPaced ? `<span class="tag">Self-paced</span>` : ""}
      ${c.free ? `<span class="tag free">Free</span>` : ""}
      <span class="provider">${esc(c.provider)}</span>
    </div>
    <h3><a href="course.html?id=${encodeURIComponent(c.id)}">${esc(c.title)}</a></h3>
    ${c.institution ? `<div class="inst">${esc(c.institution)}</div>` : ""}
    ${extra.reason ? `<div class="reason">${esc(extra.reason)}</div>` : `<p class="summary">${esc(c.summary.slice(0, 160))}${c.summary.length > 160 ? "…" : ""}</p>`}
    <div class="tags">${c.skills.slice(0, 4).map((s) => `<span class="skill">${esc(s)}</span>`).join("")}</div>
    <div class="meta">
      ${c.rating != null ? `<span class="rating"><span class="star">&#9733;</span> ${c.rating.toFixed(1)} <span class="muted">(${num(c.numRatings)})</span></span>` : `<span class="muted">No rating yet</span>`}
      <span>${esc(duration(c))}</span>
      ${c.certificate ? `<span>Certificate</span>` : ""}
      <span class="muted">${esc(c.language)}</span>
    </div>
    <div class="actions">
      <a class="btn primary sm" href="course.html?id=${encodeURIComponent(c.id)}">View</a>
      <a class="btn ghost sm" href="${esc(c.url)}" target="_blank" rel="noopener">Enroll on ${esc(c.provider)} ↗</a>
      <button type="button" class="btn ghost sm${on ? " on" : ""}" data-compare="${esc(c.id)}">${on ? "Added" : "+ Compare"}</button>
    </div>
  </article>`;
}

export function wireCompareButtons(root, db) {
  root.querySelectorAll("[data-compare]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const r = toggleCompare(btn.dataset.compare);
      if (r.full) {
        btn.textContent = `Max ${COMPARE_MAX}`;
        setTimeout(() => (btn.textContent = "+ Compare"), 1200);
        return;
      }
      const on = r.ids.includes(btn.dataset.compare);
      btn.classList.toggle("on", on);
      btn.textContent = on ? "Added" : "+ Compare";
      renderTray(db);
    });
  });
}

export function markNav() {
  const here = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav a").forEach((a) => {
    if (a.getAttribute("href") === here) a.classList.add("active");
  });
}

// ── AI search, local layer ───────────────────────────────────────────────────
// Reads the request the way a person would, instantly and offline: level, price,
// certificate, provider, a time budget, and the topic words that are left.
// The API layer (courses/api) does the same job with a model and adds a reason
// per result; when it answers, its ranking replaces this one.
const LEVEL_WORDS = [
  ["Beginner", /\b(beginner|beginners|basics|from scratch|no experience|intro|introduction|starting out|complete newbie|zero)\b/i],
  ["Intermediate", /\b(intermediate|some experience|next level)\b/i],
  ["Advanced", /\b(advanced|expert|deep dive|master)\b/i],
];
// "learn" and "learning" are deliberately NOT stop words: "machine learning" is a topic.
const STOP = new Set("a an the and or for to of in on with me i want need looking find best good course courses class classes study online free paid cheap short long quick fast under over hours hour hrs week weeks weekend weekends day days evening month months finish complete this that which is are can should get into certificate certified cert beginner beginners intermediate advanced level any some something top university from coursera udemy edx datacamp pluralsight".split(" "));

export function understand(query) {
  const q = query.toLowerCase();
  const u = { topic: null, level: null, free: null, certificate: null, maxHours: null, provider: null };
  for (const [level, re] of LEVEL_WORDS) if (re.test(q)) { u.level = level; break; }
  if (/\bfree\b/.test(q) && !/\bnot free\b/.test(q)) u.free = true;
  if (/\b(certificate|certified|certification)\b/.test(q)) u.certificate = true;
  const prov = q.match(/\b(coursera|udemy|edx|datacamp|pluralsight)\b/);
  if (prov) u.provider = prov[1];
  const hrs = q.match(/(?:under|below|less than|within|max(?:imum)?|up to|<)\s*(\d+)\s*(hours?|hrs?|h)\b/) || q.match(/(\d+)\s*(hours?|hrs?)\s*(?:or less|max|tops)/);
  if (hrs) u.maxHours = Number(hrs[1]);
  const days = q.match(/(?:under|within|in|over|this|a|one|1|two|2)\s*(weekends?|day|evening)/);
  if (days && !u.maxHours) u.maxHours = days[1].startsWith("weekend") ? (/two|2/.test(days[0]) ? 24 : 12) : 4;
  if (/\b(short|quick)\b/.test(q) && !u.maxHours) u.maxHours = 6;
  const words = q.replace(/[^a-z0-9+#. ]/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w) && !/^\d+$/.test(w));
  u.topic = words.length ? words.join(" ") : null;
  return u;
}

export function localSearch(courses, query) {
  const u = understand(query);
  const words = (u.topic || "").split(" ").filter(Boolean);
  const rank = (strict) => courses.map((c) => {
    let s = 0;
    const title = c.title.toLowerCase(), skills = c.skills.join(" ").toLowerCase(), text = `${c.summary} ${c.subject} ${c.institution}`.toLowerCase();
    for (const w of words) {
      if (title.includes(w)) s += 5;
      if (skills.includes(w)) s += 3;
      if (text.includes(w)) s += 1;
    }
    if (words.length && s === 0) return null;
    if (strict) {
      if (u.level && c.level !== u.level && c.level !== "All Levels") return null;
      if (u.free && !c.free) return null;
      if (u.certificate && !c.certificate) return null;
      if (u.provider && c.provider.toLowerCase() !== u.provider) return null;
      if (u.maxHours != null && c.durationHours != null && c.durationHours > u.maxHours) return null;
    }
    s += (c.rating || 0) + Math.log10((c.numRatings || 1) + 1) / 2;
    return { c, s };
  }).filter(Boolean).sort((a, b) => b.s - a.s).map((x) => x.c);
  // Constraints first; if nothing survives them, the closest topic matches
  // beat an empty page. `relaxed` tells the caller which one it got.
  let results = rank(true), relaxed = false;
  if (!results.length && words.length) { results = rank(false); relaxed = results.length > 0; }
  return { understood: u, results, relaxed };
}

/** Ask the API; resolves null on any failure so the page never waits on it. */
export async function askApi(query, { timeoutMs = 60000 } = {}) {
  if (!API_URL) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}/ask`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }), signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
