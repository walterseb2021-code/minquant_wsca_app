// app/api/analyze/route.ts
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";
export const maxDuration = 60;

type MineralResult = { name: string; pct: number; confidence?: number; evidence?: string };
type OneImage = { fileName: string; results: MineralResult[] };
type Excluded = { fileName: string; reason: "timeout" | "parse_error" | "low_confidence" | "no_consensus" };

const TEMPERATURE = 0.2;

// === UMBRALES (ajustados para evitar “Indeterminado” en exceso) ===
const CONF_MIN = 0.28;           // confianza mínima por mineral (↓ un poco)
const PCT_MIN = 0.5;             // % mínimo por mineral (↓ un poco)
const LOW_CONF_REASON = 0.35;    // por debajo de esto, marcamos motivo explicitamente
const CONSENSUS_MIN_IMAGES = 2;  // presente en >= 2 fotos...
const CONSENSUS_HIGH_CONF = 0.80;// ...o con confianza alta

// === Modelos fallback ===
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

// === Límites de servidor
const SERVER_MAX_IMAGES = 6;
const PER_IMAGE_TIMEOUT_MS = 15_000;
const CONCURRENCY = 2;

// ---------- utils
const toBase64 = (f: File) => f.arrayBuffer().then(ab => Buffer.from(ab).toString("base64"));
const cleanName = (raw: string) =>
  String(raw || "")
    .trim()
    .replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 \-()/]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^./, c => c.toUpperCase());

/** Normaliza nombres de minerales a ESPAÑOL y fusiona variantes español/inglés/sin acentos */
function normalizeMineralName(name: string): string {
  const raw = name || "";
  const n = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  if (!n) return raw;

  // ================= GENERALES / GANGA =================
  if (/^(indeterminado|unknown|no identificado|desconocido)$/.test(n)) {
    return "Indeterminado";
  }

  if (/(cuarzo|quartz)/.test(n)) {
    return "Cuarzo";
  }

  if (/(calcita|calcite)/.test(n)) {
    return "Calcita";
  }

  if (/(dolomita|dolomite)/.test(n)) {
    return "Dolomita";
  }

  if (/(barita|barite)/.test(n)) {
    return "Barita";
  }

  // ================= HIERRO (Fe) =================
  if (/(hematita|hematite)/.test(n)) {
    return "Hematita";
  }

  if (/(magnetita|magnetite)/.test(n)) {
    return "Magnetita";
  }

  if (/(goethita|goethite)/.test(n)) {
    return "Goethita";
  }

  if (/(limonita|limonite)/.test(n)) {
    return "Limonita";
  }

  if (/(siderita|siderite)/.test(n)) {
    return "Siderita";
  }

  if (/(oxidos? de hierro|iron oxides?)/.test(n)) {
    return "Óxidos de hierro";
  }

  // ================= COBRE (Cu) =================
  if (/(calcopirita|chalcopyrite)/.test(n)) {
    return "Calcopirita";
  }

  if (/(bornita|bornite)/.test(n)) {
    return "Bornita";
  }

  if (/(calcosina|chalcocite)/.test(n)) {
    return "Calcosina";
  }

  if (/(covelina|covellite)/.test(n)) {
    return "Covelina";
  }

  if (/(enargita|enargite)/.test(n)) {
    return "Enargita";
  }

  if (/(malaquita|malachite)/.test(n)) {
    return "Malaquita";
  }

  if (/(azurita|azurite)/.test(n)) {
    return "Azurita";
  }

  if (/(crisocola|chrysocolla)/.test(n)) {
    return "Crisocola";
  }

  if (/(cuprita|cuprite)/.test(n)) {
    return "Cuprita";
  }

  if (/(tenorita|tenorite)/.test(n)) {
    return "Tenorita";
  }

  // ================= ORO (Au) =================
  if (/(oro nativo|oro|gold)/.test(n)) {
    return "Oro nativo";
  }

  if (/(electrum|electro)/.test(n)) {
    return "Electrum";
  }

  if (/(calaverita|calaverite)/.test(n)) {
    return "Calaverita";
  }

  // ================= PLATA (Ag) =================
  if (/(plata nativa|plata|silver)/.test(n)) {
    return "Plata nativa";
  }

  if (/(acantita|acanthite)/.test(n)) {
    return "Acantita";
  }

  if (/(argentita|argentite)/.test(n)) {
    return "Argentita";
  }

  if (/(pirargirita|pyrargyrite)/.test(n)) {
    return "Pirargirita";
  }

  if (/(proustita|proustite)/.test(n)) {
    return "Proustita";
  }

  // ================= PLOMO (Pb) =================
  if (/(galena)/.test(n)) {
    return "Galena";
  }

  if (/(cerusita|cerussite)/.test(n)) {
    return "Cerusita";
  }

  if (/(anglesita|anglesite)/.test(n)) {
    return "Anglesita";
  }

  // ================= ZINC (Zn) =================
  if (/(esfalerita|sphalerite|blenda)/.test(n)) {
    return "Esfalerita";
  }

  if (/(smithsonita|smithsonite)/.test(n)) {
    return "Smithsonita";
  }

  if (/(hemimorfita|hemimorphite)/.test(n)) {
    return "Hemimorfita";
  }

  // ================= NÍQUEL (Ni) =================
  if (/(pentlandita|pentlandite)/.test(n)) {
    return "Pentlandita";
  }

  if (/(millerita|millerite)/.test(n)) {
    return "Millerita";
  }

  if (/(garnierita|garnierite)/.test(n)) {
    return "Garnierita";
  }

  // ================= ESTAÑO (Sn) =================
  if (/(casiterita|cassiterite)/.test(n)) {
    return "Casiterita";
  }

  // ================= TUNGSTENO (W) =================
  if (/(scheelita|scheelite)/.test(n)) {
    return "Scheelita";
  }

  if (/(wolframita|wolframite)/.test(n)) {
    return "Wolframita";
  }

  // ================= MOLIBDENO (Mo) =================
  if (/(molibdenita|molybdenite)/.test(n)) {
    return "Molibdenita";
  }

  // ================= COBALTO (Co) =================
  if (/(cobaltita|cobaltite)/.test(n)) {
    return "Cobaltita";
  }

  // ================= ANTIMONIO (Sb) =================
  if (/(antimonita|stibnite)/.test(n)) {
    return "Antimonita";
  }

  // ================= MANGANESO (Mn) =================
  if (/(pirolusita|pyrolusite)/.test(n)) {
    return "Pirolusita";
  }

  if (/(rodocrosita|rhodochrosite)/.test(n)) {
    return "Rodocrosita";
  }

  // ================= LITIO (Li) =================
  if (/(espodumena|spodumene)/.test(n)) {
    return "Espodumena";
  }

  if (/(lepidolita|lepidolite)/.test(n)) {
    return "Lepidolita";
  }

  // ================= Tierras raras (REE) =================
  if (/(monacita|monazite)/.test(n)) {
    return "Monacita";
  }

  if (/(bastnasita|bastnaesite)/.test(n)) {
    return "Bastnasita";
  }

  // Si no entra en ningún caso, devolvemos el nombre original
  return raw;
}

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
        pct: (prev.pct || 0) + (it.pct || 0),
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

/**
 * Filtro principal por imagen.
 * - Aplica limpieza, fusiones y umbrales.
 * - Si TODO queda fuera, conservamos las 2 mejores hipótesis (top-2 por confianza)
 *   para evitar el “Indeterminado” sistemático y dar pistas al usuario.
 */
function filterPerImageWithFallback(list: MineralResult[]): {
  kept: MineralResult[];
  droppedForLowConf: boolean;
} {
 let r = (list || [])
  .map(it => {
    const cleaned = cleanName(it.name);
    const normalized = normalizeMineralName(cleaned);

    return {
      name: normalized, // 👈 ya normalizado
      pct: Number(it.pct ?? 0),
      confidence: typeof it.confidence === "number" ? it.confidence : undefined,
      evidence: it.evidence,
    };
  })
  .filter(it => it.name && it.pct >= 0);


  r = mergeDuplicates(r);

  // 1) Filtro “duro”
  let kept = r.filter(it => (it.confidence ?? 0) >= CONF_MIN && it.pct >= PCT_MIN);
  kept.sort((a, b) => b.pct - a.pct || (b.confidence ?? 0) - (a.confidence ?? 0));

  const droppedForLowConf = kept.length === 0;

  // 2) Fallback: si no quedó nada, devolvemos top-2 por confianza (aunque sean < CONF_MIN)
  if (kept.length === 0 && r.length) {
    const ranked = [...r].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0) || b.pct - a.pct);
    kept = ranked.slice(0, Math.min(2, ranked.length)).map(x => ({
      ...x,
      // “suavizamos” % para que sumen 100 entre ellas
      pct: x.pct > 0 ? x.pct : 1,
    }));
  }

  return { kept: normalizeTo100(kept), droppedForLowConf };
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

      const normalized = normalizeMineralName(r.name);
      const k = normalized.toLowerCase();

      const prev = m.get(k) || { sumPct: 0, sumConf: 0, count: 0, name: normalized };

      prev.sumPct += r.pct;
      prev.sumConf += r.confidence ?? 0.5;
      prev.count += 1;
      prev.name = normalized;

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
  t = t.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  if (t.startsWith("<")) { const m = t.match(/(\{[\s\S]*\}|\[[\s\S]*\])/); if (m) t = m[1]; }
  try { return JSON.parse(t); } catch {}
  const arrMatch = t.match(/\{[\s\S]*"results"\s*:\s*(\[[\s\S]*?\])[\s\S]*\}/);
  if (arrMatch) { try { return { results: JSON.parse(arrMatch[1]) }; } catch {} }
  return null;
}

// ---------- Modelos
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
  const interpretation = {
    geology: "Asociación coherente con ambientes de oxidación/cupríferos (ej. malaquita/azurita + limonita).",
    economics: "Posible interés por cobre si la fracción pagable es significativa; confirmar con análisis químico.",
    caveats: "Estimación visual/IA; validar con ensayo de laboratorio antes de decisiones.",
  };
  return { perImage, global, excluded: [] as Excluded[], interpretation, offline: true };
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
      `3) Usa nombres estándar.\n` +
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

    // Filtrar por imagen con fallback + marcar razones
    let perImage = perRaw.map(x => {
      const { kept, droppedForLowConf } = filterPerImageWithFallback(x.results);
      if (kept.length === 0) {
        excluded.push({ fileName: x.fileName, reason: "low_confidence" });
      } else if (droppedForLowConf && (kept[0].confidence ?? 0) < LOW_CONF_REASON) {
        // añadimos razón explícita si el top quedó por debajo de LOW_CONF_REASON
        excluded.push({ fileName: x.fileName, reason: "low_confidence" });
      }
      return { fileName: x.fileName, results: kept };
    });

    // Consenso: si lo borra todo, conservamos la imagen con su top-1 (no dejamos “vacío”)
    if (perImage.length >= 2) {
      const keep = new Set(consensusAcrossImages(perImage));
      const after = perImage.map(img => {
        const kept = img.results.filter(r => keep.has(r.name.toLowerCase()));
        if (!kept.length && img.results.length) {
          // sin consenso: dejamos el top-1 para no perder la hipótesis principal
          excluded.push({ fileName: img.fileName, reason: "no_consensus" });
          const top1 = [...img.results].sort((a,b)=> (b.confidence ?? 0)-(a.confidence ?? 0) || b.pct-a.pct)[0];
          return { ...img, results: normalizeTo100([top1]) };
        }
        return kept.length ? { ...img, results: normalizeTo100(kept) } : { ...img, results: [] };
      });
      perImage = after;
    }

    // Si alguna quedó vacía (muy raro tras el fallback), marcamos “Indeterminado”
    perImage = perImage.map(img =>
      img.results.length ? img : { ...img, results: [{ name: "Indeterminado", pct: 100, confidence: 0.2 }] },
    );

    const global = computeGlobal(perImage);

    // --------- Interpretación breve (geología/economía/advertencias)
    const names = global.map(g => normalizeMineralName(g.name).toLowerCase());
    const hasCuSec = names.some((n) =>
  /(malaquita|malachite|azurita|azurite|crisocola|chrysocolla|cuprita|cuprite|bornita|bornite|calcopirita|chalcopyrite)/i.test(
    n
  )
);

    const hasFeOx = names.some((n) =>
  /(limonita|limonite|goethita|goethite|hematita|hematite)/i.test(n)
);
const hasAuAg = names.some((n) =>
  /(pirita|pyrite|arsenopirita|arsenopyrite|galena|esfalerita|sphalerite|tetraedrita|electrum|oro|gold|plata|silver)/i.test(
    n
  )
);

    

    const interpretation = {
      geology:
        hasCuSec
          ? "Textura compatible con zona de oxidación de cobre (malaquita/azurita) con óxidos de Fe."
          : hasFeOx
          ? "Predominio de óxidos/hidróxidos de Fe; posible alteración supergénica."
          : "Asociación general sin indicador metalífero dominante.",
      economics:
        hasCuSec
          ? "Potencial por Cu si % pagable y tonelaje lo justifican; verificar con análisis químico."
          : hasAuAg
          ? "Posible sistema polimetálico con Au/Ag subordinados; confirmar en laboratorio."
          : "Sin evidencia clara de commodity económico; se requiere verificación analítica.",
      caveats:
        "Estimación visual asistida por IA. Confirmar con ensayo al fuego (Au/Ag) e ICP/AA (Cu y otros). Considerar heterogeneidad de muestra.",
    };

    return Response.json({ perImage, global, excluded, interpretation }, { status: 200 });
  } catch (e: any) {
    return Response.json({ error: e?.message || "Error analizando" }, { status: 500 });
  }
}
