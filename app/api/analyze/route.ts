// app/api/analyze/route.ts — Gemini con salida JSON forzada + parseo robusto + filtros afinados
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";
export const maxDuration = 60;

type MineralResult = { name: string; pct: number; confidence?: number; evidence?: string };

// -------------------- Parámetros afinados --------------------
const TEMPERATURE = 0.2;
const CONF_MIN = 0.30;           // antes 0.35/0.6
const PCT_MIN = 1.0;             // antes 1.5/3.0
const CONSENSUS_MIN_IMAGES = 2;
const CONSENSUS_HIGH_CONF = 0.8;

const STATIC_FALLBACKS = [
  "gemini-2.5-flash-preview-05-20", // vimos que funciona en tu cuenta
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.0-flash",
  "gemini-1.5-flash-8b",
  "gemini-1.5-flash",
  "gemini-2.5-pro",
  "gemini-pro-latest",
];

// -------------------- Utilidades --------------------
function toBase64(file: File): Promise<string> {
  return file.arrayBuffer().then((ab) => Buffer.from(ab).toString("base64"));
}
function cleanName(raw: string): string {
  const s = String(raw || "").trim();
  const only = s.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 \-()/]/g, "");
  return only.replace(/\s+/g, " ").replace(/^./, (c) => c.toUpperCase());
}
function mergeDuplicates(arr: MineralResult[]): MineralResult[] {
  const map = new Map<string, MineralResult>();
  for (const it of arr) {
    const key = it.name.toLowerCase();
    const prev = map.get(key);
    if (prev) {
      map.set(key, {
        name: prev.name,
        pct: prev.pct + it.pct,
        confidence: Math.max(prev.confidence ?? 0, it.confidence ?? 0),
        evidence: prev.evidence || it.evidence,
      });
    } else {
      map.set(key, it);
    }
  }
  return Array.from(map.values());
}
function normalizeTo100(results: MineralResult[]): MineralResult[] {
  const sum = results.reduce((a, b) => a + b.pct, 0);
  if (sum <= 0) return results.map((r) => ({ ...r, pct: 0 }));
  const scaled = results.map((r) => ({ ...r, pct: (r.pct / sum) * 100 }));
  const rounded = scaled.map((r) => ({ ...r, pct: Math.round(r.pct * 100) / 100 }));
  let tot = +(rounded.reduce((a, b) => a + b.pct, 0).toFixed(2));
  const diff = +(100 - tot).toFixed(2);
  if (diff !== 0 && rounded.length) {
    const iMax = rounded.reduce((idx, r, i, arr) => (r.pct > arr[idx].pct ? i : idx), 0);
    rounded[iMax] = { ...rounded[iMax], pct: +(rounded[iMax].pct + diff).toFixed(2) };
  }
  return rounded;
}
function filterPerImage(list: MineralResult[]): MineralResult[] {
  let r = list
    .map((it) => ({
      name: cleanName(it.name),
      pct: Number(it.pct ?? 0),
      confidence: typeof it.confidence === "number" ? it.confidence : undefined,
      evidence: it.evidence,
    }))
    .filter((it) => it.name && it.pct >= 0);

  r = mergeDuplicates(r);
  r = r.filter((it) => (it.confidence ?? 0) >= CONF_MIN && it.pct >= PCT_MIN);
  r.sort((a, b) => b.pct - a.pct || (b.confidence ?? 0) - (a.confidence ?? 0));
  r = normalizeTo100(r);
  return r;
}
function consensusAcrossImages(perImage: { results: MineralResult[] }[]): string[] {
  const count: Record<string, { n: number; maxConf: number }> = {};
  perImage.forEach((img) => {
    img.results.forEach((r) => {
      const k = r.name.toLowerCase();
      if (!count[k]) count[k] = { n: 0, maxConf: 0 };
      count[k].n += 1;
      count[k].maxConf = Math.max(count[k].maxConf, r.confidence ?? 0);
    });
  });
  return Object.entries(count)
    .filter(([_, v]) => v.n >= CONSENSUS_MIN_IMAGES || v.maxConf >= CONSENSUS_HIGH_CONF)
    .map(([k]) => k);
}
function computeGlobal(perImage: { results: MineralResult[] }[]): { name: string; pct: number; confidence: number }[] {
  const m = new Map<string, { sumPct: number; sumConf: number; count: number; name: string }>();
  for (const img of perImage) {
    for (const r of img.results) {
      const key = r.name.toLowerCase();
      const prev = m.get(key) || { sumPct: 0, sumConf: 0, count: 0, name: r.name };
      prev.sumPct += r.pct;
      prev.sumConf += r.confidence ?? 0.5;
      prev.count += 1;
      prev.name = r.name;
      m.set(key, prev);
    }
  }
  let out = Array.from(m.values()).map((v) => ({
    name: v.name,
    pct: +(v.sumPct / v.count).toFixed(2),
    confidence: +((v.sumConf / v.count)).toFixed(2),
  }));
  out.sort((a, b) => b.pct - a.pct);
  out = normalizeTo100(out);
  return out;
}

// ---------- Parseo robusto de JSON ----------
function extractJson(text: string): any {
  if (!text) return null;
  // 1) quita cercas de código
  let t = text.replace(/^```(json)?/i, "").replace(/```$/i, "").trim();
  // 2) si viene HTML, intenta extraer primer bloque {...} o [...]
  if (t.startsWith("<")) {
    const m = t.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (m) t = m[1];
  }
  try {
    return JSON.parse(t);
  } catch {
    // 3) último intento: busca un array de objetos {"name":..., "pct":...}
    const m = text.match(/\{[\s\S]*"results"\s*:\s*(\[[\s\S]*?\])[\s\S]*\}/);
    if (m) {
      try { return { results: JSON.parse(m[1]) }; } catch {}
    }
    return null;
  }
}

// -------------------- Descubrir modelos disponibles --------------------
async function listModelsForKey(apiKey: string): Promise<string[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  try {
    const r = await fetch(url, { cache: "no-store" });
    const j = await r.json();
    const names: string[] = Array.isArray(j?.models)
      ? j.models.map((m: any) => m?.name).filter((s: any) => typeof s === "string")
      : [];
    console.log("[ANALYZE] Modelos que devuelve tu cuenta:", names);
    return names.map((n) => n.replace(/^models\//, ""));
  } catch (e: any) {
    console.warn("[ANALYZE] No se pudo listar modelos:", e?.message || e);
    return [];
  }
}

async function getFirstWorkingModel(ai: GoogleGenerativeAI, apiKey: string) {
  const fromApi = await listModelsForKey(apiKey);
  const candidates = Array.from(new Set<string>([...fromApi, ...STATIC_FALLBACKS]));
  const errors: string[] = [];
  for (const name of candidates) {
    try {
      const model = ai.getGenerativeModel({
        model: name,
        generationConfig: {
          temperature: TEMPERATURE,
          topK: 40,
          topP: 0.5,
          // Fuerza salida JSON si el modelo lo soporta
          responseMimeType: "application/json",
        } as any,
      });
      // ping corto
      await model.generateContent({ contents: [{ role: "user", parts: [{ text: "ok" }] }] });
      console.log("[ANALYZE] Modelo OK:", name);
      return model;
    } catch (e: any) {
      const msg = e?.message || String(e);
      console.warn(`[ANALYZE] Modelo falló (${name}): ${msg}`);
      errors.push(`${name}: ${msg}`);
    }
  }
  throw new Error("Ningún modelo respondió. Intentados → " + errors.join(" | "));
}

// -------------------- Handler principal --------------------
export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.trim() === "") {
      return new Response(JSON.stringify({ error: "Falta GEMINI_API_KEY" }), { status: 400 });
    }

    const form = await req.formData();
    const files = form.getAll("images") as File[];
    if (!files.length) return new Response(JSON.stringify({ error: "Sin imágenes" }), { status: 400 });

    const ai = new GoogleGenerativeAI(apiKey);
    const model = await getFirstWorkingModel(ai, apiKey);

    const perRaw: { fileName: string; results: MineralResult[] }[] = [];

    for (const f of files) {
      const b64 = await toBase64(f);
      const mime = f.type || "image/jpeg";

      const prompt = `
Devuelve SOLO JSON EXACTO:
{
  "results": [
    {"name":"<mineral>","pct":<numero>,"confidence":<0..1>,"evidence":"<color/textura/forma>"}
  ]
}
Reglas:
1) Da de 2 a 5 minerales razonables vistos en la foto.
2) Suma de "pct" = 100.00 (dos decimales).
3) Usa nombres estándar (Malaquita, Azurita, Crisocola, Calcita, Cuarzo, Pirita, Hematita, Magnetita, etc.).
4) Sé conservador: confidence bajo si hay dudas.
5) Sin texto fuera del JSON.`.trim();

      // Pedimos JSON directo
      const result = await model.generateContent([
        { inlineData: { mimeType: mime, data: b64 } },
        { text: prompt },
      ]);

      let results: MineralResult[] = [];
      try {
        // algunos modelos devuelven string plano; otros pueden incluir fences
        const raw = result.response.text();
        const parsed = extractJson(raw) ?? {};
        const arr = Array.isArray(parsed.results) ? parsed.results : [];
        results = arr as MineralResult[];
      } catch {
        results = [];
      }

      // Log de depuración
      try {
        console.log("[ANALYZE] RAW", f.name, results.map(r => `${r.name}:${r.pct}/${r.confidence ?? "-"}`).join(", "));
      } catch {}

      perRaw.push({ fileName: f.name || "foto.jpg", results });
    }

    // 1) Filtro + rescate
    let perImage = perRaw.map((x) => {
      const filtered = filterPerImage(x.results);
      if (!filtered.length) {
        // rescate: top-N del bruto, limpiar y normalizar
        const topRaw = (x.results || [])
          .map(r => ({ name: cleanName(r.name || "Indeterminado"), pct: Number(r.pct || 0), confidence: typeof r.confidence === "number" ? r.confidence : 0.25 }))
          .filter(r => r.name && r.pct > 0)
          .sort((a, b) => b.pct - a.pct)
          .slice(0, 5);
        const rescued = normalizeTo100(topRaw.length ? topRaw : [{ name: "Indeterminado", pct: 100 }]);
        return { fileName: x.fileName, results: rescued };
      }
      return { fileName: x.fileName, results: filtered };
    });

    // 2) Consenso entre imágenes no destructivo
    if (perImage.length >= 2) {
      const keepKeys = new Set(consensusAcrossImages(perImage));
      perImage = perImage.map((img) => {
        const filtered = img.results.filter((r) => keepKeys.has(r.name.toLowerCase()));
        return filtered.length ? { ...img, results: normalizeTo100(filtered) } : img;
      });
    }

    // 3) Seguridad mínima
    perImage = perImage.map((img) =>
      img.results.length ? img : { ...img, results: [{ name: "Indeterminado", pct: 100 }] }
    );

    // 4) Global
    const global = computeGlobal(perImage);

    return new Response(JSON.stringify({ perImage, global }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[ANALYZE] Error:", e?.message || e);
    return new Response(JSON.stringify({ error: e?.message || "Error analizando" }), { status: 500 });
  }
}
