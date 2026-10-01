// UPSY Courses: shared helpers. Static site, no build step, data in catalog/courses.json.
// Deliberately no loan logic anywhere in this repo (separate product vertical).

const SAVED_KEY = "upsy-courses-saved";
export const API_URL = (typeof window !== "undefined" && window.UPSY_API_URL) || "https://upsy-courses-api.onrender.com";

let DB = null;
export async function loadData() {
  if (DB) return DB;
  const res = await fetch("catalog/courses.json", { cache: "no-cache" });
  const raw = await res.json();
  DB = { courses: raw.courses, note: raw._note };
  return DB;
}

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
export const param = (name) => new URLSearchParams(location.search).get(name);
export const num = (n) => (n == null ? "-" : Number(n).toLocaleString("en-IN"));
export function duration(c) {
  if (c.durationLabel) return c.durationLabel;
  const h = c.durationHours;
  if (h == null) return "-";
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 100) return `${Math.round(h)} hours`;
  return `~${Math.round(h / 10)} weeks`;
}
export const stars = (r) => (r == null ? "" : "★".repeat(Math.round(r)) + "☆".repeat(5 - Math.round(r)));

// ── Saved courses (the bookmark on every card) ───────────────────────────────
export function savedIds() {
  try { const v = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function toggleSaved(id) {
  const ids = savedIds(); const i = ids.indexOf(id);
  if (i >= 0) ids.splice(i, 1); else ids.push(id);
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(ids)); } catch {}
  return ids.includes(id);
}
export function updateSavedCount() {
  const n = savedIds().length;
  document.querySelectorAll("[data-saved-count]").forEach((el) => { el.textContent = n; el.hidden = !n; });
}

// ── The course card, laid out like the reference site's card ─────────────────
const BOOKMARK = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h12v17l-6-4-6 4z"/></svg>`;
export function courseCard(c, i = 0, extra = {}) {
  const saved = savedIds().includes(c.id);
  return `
  <article class="card${extra.hit ? " hit" : ""}" data-id="${esc(c.id)}" style="--i:${i}">
    <div class="chiprow">
      <span class="tag type">${esc(c.type)}</span>
      ${c.level ? `<span class="tag">${esc(c.level)}</span>` : ""}
      ${c.selfPaced ? `<span class="tag">Self-paced</span>` : ""}
      ${c.free ? `<span class="tag free">Free</span>` : ""}
      <span class="provider">${esc(c.provider)}</span>
    </div>
    <h3><a href="course.html?id=${encodeURIComponent(c.id)}">${esc(c.title)}</a></h3>
    ${c.institution ? `<div class="inst">${esc(c.institution)}</div>` : ""}
    ${extra.reason ? `<p class="reason">${esc(extra.reason)}</p>` : `<p class="summary">${esc(c.summary.slice(0, 170))}${c.summary.length > 170 ? "…" : ""}</p>`}
    <div class="skills">${c.skills.slice(0, 4).map((s) => `<span class="skill">${esc(s)}</span>`).join("")}</div>
    <div class="foot">
      <span>${esc(duration(c))}</span>
      ${c.certificate ? `<span>Certificate</span>` : ""}
      ${c.rating != null ? `<span class="rating"><span class="star">★</span>${c.rating.toFixed(1)} <span class="muted">(${num(c.numRatings)})</span></span>` : ""}
      <span class="right">
        <button type="button" class="save${saved ? " on" : ""}" data-save="${esc(c.id)}" aria-label="Save course" title="${saved ? "Saved" : "Save"}">${BOOKMARK}</button>
        <a class="btn ghost sm" href="${esc(c.url)}" target="_blank" rel="noopener">Enroll ↗</a>
      </span>
    </div>
  </article>`;
}
export function wireSaveButtons(root) {
  root.querySelectorAll("[data-save]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const on = toggleSaved(btn.dataset.save);
      btn.classList.toggle("on", on); btn.title = on ? "Saved" : "Save";
      updateSavedCount();
    });
  });
}

export function markNav() {
  const here = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav a").forEach((a) => { if (a.getAttribute("href") === here) a.classList.add("active"); });
  updateSavedCount();
  // Ctrl+K anywhere: go to (or focus) the search.
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      const q = document.querySelector("#q, #composer-input");
      if (q) q.focus(); else location.href = "index.html#search";
    }
  });
}

// ── Local layer of the search ────────────────────────────────────────────────
// Reads the request the way a person would, instantly and offline. The model
// layer (api/) replaces its ranking and adds a reason per course when it answers.
const LEVEL_WORDS = [
  ["Beginner", /\b(beginner|beginners|basics|from scratch|no experience|intro|introduction|starting out|complete newbie|zero)\b/i],
  ["Intermediate", /\b(intermediate|some experience|next level)\b/i],
  ["Advanced", /\b(advanced|expert|deep dive|master)\b/i],
];
// "learn" and "learning" are deliberately NOT stop words: "machine learning" is a topic.
const STOP = new Set("a an the and or for to of in on with me i my want need looking find best good course courses class classes study online free paid cheap short long quick fast under over hours hour hrs week weeks weekend weekends day days evening month months finish complete this that which is are can should get into certificate certified cert beginner beginners intermediate advanced level any some something top university from coursera udemy edx datacamp pluralsight help choose where start do".split(" "));

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
    for (const w of words) { if (title.includes(w)) s += 5; if (skills.includes(w)) s += 3; if (text.includes(w)) s += 1; }
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
  let results = rank(true), relaxed = false;
  if (!results.length && words.length) { results = rank(false); relaxed = results.length > 0; }
  if (!results.length) results = [...courses].sort((a, b) => (b.rating || 0) - (a.rating || 0));
  return { understood: u, results, relaxed };
}

// ── Model layer ──────────────────────────────────────────────────────────────
async function post(path, body, timeoutMs) {
  if (!API_URL) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; } finally { clearTimeout(t); }
}
/** Ranking for a query: { understood, results:[{id, reason}], answer } or null. */
export const askApi = (query) => post("/ask", { query }, 70000);
/** A conversational turn: { reply, results:[{id, reason}] } or null. */
export const chatApi = (messages, context) => post("/chat", { messages, context }, 70000);

/** Types `text` into `el` word by word, like a reply arriving. Resolves when done. */
export function typeInto(el, text, { wps = 28 } = {}) {
  return new Promise((resolve) => {
    const words = text.split(/(\s+)/);
    let i = 0;
    el.innerHTML = `<span class="caret"></span>`;
    const tick = () => {
      if (i >= words.length) { el.textContent = text; return resolve(); }
      el.textContent = words.slice(0, ++i).join("");
      el.insertAdjacentHTML("beforeend", `<span class="caret"></span>`);
      el.parentElement && (el.parentElement.scrollTop = el.parentElement.scrollHeight);
      setTimeout(tick, words[i - 1]?.trim() ? 1000 / wps : 0);
    };
    tick();
  });
}

// ── The assistant panel, shared by the search and course pages ──────────────
// `opening` is the first bot line, `chips` the suggestions under it, `context`
// is sent with every turn, `onResults(results)` lets the page re-rank itself.
export function mountAssistant(root, { db, opening, chips, context, onResults }) {
  root.innerHTML = `
    <button type="button" class="close" aria-label="Close">✕</button>
    <div class="thread" id="thread"></div>
    <form class="composer" id="composer">
      <input id="composer-input" type="text" placeholder="Type your message…" autocomplete="off" maxlength="500" />
      <button type="submit" class="send" aria-label="Send"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/></svg></button>
      <button type="button" id="reset" aria-label="Start over" title="Start over"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v5h5"/></svg></button>
    </form>
    <div class="foot">Answers are generated by a model from the catalogue. Check the provider's page before enrolling.</div>`;
  const thread = root.querySelector("#thread");
  const input = root.querySelector("#composer-input");
  const send = root.querySelector(".send");
  const history = [];
  let busy = false;

  const bubble = (role, text) => {
    const el = document.createElement("div");
    el.className = `msg ${role}`;
    el.textContent = text;
    thread.appendChild(el);
    thread.scrollTop = thread.scrollHeight;
    return el;
  };
  const suggestions = () => {
    const box = document.createElement("div");
    box.className = "suggest";
    box.innerHTML = chips.map((c, i) => `<button type="button"${i === chips.length - 1 ? ' class="link"' : ""}>${esc(c)}${i === chips.length - 1 ? " ›" : ""}</button>`).join("");
    box.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) submit(chips[[...box.children].indexOf(b)]); });
    thread.appendChild(box);
  };
  const start = () => {
    thread.innerHTML = ""; history.length = 0;
    bubble("bot", opening);
    suggestions();
  };

  async function submit(text) {
    text = String(text || "").trim();
    if (!text || busy) return;
    busy = true; send.disabled = true; input.value = "";
    thread.querySelectorAll(".suggest").forEach((s) => s.remove());
    bubble("user", text);
    history.push({ role: "user", content: text });
    const typing = document.createElement("div");
    typing.className = "typing"; typing.innerHTML = "<i></i><i></i><i></i>";
    thread.appendChild(typing); thread.scrollTop = thread.scrollHeight;
    const out = await chatApi(history.slice(-8), context());
    typing.remove();
    let reply;
    if (out && out.reply) {
      reply = out.reply;
      if (out.results?.length && onResults) onResults(out.results);
    } else {
      const local = localSearch(db.courses, text);
      const top = local.results.slice(0, 3);
      reply = `I could not reach the model just now, so here is a plain match. ${top.length ? "Closest in the catalogue: " + top.map((c) => c.title).join("; ") + "." : "Nothing in the catalogue fits that."}`;
      if (onResults && top.length) onResults(top.map((c) => ({ id: c.id, reason: "" })));
    }
    const el = bubble("bot", "");
    await typeInto(el, reply);
    history.push({ role: "assistant", content: reply });
    busy = false; send.disabled = false; input.focus();
  }

  root.querySelector("#composer").addEventListener("submit", (e) => { e.preventDefault(); submit(input.value); });
  root.querySelector("#reset").addEventListener("click", start);
  root.querySelector(".close").addEventListener("click", () => closeAssistant(root));
  start();
  return { submit, start };
}

export function openAssistant(root) { root.classList.add("open"); document.querySelector(".scrim")?.classList.add("on"); }
export function closeAssistant(root) { root.classList.remove("open"); document.querySelector(".scrim")?.classList.remove("on"); }
