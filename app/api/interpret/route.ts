// @ts-nocheck
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Normaliza nombre a minúsculas sin tildes, para clasificar minerales.
 */
function norm(str: string): string {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Clasificación básica de minerales → familias metalíferas.
 */
const RX = {
  cu: /(malaquita|malachite|azurita|azurite|crisocola|chrysocolla|cuprita|cuprite|tenorita|tenorite|calcopirita|chalcopyrite|bornita|covelina|covellite|enargita|enargite)/i,
  fe: /(limonita|limonite|goethita|goethite|hematita|hematite|magnetita|magnetite|pirita|pyrite|marcasita|marcasite|oxidos? de hierro|iron oxides?)/i,
  au: /(oro nativo|oro|gold|electrum|electro|calaverita|calaverite|arsenopirita|arsenopyrite)/i,
  ag: /(plata nativa|plata|silver|acantita|acanthite|argentita|argentite|pirargirita|pyrargyrite|proustita|proustite)/i,
  pb: /(galena|cerusita|cerussite|anglesita|anglesite)/i,
  zn: /(esfalerita|sphalerite|blenda|smithsonita|smithsonite|hemimorfita|hemimorphite)/i,
  ganga: /(cuarzo|quartz|calcita|calcite|dolomita|dolomite|barita|barite|feldespato|feldspar|muscovita|muscovite|biotita|biotite)/i,
};

/**
 * Resume numéricamente la mezcla global por familias metalíferas.
 */
function buildMetalSummary(mixGlobal: any[]) {
  const sum = (test: RegExp) =>
    (mixGlobal || []).reduce((acc, m) => {
      const name = (m && m.name) || "";
      return test.test(name) ? acc + (Number(m.pct) || 0) : acc;
    }, 0);

  const Cu = sum(RX.cu);
  const Fe = sum(RX.fe);
  const Au = sum(RX.au);
  const Ag = sum(RX.ag);
  const Pb = sum(RX.pb);
  const Zn = sum(RX.zn);
  const G = sum(RX.ganga);

  return { Cu, Fe, Au, Ag, Pb, Zn, G };
}

/**
 * Construye un resumen REGLADO (sin IA) que luego Gemini toma como base.
 */
function buildRuleBasedSummary(payload: {
  mixGlobal: any[];
  byImage: any[];
  nearbySources: any[];
  geoContext?: any;
  sampleLabel?: string;
}) {
  const { mixGlobal = [], byImage = [], nearbySources = [], geoContext, sampleLabel } =
    payload || {};

  const metals = buildMetalSummary(mixGlobal);

  const geoLines: string[] = [];
  const econLines: string[] = [];
  const caveatLines: string[] = [];

  const topMinerals = [...mixGlobal]
    .filter((m) => m && typeof m.pct === "number")
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 4)
    .map((m) => `${m.name} (~${(m.pct || 0).toFixed(1)} %)`);

  if (topMinerals.length) {
    geoLines.push(
      `En la mezcla global destacan: ${topMinerals.join(", ")}.`
    );
  }

  // Firma cuprífera
  if (metals.Cu >= 10) {
    const label = metals.Cu >= 35 ? "dominio cuprífero claro" : "firma cuprífera significativa";
    geoLines.push(
      `Se observa ${label} (≈ ${metals.Cu.toFixed(
        1
      )} % del ensamblaje), compatible con zona de oxidación o transición de un sistema de cobre.`
    );
    econLines.push(
      "El cobre (Cu) aparece como principal metal de interés potencial, aunque la ley real debe ser confirmada por ensayos químicos."
    );
  }

  // Firma férrica / gossan
  if (metals.Fe >= 10) {
    const label =
      metals.Fe >= 30
        ? "ensamblaje fuertemente controlado por óxidos/hidróxidos de hierro (gossan ferruginoso)"
        : "impronta férrica relevante";
    geoLines.push(
      `La presencia de óxidos/hidróxidos de hierro (≈ ${metals.Fe.toFixed(
        1
      )} %) sugiere ${label}, típico de zonas meteorizadas en la parte alta de sistemas mineralizados.`
    );
  }

  // Au / Ag inferidos
  if (metals.Au > 0 || metals.Ag > 0) {
    const partes: string[] = [];
    if (metals.Au > 0) partes.push(`oro (Au) ≈ ${metals.Au.toFixed(1)} %`);
    if (metals.Ag > 0) partes.push(`plata (Ag) ≈ ${metals.Ag.toFixed(1)} %`);
    econLines.push(
      `Existen indicios de minerales portadores de ${partes.join(
        " y "
      )}, aunque su cuantificación requiere ensayos específicos (Au/Ag).`
    );
  }

  // Pb/Zn polimetálico
  if (metals.Pb >= 5 || metals.Zn >= 5) {
    const tags: string[] = [];
    if (metals.Pb >= 5) tags.push(`Pb≈${metals.Pb.toFixed(1)} %`);
    if (metals.Zn >= 5) tags.push(`Zn≈${metals.Zn.toFixed(1)} %`);
    geoLines.push(
      `Se reconoce una firma polimetálica acompañante (${tags.join(
        " / "
      )}), que puede aportar valor en un eventual concentrado de sulfuros.`
    );
  }

  // Ganga
  if (metals.G >= 15) {
    geoLines.push(
      `La proporción de minerales de ganga (cuarzo, carbonatos, etc.) es importante (≈ ${metals.G.toFixed(
        1
      )} %), lo que puede diluir las leyes metálicas y requerir preconcentración.`
    );
  }

  if (!geoLines.length) {
    geoLines.push(
      "El ensamblaje mineral no muestra un metal dominante claro; la muestra podría corresponder a roca de ganga o zona marginal de un sistema mineralizado."
    );
  }

  // Yacimientos cercanos
  const metalTags: string[] = [];
  let hasAu = false;
  let hasCu = false;
  let hasAg = false;
  let hasFe = false;
  let hasPb = false;
  let hasZn = false;

  nearbySources.forEach((src: any) => {
    const txt = `${src.name || ""} ${src.mineral || ""} ${
      Array.isArray(src.commodity) ? src.commodity.join(" ") : src.commodity || ""
    }`.toUpperCase();

    if (/ORO\b| AU\b/.test(txt)) {
      hasAu = true;
      metalTags.push("oro (Au)");
    }
    if (/COBRE\b| CU\b/.test(txt)) {
      hasCu = true;
      metalTags.push("cobre (Cu)");
    }
    if (/PLATA\b| AG\b/.test(txt)) {
      hasAg = true;
      metalTags.push("plata (Ag)");
    }
    if (/HIERRO\b| FE\b/.test(txt)) {
      hasFe = true;
      metalTags.push("hierro (Fe)");
    }
    if (/PLOMO\b| PB\b/.test(txt)) {
      hasPb = true;
      metalTags.push("plomo (Pb)");
    }
    if (/ZINC\b| ZN\b/.test(txt)) {
      hasZn = true;
      metalTags.push("zinc (Zn)");
    }
  });

  if (nearbySources.length) {
    const distText = nearbySources
      .slice(0, 3)
      .map((s: any) => {
        const d =
          typeof s.distance_km === "number"
            ? `${s.distance_km.toFixed(1)} km`
            : "distancia no especificada";
        return `${s.name || "Yacimiento"} (${d})`;
      })
      .join("; ");

    geoLines.push(
      `En el entorno inmediato se registran yacimientos y ocurrencias como: ${distText}, según fuentes geoespaciales oficiales.`
    );

    if (metalTags.length) {
      econLines.push(
        `La cartografía de yacimientos cercanos indica presencia de ${Array.from(
          new Set(metalTags)
        ).join(
          ", "
        )}, lo que refuerza la interpretación de un ambiente metalífero compatible con la mezcla observada en la muestra.`
      );
    }
  }

  // Contexto geológico (geoContext)
  if (geoContext && geoContext.geology) {
    geoLines.push(
      `La unidad geológica reportada para la ubicación corresponde a: ${geoContext.geology}.`
    );
  }

  // Caveats base
  caveatLines.push(
    "Interpretación preliminar basada en reconocimiento mineral asistido por IA, composición visual relativa y contexto geológico cartográfico.",
    "No reemplaza estudios geológicos de detalle ni ensayos químicos certificados (ICP, AA, ensayo al fuego u otros).",
    "Se recomienda trabajar con muestras frescas (corte reciente) y evitar basarse únicamente en costras muy oxidadas.",
    "Este texto debe leerse junto con la tabla económica y las conclusiones del informe completo."
  );

  return {
    geology: geoLines.join(" "),
    economics: econLines.join(" "),
    caveats: caveatLines.join(" "),
  };
}

/**
 * Llama a Gemini para refinar el texto y devolver JSON {geology, economics, caveats}
 */
async function callGemini(payload: any, base: any) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[/api/interpret] GEMINI_API_KEY no definido, usando sólo reglas.");
    return null;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

  const prompt = `
Eres un geólogo económico senior con experiencia en exploración de metales base y preciosos.

Tarea:
A partir de los datos de una muestra puntual, debes redactar una interpretación preliminar en ESPAÑOL, en tres bloques:
1) "geology": interpretación geológica del ensamblaje mineral y ambiente (zona de oxidación, gossan, transición, polimetálico, etc.).
2) "economics": comentario económico cualitativo (metales potencialmente pagables, necesidad de ensayos, si el control es gossan guía vs mena económica, etc.).
3) "caveats": advertencias y recomendaciones de uso responsable del informe.

Formato de salida:
Debes responder EXCLUSIVAMENTE un objeto JSON válido:

{
  "geology": "texto...",
  "economics": "texto...",
  "caveats": "texto..."
}

No incluyas comentarios, ni backticks, ni texto adicional fuera del JSON.

Datos de entrada (en JSON):
${JSON.stringify(
  {
    sampleLabel: payload.sampleLabel || null,
    mixGlobal: payload.mixGlobal || [],
    byImage: payload.byImage || [],
    nearbySources: payload.nearbySources || [],
    geoContext: payload.geoContext || null,
    ruleSummary: base,
  },
  null,
  2
)}
`;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  const text = (await result.response.text()) || "";
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    console.warn("[/api/interpret] Respuesta Gemini sin JSON claro:", text);
    return null;
  }

  try {
    const json = JSON.parse(text.slice(start, end + 1));
    return json;
  } catch (e) {
    console.error("[/api/interpret] Error parseando JSON de Gemini:", e);
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();

    const base = buildRuleBasedSummary(payload);
    let ai = null;

    try {
      ai = await callGemini(payload, base);
    } catch (e) {
      console.error("[/api/interpret] Error llamando a Gemini:", e);
    }

    const final = {
      geology: ai?.geology || base.geology,
      economics: ai?.economics || base.economics,
      caveats:
        (ai?.caveats
          ? `${ai.caveats} `
          : "") + (base.caveats || ""),
    };

    return NextResponse.json(final);
  } catch (e) {
    console.error("[/api/interpret] Error general:", e);
    return NextResponse.json(
      {
        error: "Error procesando interpretación.",
      },
      { status: 500 }
    );
  }
}
