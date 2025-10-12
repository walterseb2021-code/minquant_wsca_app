// app/api/mineral-info/route.ts
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";

type MineralInfo = {
  nombre: string;
  formula?: string;
  densidad?: string;
  mohs?: string;
  color?: string;
  brillo?: string;
  habito?: string;
  sistema?: string;
  ocurrencia?: string;
  asociados?: string;
  commodity?: string;
  notas?: string;
};

// --- helpers de normalización ---
function clean(s?: string | null) {
  if (!s) return undefined;
  const t = String(s).trim();
  return t ? t : undefined;
}
function cap(s?: string) {
  const t = clean(s);
  if (!t) return undefined;
  return t.replace(/^./, (c) => c.toUpperCase());
}

// ====== Fallback a Wikipedia (ES con reserva a EN) ======
async function fetchWikiSummary(title: string, lang: "es" | "en"): Promise<any | null> {
  try {
    const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/` + encodeURIComponent(title);
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

async function fetchWikiHTML(title: string, lang: "es" | "en"): Promise<string | null> {
  try {
    const url =
      `https://${lang}.wikipedia.org/w/api.php?action=parse&prop=text&format=json&origin=*` +
      `&page=` + encodeURIComponent(title);
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json();
    const html = j?.parse?.text?.["*"];
    return typeof html === "string" ? html : null;
  } catch {
    return null;
  }
}

// extracción muy simple desde la infobox del HTML
function grabFromHTML(html: string): Partial<MineralInfo> {
  const out: Partial<MineralInfo> = {};

  const get = (label: RegExp) => {
    const rowRegex = new RegExp(
      `<tr[^>]*>\\s*<th[^>]*>\\s*${label.source}[^<]*</th>\\s*<td[^>]*>([\\s\\S]*?)</td>\\s*</tr>`,
      "i"
    );
    const m = html.match(rowRegex);
    if (!m) return undefined;
    let cell = m[1];
    // quita tags y referencias
  cell = cell
  .replace(/<sup[^>]*>.*?<\/sup>/gi, "")
  .replace(/<br\s*\/?>/gi, ", ")
  .replace(/<[^>]+>/g, "")
  .replace(/\[\d+\]/g, "")
  .replace(/\s+/g, " ")
  .trim();

    return cell || undefined;
  };

  out.formula   = get(/F(?:ór|or)mula(?: química)?/i) || get(/Formula/i);
  out.densidad  = get(/Densidad/i) || get(/Density/i);
  out.mohs      = get(/Dureza(?:\\s*Mohs)?/i) || get(/Mohs/i);
  out.color     = get(/Color(?:es)?/i) || get(/Color/i);
  out.brillo    = get(/Brillo/i) || get(/Luster/i);
  out.habito    = get(/Hábito/i) || get(/Habit/i);
  out.sistema   = get(/Sistema cristalino/i) || get(/Crystal system/i);
  out.ocurrencia= get(/Ocurrencia|Yacimientos/i) || get(/Occurrence/i);
  out.asociados = get(/Asociados/i) || get(/Associated minerals/i);

  return out;
}

// ====== INTENTO 1: Gemini estructurado ======
async function tryGemini(name: string): Promise<Partial<MineralInfo> | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  try {
    const ai = new GoogleGenerativeAI(key);

    // modelos válidos (de los que listó tu cuenta en los logs)
    const CANDIDATES = [
      "gemini-2.5-flash-preview-05-20",
      "gemini-2.5-flash",
      "gemini-2.0-flash",
      "gemini-2.0-flash-001",
    ];

    let lastError: any = null;
    for (const model of CANDIDATES) {
      try {
        const gen = ai.getGenerativeModel({
          model,
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
            responseSchema: {
              type: "object",
              properties: {
                nombre: { type: "string" },
                formula: { type: "string" },
                densidad: { type: "string" },
                mohs: { type: "string" },
                color: { type: "string" },
                brillo: { type: "string" },
                habito: { type: "string" },
                sistema: { type: "string" },
                ocurrencia: { type: "string" },
                asociados: { type: "string" },
                commodity: { type: "string" },
                notas: { type: "string" },
              },
              required: ["nombre"],
            } as any,
          },
        });

        const prompt = `
Eres mineralogista. Devuelve un JSON con los campos pedidos (si un dato no aparece en fuentes confiables, déjalo vacío).
Nombre de mineral: "${name}"
Devuelve solo JSON.
`.trim();

        const resp = await gen.generateContent([{ text: prompt }]);
        const text = resp.response.text();
        const data = JSON.parse(text || "{}");
        if (data && typeof data === "object") {
          return data;
        }
      } catch (e) {
        lastError = e;
      }
    }
    // si todos fallan, no tiramos error: caemos a Wikipedia
    return null;
  } catch {
    return null;
  }
}

// ====== Handler principal ======
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const raw = searchParams.get("name") || "";
    const name = cap(raw) || "Mineral";

    // 1) Intento con Gemini
    let info: Partial<MineralInfo> | null = await tryGemini(name);

    // 2) Fallback a Wikipedia (ES -> EN)
    if (!info || Object.keys(info).length <= 1) {
      const es = await fetchWikiSummary(name, "es");
      const en = es ? null : await fetchWikiSummary(name, "en");
      const lang: "es" | "en" = es ? "es" : "en";
      const sum = es || en;

      // nombre y nota breve
      const out: Partial<MineralInfo> = {
        nombre: sum?.title || name,
        notas: sum?.extract ? sum.extract.slice(0, 800) : undefined,
      };

      // intentamos raspar algunos campos de la infobox
      const html = await fetchWikiHTML(sum?.title || name, lang);
      if (html) {
        Object.assign(out, grabFromHTML(html));
      }

      // commodity básico por heurística
      const heur = (out.nombre || name).toLowerCase();
      if (!out.commodity) {
        if (/malaquita|azurita|crisocol|cuprit|chalco|bornit|covel/i.test(heur)) out.commodity = "Cu";
        else if (/pirita|hematit|magnetit|goethit/i.test(heur)) out.commodity = "Fe";
        else if (/galena/i.test(heur)) out.commodity = "Pb";
        else if (/esfalerita/i.test(heur)) out.commodity = "Zn";
      }

      info = out;
    }

    // normaliza y responde
    const normalized: MineralInfo = {
      nombre: cap(info?.nombre) || name,
      formula: clean(info?.formula),
      densidad: clean(info?.densidad),
      mohs: clean(info?.mohs),
      color: clean(info?.color),
      brillo: clean(info?.brillo),
      habito: clean(info?.habito),
      sistema: clean(info?.sistema),
      ocurrencia: clean(info?.ocurrencia),
      asociados: clean(info?.asociados),
      commodity: clean(info?.commodity),
      notas: clean(info?.notas),
    };

    return Response.json(normalized, { status: 200 });
  } catch (e: any) {
    return Response.json({ error: e?.message || "Error" }, { status: 500 });
  }
}
