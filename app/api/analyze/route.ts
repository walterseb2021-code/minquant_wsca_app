// app/api/analyze/route.ts
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";
export const maxDuration = 60;

type MineralResult = { name: string; pct: number; confidence?: number; evidence?: string };

const TEMPERATURE = 0.2;
const CONF_MIN = 0.30;
const PCT_MIN = 1.0;
const CONSENSUS_MIN_IMAGES = 2;
const CONSENSUS_HIGH_CONF = 0.8;

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

const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 800;

// ---------- utils básicos
const toBase64 = (f: File) => f.arrayBuffer().then(ab => Buffer.from(ab).toString("base64"));
const cleanName = (raw: string) =>
  String(raw || "")
    .trim()
    .replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 \-()/]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^./, c => c.toUpperCase());

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

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
    let i = 0;
    for (let j = 1; j < rounded.length; j++) if (rounded[j].pct > rounded[i].pct) i = j;
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

  // Quitar fences ``` / ```json
  t = t.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();

  // Si viene HTML, intenta extraer primer bloque {...} o [...]
  if (t.startsWith("<")) {
    const m = t.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (m) t = m[1];
  }
  try { return JSON.parse(t); } catch {}

  // Si vino { "results": [...] } dentro de texto
  const arrMatch = t.match(/\{[\s\S]*"results"\s*:\s*(\[[\s\S]*?\])[\s\S]*\}/);
  if (arrMatch) {
    try { return { results: JSON.parse(arrMatch[1]) }; } catch {}
  }
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

      // “ping” liviano con retry: evita quedarnos con un modelo saturado
      await genWithRetry(model, [{ role: "user", parts: [{ text: "ok" }] }]);
      return model;
    } catch (e: any) {
      errors.push(`${name}: ${e?.message || e}`);
      continue;
    }
  }
  throw new Error("Ningún modelo respondió. Intentados → " + errors.join(" | "));
}

// ---------- generateContent con reintentos/backoff para 429/503
async function genWithRetry(
  model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]>,
  contents: any
) {
  let delay = INITIAL_DELAY_MS;
  for (let i = 0; i <= MAX_RETRIES; i++) {
    try {
      // SDK v1 acepta objeto contents o array de messages; mantenemos compatibilidad
      const res = await (model as any).generateContent({ contents });
      return res;
    } catch (e: any) {
      const msg = String(e?.message || e);
      const maybeOverload = /(?:503|overloaded|quota|rate|429)/i.test(msg);
      if (i < MAX_RETRIES && maybeOverload) {
        await sleep(delay);
        delay *= 1.6; // backoff
        continue;
      }
      throw e;
    }
  }
  throw new Error("Sin respuesta tras reintentos.");
}

/* ===========================  MODO OFFLINE  =========================== */
/** Para pruebas sin Gemini. Activa con:
 *   - .env.local → ANALYZE_OFFLINE=1
 *   - o llamando /api/analyze?offline=1
 */
function offlineAnalyze(files: File[]) {
  // minerales “demo” frecuentes
  const demoSets: string[][] = [
    ["Malaquita", "Azurita", "Limonita"],
    ["Cuarzo", "Calcita", "Hematita"],
    ["Pirita", "Cuarzo", "Goethita"],
  ];
  const perImage = files.map((f, idx) => {
    const set = demoSets[idx % demoSets.length];
    // reparto simple 50/30/20 con pequeñas variaciones
    const base = [50, 30, 20];
    const jitter = base.map(v => v + (Math.random() * 6 - 3));
    const sum = jitter.reduce((a, b) => a + b, 0);
    const norm = jitter.map(v => +(v / sum * 100).toFixed(2));

    const results: MineralResult[] = set.map((n, i) => ({
      name: n,
      pct: norm[i],
      confidence: 0.9 - i * 0.15,
      evidence: "offline",
    }));
    return { fileName: f.name || `foto-${idx + 1}.jpg`, results: normalizeTo100(results) };
  });

  const global = computeGlobal(perImage);
  return { perImage, global, offline: true };
}

/* ===========================   HANDLER    =========================== */
export async function POST(req: Request) {
  try {
    // ¿modo offline?
    const url = new URL(req.url);
    const offlineFlag = url.searchParams.get("offline") === "1" || process.env.ANALYZE_OFFLINE === "1";

    const form = await req.formData();
    const files = form.getAll("images") as File[];
    if (!files.length) return Response.json({ error: "Sin imágenes" }, { status: 400 });

    if (offlineFlag) {
      const out = offlineAnalyze(files);
      return Response.json(out, { status: 200 });
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return Response.json({ error: "Falta GEMINI_API_KEY" }, { status: 400 });
    }

    const ai = new GoogleGenerativeAI(apiKey);
    const model = await getFirstWorkingModel(ai, apiKey);

    const perRaw: { fileName: string; results: MineralResult[] }[] = [];

    for (const f of files) {
      const b64 = await toBase64(f);
      const mime = f.type || "image/jpeg";
      const prompt =
        `Devuelve SOLO JSON EXACTO:\n` +
        `{\n  "results": [\n    {"name":"<mineral>","pct":<numero>,"confidence":<0..1>,"evidence":"<color/textura/forma>"}\n  ]\n}\n` +
        `Reglas:\n` +
        `1) Da de 2 a 5 minerales plausibles en la foto.\n` +
        `2) Suma de "pct" = 100.00 (dos decimales).\n` +
        `3) Usa nombres estándar (Calcita, Cuarzo, Pirita, Hematita, Magnetita, Malaquita, Azurita, etc.).\n` +
        `4) Sé conservador con "confidence".\n` +
        `5) Sin texto fuera del JSON.`;

      const res = await genWithRetry(
        model,
        [{ role: "user", parts: [{ inlineData: { mimeType: mime, data: b64 } }, { text: prompt }] }]
      );

      let results: MineralResult[] = [];
      try {
        const rawText = res?.response?.text?.() ?? "";
        const parsed = extractJson(rawText) ?? {};
        const arr = Array.isArray((parsed as any).results) ? (parsed as any).results : [];
        results = (arr as MineralResult[]).filter(Boolean);
      } catch {
        results = [];
      }

      perRaw.push({ fileName: f.name || "foto.jpg", results });
    }

    // Filtro + rescate
    let perImage = perRaw.map(x => {
      const filtered = filterPerImage(x.results);
      if (!filtered.length) {
        const topRaw = (x.results || [])
          .map(r => ({
            name: cleanName(r.name || "Indeterminado"),
            pct: Number(r.pct || 0),
            confidence: typeof r.confidence === "number" ? r.confidence : 0.25,
          }))
          .filter(r => r.name && r.pct > 0)
          .sort((a, b) => b.pct - a.pct)
          .slice(0, 5);
        const rescued = normalizeTo100(topRaw.length ? topRaw : [{ name: "Indeterminado", pct: 100 }]);
        return { fileName: x.fileName, results: rescued };
      }
      return { fileName: x.fileName, results: filtered };
    });

    // Consenso
    if (perImage.length >= 2) {
      const keep = new Set(consensusAcrossImages(perImage));
      perImage = perImage.map(img => {
        const filtered = img.results.filter(r => keep.has(r.name.toLowerCase()));
        return filtered.length ? { ...img, results: normalizeTo100(filtered) } : img;
      });
    }

    // Seguridad mínima
    perImage = perImage.map(img =>
      img.results.length ? img : { ...img, results: [{ name: "Indeterminado", pct: 100 }] },
    );

    const global = computeGlobal(perImage);

    return Response.json({ perImage, global }, { status: 200 });
  } catch (e: any) {
    return Response.json({ error: e?.message || "Error analizando" }, { status: 500 });
  }
}
