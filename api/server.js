// UPSY Courses: AI search API.
//
// One endpoint. POST /ask { query } -> { understood, results: [{ id, reason }], answer }.
// The model sees the WHOLE catalogue (it is small) and answers in JSON, so the
// page can show why each course was picked, not just a list. The page never
// depends on this service being awake: it ranks locally first and upgrades
// when this answers, so a cold start here costs nothing visible.
//
// Env: OPENROUTER_API_KEY (required), OPENROUTER_MODEL (default openai/gpt-4o-mini),
//      CATALOG_URL (default: the static site's catalog), PORT.
import http from "node:http";

const PORT = Number(process.env.PORT || 8787);
const MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
const CATALOG_URL = process.env.CATALOG_URL || "https://upsy-courses.onrender.com/catalog/courses.json";
const KEY = process.env.OPENROUTER_API_KEY;

let catalog = null;
let catalogAt = 0;
async function loadCatalog() {
  if (catalog && Date.now() - catalogAt < 5 * 60 * 1000) return catalog;
  const res = await fetch(CATALOG_URL);
  if (!res.ok) throw new Error(`catalog ${res.status}`);
  catalog = (await res.json()).courses;
  catalogAt = Date.now();
  return catalog;
}

function compact(c) {
  // What the model needs to choose, nothing it does not.
  return {
    id: c.id, title: c.title, provider: c.provider, institution: c.institution, type: c.type, level: c.level,
    free: c.free, certificate: c.certificate, selfPaced: c.selfPaced, language: c.language,
    hours: c.durationHours, rating: c.rating, reviews: c.numRatings, skills: c.skills, summary: c.summary,
    careers: (c.careers || []).map((x) => x.title),
  };
}

const SYSTEM = `You are the search engine for UPSY Courses, a catalogue of online courses.
You get the learner's request and the full catalogue as JSON. Reply with JSON only:
{"understood": {"topic": string|null, "level": "Beginner"|"Intermediate"|"Advanced"|null, "free": boolean|null, "certificate": boolean|null, "maxHours": number|null, "provider": string|null, "goal": string|null},
 "results": [{"id": string, "reason": string}],
 "answer": string}
Rules: results are catalogue ids only, best first, at most 6, and only courses that genuinely fit; an empty list is a valid answer.
Each reason is one short sentence naming the concrete fact that makes it fit (hours, level, price, rating, a skill).
"answer" is two sentences at most, plain and direct, no marketing. Never invent a course or a fact.`;

async function ask(query) {
  const courses = await loadCatalog();
  const body = {
    model: MODEL,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Request: ${query}\n\nCatalogue:\n${JSON.stringify(courses.map(compact))}` },
    ],
  };
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "HTTP-Referer": "https://upsy-courses.onrender.com", "X-Title": "UPSY Courses" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`openrouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "{}";
  const parsed = JSON.parse(text);
  const ids = new Set(courses.map((c) => c.id));
  parsed.results = (parsed.results || []).filter((r) => r && ids.has(r.id)).slice(0, 6);
  parsed.understood = parsed.understood || {};
  parsed.answer = String(parsed.answer || "");
  parsed.model = MODEL;
  parsed.usage = data.usage;
  return parsed;
}

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, GET, OPTIONS" };
const send = (res, status, obj) => { res.writeHead(status, { ...cors, "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };

http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
    return send(res, 200, { ok: true, model: MODEL, keyConfigured: Boolean(KEY), catalogue: CATALOG_URL });
  }
  if (req.method === "POST" && req.url === "/ask") {
    if (!KEY) return send(res, 503, { error: "OPENROUTER_API_KEY is not set" });
    let raw = "";
    req.on("data", (d) => { raw += d; if (raw.length > 4000) req.destroy(); });
    req.on("end", async () => {
      try {
        const query = String(JSON.parse(raw || "{}").query || "").trim().slice(0, 500);
        if (!query) return send(res, 400, { error: "query is required" });
        const t0 = Date.now();
        const out = await ask(query);
        out.ms = Date.now() - t0;
        console.log(`[ask] ${out.ms}ms ${out.results.length} results "${query}"`);
        send(res, 200, out);
      } catch (e) {
        console.error("[ask] failed:", e.message);
        send(res, 502, { error: e.message });
      }
    });
    return;
  }
  send(res, 404, { error: "not found" });
}).listen(PORT, () => console.log(`upsy-courses api on :${PORT} model=${MODEL} key=${KEY ? "set" : "MISSING"}`));
