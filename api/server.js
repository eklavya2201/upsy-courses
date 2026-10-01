// UPSY Courses: AI search API.
//
// Two endpoints, both JSON, both fed the WHOLE catalogue (it is small):
//   POST /ask  { query }                      -> { understood, results:[{id, reason}], answer }
//   POST /chat { messages, context }          -> { reply, results:[{id, reason}] }
// /ask ranks a search. /chat is the assistant panel: a short conversational
// reply, plus a ranking whenever the user is asking to choose, so the results
// pane can re-order itself with a reason under each course.
//
// The page never depends on this service being awake: it ranks locally first
// and upgrades when this answers, so a cold start here costs nothing visible.
//
// Env: OPENROUTER_API_KEY (required), OPENROUTER_MODEL (default openai/gpt-4o-mini),
//      CATALOG_URL (default: the static site's catalog), PORT.
import http from "node:http";

const PORT = Number(process.env.PORT || 8787);
const MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
const CATALOG_URL = process.env.CATALOG_URL || "https://upsy-courses.onrender.com/catalog/courses.json";
const KEY = process.env.OPENROUTER_API_KEY;

let catalog = null, catalogAt = 0;
async function loadCatalog() {
  if (catalog && Date.now() - catalogAt < 5 * 60 * 1000) return catalog;
  const res = await fetch(CATALOG_URL);
  if (!res.ok) throw new Error(`catalog ${res.status}`);
  catalog = (await res.json()).courses;
  catalogAt = Date.now();
  return catalog;
}
const compact = (c) => ({
  id: c.id, title: c.title, provider: c.provider, institution: c.institution, type: c.type, level: c.level,
  free: c.free, certificate: c.certificate, selfPaced: c.selfPaced, language: c.language,
  hours: c.durationHours, rating: c.rating, reviews: c.numRatings, skills: c.skills, summary: c.summary,
  careers: (c.careers || []).map((x) => `${x.title} ${x.salary}`),
});

const ASK_SYSTEM = `You are the search engine for UPSY Courses, a catalogue of online courses.
You get the learner's request and the full catalogue as JSON. Reply with JSON only:
{"understood": {"topic": string|null, "level": "Beginner"|"Intermediate"|"Advanced"|null, "free": boolean|null, "certificate": boolean|null, "maxHours": number|null, "provider": string|null, "goal": string|null},
 "results": [{"id": string, "reason": string}],
 "answer": string}
Rules: results are catalogue ids only, best first, at most 6, and only courses that genuinely fit; an empty list is a valid answer.
Each reason is one short sentence naming the concrete fact that makes it fit (hours, level, price, rating, a skill).
"answer" is two sentences at most, plain and direct, no marketing. Never invent a course or a fact.`;

const CHAT_SYSTEM = `You are UPSY, the assistant on UPSY Courses, a catalogue of online courses. You help a learner pick and plan.
You get the conversation, the context (their search query and the course ids currently on screen, or the course page they are reading) and the full catalogue as JSON.
Reply with JSON only: {"reply": string, "results": [{"id": string, "reason": string}]}
"reply": 2 to 5 short sentences, warm but plain, no bullet points, no markdown, no marketing. Name courses by their title. Ask one clarifying question if the request is too vague to choose.
"results": when the learner is asking you to choose, recommend, compare or find courses, list the catalogue ids you recommend, best first, at most 5, each with a one-sentence reason naming a concrete fact. Otherwise an empty list.
Only ever use ids and facts from the catalogue. If nothing fits, say so and suggest the closest thing.`;

async function complete(system, user, temperature = 0.3) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "HTTP-Referer": "https://upsy-courses.onrender.com", "X-Title": "UPSY Courses" },
    body: JSON.stringify({ model: MODEL, temperature, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, ...user] }),
  });
  if (!res.ok) throw new Error(`openrouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return { parsed: JSON.parse(data.choices?.[0]?.message?.content || "{}"), usage: data.usage };
}
const onlyKnown = (results, ids, max) => (Array.isArray(results) ? results : []).filter((r) => r && ids.has(r.id)).map((r) => ({ id: r.id, reason: String(r.reason || "") })).slice(0, max);

async function ask(query) {
  const courses = await loadCatalog();
  const ids = new Set(courses.map((c) => c.id));
  const { parsed, usage } = await complete(ASK_SYSTEM, [{ role: "user", content: `Request: ${query}\n\nCatalogue:\n${JSON.stringify(courses.map(compact))}` }], 0.2);
  return { understood: parsed.understood || {}, results: onlyKnown(parsed.results, ids, 6), answer: String(parsed.answer || ""), model: MODEL, usage };
}

async function chat(messages, context) {
  const courses = await loadCatalog();
  const ids = new Set(courses.map((c) => c.id));
  const clean = (Array.isArray(messages) ? messages : []).filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-8).map((m) => ({ role: m.role, content: m.content.slice(0, 1000) }));
  if (!clean.length) throw new Error("messages is required");
  const ctx = [];
  if (context?.query) ctx.push(`The learner searched for: "${String(context.query).slice(0, 200)}".`);
  if (Array.isArray(context?.resultIds) && context.resultIds.length) ctx.push(`Courses on their screen, top first: ${context.resultIds.slice(0, 8).join(", ")}.`);
  if (context?.courseId && ids.has(context.courseId)) ctx.push(`They are reading the page of course id "${context.courseId}". Answer about that course unless they ask for alternatives.`);
  const prelude = { role: "user", content: `${ctx.join(" ")}\n\nCatalogue:\n${JSON.stringify(courses.map(compact))}` };
  const { parsed, usage } = await complete(CHAT_SYSTEM, [prelude, { role: "assistant", content: '{"reply":"Understood.","results":[]}' }, ...clean], 0.4);
  return { reply: String(parsed.reply || "").trim(), results: onlyKnown(parsed.results, ids, 5), model: MODEL, usage };
}

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, GET, OPTIONS" };
const send = (res, status, obj) => { res.writeHead(status, { ...cors, "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
const readJson = (req) => new Promise((resolve, reject) => {
  let raw = "";
  req.on("data", (d) => { raw += d; if (raw.length > 20000) { reject(new Error("body too large")); req.destroy(); } });
  req.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch (e) { reject(e); } });
});

http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  if (req.method === "GET" && (req.url === "/" || req.url === "/health")) return send(res, 200, { ok: true, model: MODEL, keyConfigured: Boolean(KEY), catalogue: CATALOG_URL });
  if (req.method === "POST" && (req.url === "/ask" || req.url === "/chat")) {
    if (!KEY) return send(res, 503, { error: "OPENROUTER_API_KEY is not set" });
    const t0 = Date.now();
    try {
      const body = await readJson(req);
      let out;
      if (req.url === "/ask") {
        const query = String(body.query || "").trim().slice(0, 500);
        if (!query) return send(res, 400, { error: "query is required" });
        out = await ask(query);
        console.log(`[ask] ${Date.now() - t0}ms ${out.results.length} results "${query}"`);
      } else {
        out = await chat(body.messages, body.context || {});
        console.log(`[chat] ${Date.now() - t0}ms ${out.results.length} results`);
      }
      out.ms = Date.now() - t0;
      send(res, 200, out);
    } catch (e) {
      console.error(`[${req.url}] failed:`, e.message);
      send(res, 502, { error: e.message });
    }
    return;
  }
  send(res, 404, { error: "not found" });
}).listen(PORT, () => console.log(`upsy-courses api on :${PORT} model=${MODEL} key=${KEY ? "set" : "MISSING"}`));
