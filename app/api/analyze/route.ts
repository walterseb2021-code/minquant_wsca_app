// app/api/analyze/route.ts
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";
export const maxDuration = 60;

type MineralResult = { name: string; pct: number; confidence?: number; evidence?: string };
type OneImage = { fileName: string; results: MineralResult[] };
type Excluded = { fileName: string; reason: "timeout" | "parse_error" | "low_confidence" | "no_consensus" };

const TEMPERATURE = 0.2;
const CONF_MIN = 0.30;             // confianza mínima por mineral
const PCT_MIN = 1.0;               // % mínimo por mineral
const CONSENSUS_MIN_IMAGES = 2;    // presente en >= 2 fotos...
const CONSENSUS_HIGH_CONF = 0.8;   // ...o con confianza alta

const STATIC_FALLBACKS = [
  "gemini-2.5-flash-preview-05-20",
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.0-flash",
  "gemini-1.5-flash-8b",
  "gemini-1.5-flash",
  "gemini-2.5-pro",
  "gemini-pro-latest",
];

const MAX_RETRIES = 2;
const INITIAL_DELAY_MS = 700;

// ===== límites para evitar 504
const SERVER_MAX_IMAGES = 6;
const PER_IMAGE_TIMEOUT_MS = 15_000; // 15 s por imagen
const CONCURRENCY = 2;               // 2 imágenes a la vez

// ---------- utils básicos
const toBase64 = (f: File) => f.arrayBuffer().then(ab => Buffer.from(ab).toString("base64"));
const cleanName = (raw: string) =>
  String(raw || "")
    .trim()
    .replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 \-()/]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^./, c => c.toUpperCase());
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function withTimeout<T>(p: Promise<T>, ms: number, tag = "timeout"): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(tag)), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

function mergeDuplicates(arr: MineralResult[]): MineralResult[] {
  const map = new Map<string, MineralResult>();
  for (const it of arr) {
    const k = it.name.toLowerCase();
    const prev = map.get(k);
    if (prev) {
      map.set(k, {
        name: prev.name,
        pct: prev.pct + (it.pct || 0),
        confidence: Math.max(prev.confidence ?? 0, it.confidence ?? 0),
        evidence: prev.evidence || it.evidence,
      });
    } else {
      map.set(k, { ...it, pct: it.pct ?? 0 });
    }
  }
  return [...map.values()];
}
function normalizeTo100(results: MineralResult[]): MineralResult[] {
  const sum = results.reduce((a, b) => a + (b.pct || 0), 0);
  if (sum <= 0) return results.map(r => ({ ...r, pct: 0 }));
  const scaled = results.map(r => ({ ...r, pct: (r.pct / sum) * 100 }));
  const rounded = scaled.map(r => ({ ...r, pct: Math.round(r.pct * 100) / 100 }));
  const tot = +rounded.reduce((a, b) => a + b.pct, 0).toFixed(2);
  const diff = +(100 - tot).toFixed(2);
  if (diff !== 0 && rounded.length) {
    let i = 0; for (let j = 1; j < rounded.length; j++) if (rounded[j].pct > rounded[i].pct) i = j;
    rounded[i] = { ...rounded[i], pct: +(rounded[i].pct + diff).toFixed(2) };
  }
  return rounded;
}
function filterPerImage(list: MineralResult[]): MineralResult[] {
  let r = (list || [])
    .map(it => ({
      name: cleanName(it.name),
      pct: Number(it.pct ?? 0),
      confidence: typeof it.confidence === "number" ? it.confidence : undefined,
      evidence: it.evidence,
    }))
    .filter(it => it.name && it.pct >= 0);

  r = mergeDuplicates(r);
  r = r.filter(it => (it.confidence ?? 0) >= CONF_MIN && it.pct >= PCT_MIN);
  r.sort((a, b) => b.pct - a.pct || (b.confidence ?? 0) - (a.confidence ?? 0));
  return normalizeTo100(r);
}
function consensusAcrossImages(perImage: { results: MineralResult[] }[]): string[] {
  const count: Record<string, { n: number; maxConf: number }> = {};
  perImage.forEach(img => {
    img.results.forEach(r => {
      const k = r.name.toLowerCase();
      if (!count[k]) count[k] = { n: 0, maxConf: 0 };
      count[k].n++;
      count[k].maxConf = Math.max(count[k].maxConf, r.confidence ?? 0);
    });
  });
  return Object.entries(count)
    .filter(([, v]) => v.n >= CONSENSUS_MIN_IMAGES || v.maxConf >= CONSENSUS_HIGH_CONF)
    .map(([k]) => k);
}
function computeGlobal(perImage: { results: MineralResult[] }[]) {
  const m = new Map<string, { sumPct: number; sumConf: number; count: number; name: string }>();
  for (const img of perImage) {
    for (const r of img.results) {
      const k = r.name.toLowerCase();
      const prev = m.get(k) || { sumPct: 0, sumConf: 0, count: 0, name: r.name };
      prev.sumPct += r.pct;
      prev.sumConf += r.confidence ?? 0.5;
      prev.count += 1;
      prev.name = r.name;
      m.set(k, prev);
    }
  }
  let out = [...m.values()].map(v => ({
    name: v.name,
    pct: +(v.sumPct / v.count).toFixed(2),
    confidence: +((v.sumConf / v.count)).toFixed(2),
  }));
  out.sort((a, b) => b.pct - a.pct);
  return normalizeTo100(out);
}

// ---------- Parseo robusto
function extractJson(text: string): any {
  if (!text) return null;
  let t = text.trim();
  t = t.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim(); // ``` fences
  if (t.startsWith("<")) { const m = t.match(/(\{[\s\S]*\}|\[[\s\S]*\])/); if (m) t = m[1]; }
  try { return JSON.parse(t); } catch {}
  const arrMatch = t.match(/\{[\s\S]*"results"\s*:\s*(\[[\s\S]*?\])[\s\S]*\}/);
  if (arrMatch) { try { return { results: JSON.parse(arrMatch[1]) }; } catch {} }
  return null;
}

// ---------- Descubrir/seleccionar modelo
async function listModelsForKey(apiKey: string): Promise<string[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  try {
    const r = await fetch(url, { cache: "no-store" });
    const j = await r.json();
    const names: string[] = Array.isArray(j?.models) ? j.models.map((m: any) => m?.name).filter(Boolean) : [];
    return names.map(n => n.replace(/^models\//, ""));
  } catch { return []; }
}
async function getFirstWorkingModel(ai: GoogleGenerativeAI, apiKey: string) {
  const fromApi = await listModelsForKey(apiKey);
  const candidates = [...new Set([...fromApi, ...STATIC_FALLBACKS])];
  const errors: string[] = [];
  for (const name of candidates) {
    try {
      const model = ai.getGenerativeModel({
        model: name,
        generationConfig: {
          temperature: TEMPERATURE,
          topK: 40,
          topP: 0.5,
          responseMimeType: "application/json",
        } as any,
      });
      await genWithRetry(model, [{ role: "user", parts: [{ text: "ok" }] }]); // ping
      return model;
    } catch (e: any) { errors.push(`${name}: ${e?.message || e}`); continue; }
  }
  throw new Error("Ningún modelo respondió. Intentados → " + errors.join(" | "));
}

// ---------- generateContent con reintentos/backoff para 429/503
async function genWithRetry(model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]>, contents: any) {
  let delay = INITIAL_DELAY_MS;
  for (let i = 0; i <= MAX_RETRIES; i++) {
    try { return await (model as any).generateContent({ contents }); }
    catch (e: any) {
      const msg = String(e?.message || e);
      const maybeOverload = /(?:503|overloaded|quota|rate|429)/i.test(msg);
      if (i < MAX_RETRIES && maybeOverload) { await sleep(delay); delay *= 1.6; continue; }
      throw e;
    }
  }
  throw new Error("Sin respuesta tras reintentos.");
}

/* ===========================  MODO OFFLINE  =========================== */
function offlineAnalyze(files: File[]) {
  const demoSets: string[][] = [
    ["Malaquita", "Azurita", "Limonita"],
    ["Cuarzo", "Calcita", "Hematita"],
    ["Pirita", "Cuarzo", "Goethita"],
  ];
  const perImage = files.map((f, idx) => {
    const set = demoSets[idx % demoSets.length];
    const base = [50, 30, 20];
    const jitter = base.map(v => v + (Math.random() * 6 - 3));
    const sum = jitter.reduce((a, b) => a + b, 0);
    const norm = jitter.map(v => +(v / sum * 100).toFixed(2));
    const results: MineralResult[] = set.map((n, i) => ({
      name: n, pct: norm[i], confidence: 0.9 - i * 0.15, evidence: "offline",
    }));
    return { fileName: f.name || `foto-${idx + 1}.jpg`, results: normalizeTo100(results) };
  });
  const global = computeGlobal(perImage);
  return { perImage, global, excluded: [] as Excluded[], offline: true };
}

/* ===========================   HANDLER    =========================== */
export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const offlineFlag = url.searchParams.get("offline") === "1" || process.env.ANALYZE_OFFLINE === "1";

    const form = await req.formData();
    let files = (form.getAll("images") as File[]).filter(Boolean);
    if (!files.length) return Response.json({ error: "Sin imágenes" }, { status: 400 });

    if (files.length > SERVER_MAX_IMAGES) files = files.slice(0, SERVER_MAX_IMAGES);

    if (offlineFlag) {
      const out = offlineAnalyze(files);
      return Response.json(out, { status: 200 });
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) return Response.json({ error: "Falta GEMINI_API_KEY" }, { status: 400 });

    const ai = new GoogleGenerativeAI(apiKey);
    const model = await getFirstWorkingModel(ai, apiKey);

    const prompt =
      `Devuelve SOLO JSON EXACTO:\n` +
      `{\n  "results": [\n    {"name":"<mineral>","pct":<numero>,"confidence":<0..1>,"evidence":"<color/textura/forma>"}\n  ]\n}\n` +
      `Reglas:\n` +
      `1) Da de 2 a 5 minerales plausibles en la foto.\n` +
      `2) Suma de "pct" = 100.00 (dos decimales).\n` +
      `3) Usa nombres estándar (Calcita, Cuarzo, Pirita, Hematita, Magnetita, Malaquita, Azurita, etc.).\n` +
      `4) Sé conservador con "confidence".\n` +
      `5) Sin texto fuera del JSON.`;

    const perRaw: OneImage[] = [];
    const excluded: Excluded[] = [];

    async function analyzeOne(f: File) {
      try {
        const b64 = await toBase64(f);
        const mime = f.type || "image/jpeg";
        const res = await withTimeout(
          genWithRetry(
            model,
            [{ role: "user", parts: [{ inlineData: { mimeType: mime, data: b64 } }, { text: prompt }] }]
          ),
          PER_IMAGE_TIMEOUT_MS,
          "timeout"
        );
        const rawText = res?.response?.text?.() ?? "";
        const parsed = extractJson(rawText) ?? {};
        const arr = Array.isArray((parsed as any).results) ? (parsed as any).results : [];
        const results: MineralResult[] = (arr as MineralResult[]).filter(Boolean);
        return { fileName: f.name || "foto.jpg", results };
      } catch (e: any) {
        excluded.push({ fileName: f.name || "foto.jpg", reason: e?.message === "timeout" ? "timeout" : "parse_error" });
        return { fileName: f.name || "foto.jpg", results: [] };
      }
    }

    // Concurrencia limitada
    const tasks: Promise<void>[] = [];
    let idx = 0;
    async function worker() {
      while (idx < files.length) {
        const i = idx++;
        const out = await analyzeOne(files[i]);
        perRaw.push(out);
      }
    }
    for (let i = 0; i < Math.min(CONCURRENCY, files.length); i++) tasks.push(worker());
    await Promise.all(tasks);

    // Filtro por imagen (baja confianza) y registro en excluded
    let perImage = perRaw.map(x => {
      const filtered = filterPerImage(x.results);
      if (!filtered.length) excluded.push({ fileName: x.fileName, reason: "low_confidence" });
      return { fileName: x.fileName, results: filtered.length ? filtered : [] };
    });

    // Consenso entre imágenes
    if (perImage.length >= 2) {
      const keep = new Set(consensusAcrossImages(perImage));
      perImage = perImage.map(img => {
        const kept = img.results.filter(r => keep.has(r.name.toLowerCase()));
        if (!kept.length && img.results.length) excluded.push({ fileName: img.fileName, reason: "no_consensus" });
        return kept.length ? { ...img, results: normalizeTo100(kept) } : { ...img, results: [] };
      });
    }

    // Siempre incluir una fila “Indeterminado” si quedó vacío
    perImage = perImage.map(img =>
      img.results.length ? img : { ...img, results: [{ name: "Indeterminado", pct: 100, confidence: 0.2 }] },
    );

    const global = computeGlobal(perImage);

    return Response.json({ perImage, global, excluded }, { status: 200 });
  } catch (e: any) {
    return Response.json({ error: e?.message || "Error analizando" }, { status: 500 });
  }
}
