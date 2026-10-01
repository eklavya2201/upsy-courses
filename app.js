// UPSY Courses: shared helpers. Static site, no build step, data in catalog/courses.json.
// Deliberately no loan logic anywhere in this folder (separate product vertical).

const RUPEE = "₹";
const COMPARE_KEY = "upsy-courses-compare";
const COMPARE_MAX = 3;

let DB = null;

export async function loadData() {
  if (DB) return DB;
  const res = await fetch("catalog/courses.json", { cache: "no-cache" });
  const raw = await res.json();
  const colleges = Object.fromEntries(raw.colleges.map((c) => [c.id, c]));
  const courses = raw.courses.map((c) => ({ ...c, college: colleges[c.collegeId] }));
  DB = { colleges: raw.colleges, collegeById: colleges, courses, note: raw._note };
  return DB;
}

/** 7,92,000 -> "₹7.92 L"; 82,00,000 -> "₹82 L"; 1,20,00,000 -> "₹1.2 Cr". */
export function money(n) {
  if (n == null || isNaN(n)) return "-";
  if (n >= 1e7) return `${RUPEE}${trim(n / 1e7)} Cr`;
  if (n >= 1e5) return `${RUPEE}${trim(n / 1e5)} L`;
  return `${RUPEE}${n.toLocaleString("en-IN")}`;
}
function trim(x) {
  return Number(x.toFixed(2)).toString();
}

export function moneyFull(n) {
  return n == null ? "-" : `${RUPEE}${Number(n).toLocaleString("en-IN")}`;
}

export function years(n) {
  return n === 1 ? "1 year" : `${n} years`;
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

export function param(name) {
  return new URLSearchParams(location.search).get(name);
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

/** Floating bar shown on every page while something is selected for comparison. */
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
    <div class="names">${names.map((c) => `<span>${esc(c.degree)} · ${esc(c.college.name)}</span>`).join("")}</div>
    <a class="btn" href="compare.html">Compare${names.length < 2 ? " (pick 2+)" : ""}</a>
    <button type="button" data-clear>Clear</button>`;
  tray.querySelector("[data-clear]").addEventListener("click", () => {
    clearCompare();
    renderTray(db);
    document.querySelectorAll("[data-compare]").forEach((b) => b.classList.remove("on"));
    document.querySelectorAll("[data-compare]").forEach((b) => (b.textContent = "+ Compare"));
  });
}

// ── Course card (shared by the listing, the college page and "similar") ──────
export function courseCard(c) {
  const on = compareIds().includes(c.id);
  return `
  <article class="card" data-id="${esc(c.id)}">
    <div class="top">
      <div>
        <div class="college"><a href="colleges.html#${esc(c.collegeId)}">${esc(c.college.name)}</a></div>
        <h3><a href="course.html?id=${encodeURIComponent(c.id)}">${esc(c.name)}</a></h3>
      </div>
      <div class="city">${esc(c.college.city)}</div>
    </div>
    <div class="tags">
      <span class="tag level">${esc(c.level)}</span>
      <span class="tag">${esc(c.stream)}</span>
      <span class="tag">${esc(c.college.type)}</span>
      <span class="tag">${esc(c.mode)}</span>
    </div>
    <div class="facts">
      <div class="fact">Total fee<b>${money(c.totalFee)}</b></div>
      <div class="fact">Duration<b>${years(c.durationYears)}</b></div>
      <div class="fact">Entrance<b>${esc(c.entrance)}</b></div>
      <div class="fact">Intake<b>${esc(c.intake)}</b></div>
    </div>
    <div class="rating"><span class="star">&#9733; ${c.rating.toFixed(1)}</span><span>(${c.reviews.toLocaleString("en-IN")} reviews)</span>${c.college.nirf ? `<span>· NIRF #${c.college.nirf}</span>` : ""}</div>
    <div class="skills">${c.skills.map(esc).join(" · ")}</div>
    <div class="actions">
      <a class="btn primary sm" href="course.html?id=${encodeURIComponent(c.id)}">View course</a>
      <button type="button" class="btn ghost sm${on ? " on" : ""}" data-compare="${esc(c.id)}">${on ? "Added" : "+ Compare"}</button>
    </div>
  </article>`;
}

/** Wire every "+ Compare" button inside `root`. */
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
