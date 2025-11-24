import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
// ==== Helpers para conclusiones dinámicas según minerales ====

type ConclusionesYRecs = {
  conclusiones: string[];
  recomendaciones: string[];
};

 function buildConclusionesYRecomendaciones(globalMix: GlobalMix): ConclusionesYRecs {
 const mixOrdenado = [...globalMix].sort((a, b) => b.pct - a.pct);
  const nombres = mixOrdenado.map((m) => m.name.toLowerCase());

  const tieneOxidosCu = nombres.some((n) =>
    ["malachite", "azurite", "chrysocolla", "cuprite"].includes(n)
  );
  const tieneOxidosFe = nombres.some((n) =>
    ["limonite", "hematite", "goethite"].includes(n)
  );
  const tieneAuAg = nombres.some((n) => ["gold", "native gold", "silver"].includes(n));
  const tieneSulfuros = nombres.some((n) =>
    ["chalcopyrite", "bornite", "galena", "sphalerite", "pyrite"].includes(n)
  );

  const conclusiones: string[] = [];
  const recomendaciones: string[] = [];

  if (!mixOrdenado.length) {
    conclusiones.push(
      "No se identificó una mezcla mineral global consistente; el análisis no arrojó minerales dominantes."
    );
    recomendaciones.push(
      "Repetir el muestreo con una muestra más representativa.",
      "Complementar el reconocimiento por imagen con ensayos de laboratorio."
    );
    return { conclusiones, recomendaciones };
  }

  const top = mixOrdenado.slice(0, 3);
  const resumenTop = top.map((m) => `${m.name} (${m.pct.toFixed(2)}%)`).join(", ");

  conclusiones.push(
    `La mezcla mineral global está dominada por: ${resumenTop}.`
  );

  if (tieneOxidosCu) {
    conclusiones.push(
      "Predominan minerales de oxidación de cobre (malaquita/azurita), lo que sugiere una zona de oxidación superficial asociada a mineralización cuprífera."
    );
  }

  if (tieneOxidosFe) {
    conclusiones.push(
      "La presencia importante de limonita u otros óxidos de hierro indica procesos intensos de intemperismo y alteración supergénica."
    );
  }

  if (!tieneAuAg && !tieneSulfuros && tieneOxidosCu) {
    conclusiones.push(
      "No se identifican sulfuros metálicos ni minerales de Au/Ag; el valor económico directo es incierto y requiere validación geoquímica."
    );
  }

  if (tieneOxidosCu) {
    recomendaciones.push(
      "Realizar muestreo más profundo para evaluar posible presencia de sulfuros primarios (calcopirita, bornita, etc.).",
      "Enviar muestras a laboratorio para análisis de Cu total (ICP-OES o AAS).",
      "Si se obtienen leyes > 0.3% Cu, ampliar prospección en un radio de 100–300 m."
    );
  }

  if (tieneOxidosFe && !tieneSulfuros) {
    recomendaciones.push(
      "Considerar la zona como de interés geológico preliminar si las leyes resultan bajas.",
      "Usar esta información para cartografía de alteración y estudios exploratorios."
    );
  }

  recomendaciones.push(
    "Complementar estos resultados con datos geológicos regionales y mapas estructurales.",
    "Confirmar siempre con ensayos químicos certificados antes de tomar decisiones técnicas o económicas."
  );

  return { conclusiones, recomendaciones };
}

/** Catálogo base — Valores reales normalizados */
const BASE_COMMODITIES: Commodity[] = [
  { code: "Au", display: "Oro (Au)", unit: "g/t", priceUnit: "USD/g", priceDefault: 131, payableDefault: 0.99, enabled: true },
  { code: "Ag", display: "Plata (Ag)", unit: "g/t", priceUnit: "USD/g", priceDefault: 1.67, payableDefault: 0.98, enabled: true },
  { code: "Pt", display: "Platino (Pt)", unit: "g/t", priceUnit: "USD/g", priceDefault: 32, payableDefault: 0.98, enabled: false },
  { code: "Pd", display: "Paladio (Pd)", unit: "g/t", priceUnit: "USD/g", priceDefault: 30.5, payableDefault: 0.98, enabled: false },

  { code: "Cu", display: "Cobre (Cu)", unit: "kg/t", priceUnit: "USD/kg", priceDefault: 11, payableDefault: 0.96, enabled: true },
  { code: "Pb", display: "Plomo (Pb)", unit: "kg/t", priceUnit: "USD/kg", priceDefault: 2.05, payableDefault: 0.90, enabled: true },
  { code: "Zn", display: "Zinc (Zn)", unit: "kg/t", priceUnit: "USD/kg", priceDefault: 3.25, payableDefault: 0.85, enabled: true },
  { code: "Al", display: "Aluminio (Al)", unit: "kg/t", priceUnit: "USD/kg", priceDefault: 2.813, payableDefault: 0.90, enabled: false },
  { code: "Sn", display: "Estaño (Sn)", unit: "kg/t", priceUnit: "USD/kg", priceDefault: 36.2, payableDefault: 0.85, enabled: false },
  { code: "Ni", display: "Níquel (Ni)", unit: "kg/t", priceUnit: "USD/kg", priceDefault: 14.5, payableDefault: 0.88, enabled: true },

  { code: "Mo", display: "Molibdeno (Mo)", unit: "kg/t", priceUnit: "USD/kg", priceDefault: 20, payableDefault: 0.85, enabled: false },
  { code: "Sb", display: "Antimonio (Sb)", unit: "kg/t", priceUnit: "USD/kg", priceDefault: 12, payableDefault: 0.80, enabled: false },
  { code: "Co", display: "Cobalto (Co)", unit: "kg/t", priceUnit: "USD/kg", priceDefault: 32, payableDefault: 0.85, enabled: false },
  { code: "V", display: "Vanadio (V)", unit: "kg/t", priceUnit: "USD/kg", priceDefault: 25, payableDefault: 0.80, enabled: false },
  { code: "Ti", display: "Titanio (Ti)", unit: "kg/t", priceUnit: "USD/kg", priceDefault: 4, payableDefault: 0.85, enabled: false },
  { code: "W", display: "Tungsteno (W)", unit: "kg/t", priceUnit: "USD/kg", priceDefault: 40, payableDefault: 0.88, enabled: false },
  { code: "Li", display: "Litio (Li)", unit: "kg/t", priceUnit: "USD/kg", priceDefault: 14, payableDefault: 0.85, enabled: false },
  { code: "Fe", display: "Hierro (Fe)", unit: "kg/t", priceUnit: "USD/kg", priceDefault: 0.12, payableDefault: 0.75, enabled: true },
  { code: "Mn", display: "Manganeso (Mn)", unit: "kg/t", priceUnit: "USD/kg", priceDefault: 2, payableDefault: 0.80, enabled: true },
  { code: "REE", display: "Tierras raras (REE)", unit: "kg/t", priceUnit: "USD/kg", priceDefault: 80, payableDefault: 0.70, enabled: false },
];

/** Overrides económicos — versión unificada */
export type EconOverrides = {
  /** Moneda seleccionada en la UI */
  currency?: CurrencyCode;

  /** Precios BASE:
   *  Au, Ag → precio por g
   *  Cu, Zn, Pb... → precio por kg
   */
  prices?: Partial<Record<CommodityCode, number>>;

  /** Payables (0–1) */
  payables?: Partial<Record<CommodityCode, number>>;

  /** Soporte plano (formato antiguo) */
  fxUsdToPen?: number;  // Ej: 1 USD = 3.8 PEN
  fxEurToPen?: number;  // Ej: 1 EUR = 4.1 PEN

  /** Formato nuevo anidado */
  fx?: {
    usdToPen?: number;
    eurToPen?: number;
  };
};

/** Opciones de construcción */
export type BuildReportOptions = {
  title?: string;
  note?: string;
  lat?: number;
  lng?: number;
  dateISO?: string;
  econ?: EconOverrides;
  nearbySources?: Array<any>;
};

/** Utilidades */
const round2 = (n: number) => Math.round(n * 100) / 100;
const toPct = (n: number, digits = 2) => `${n.toFixed(digits)} %`;

/** Limpieza de texto */
function sanitizeText(s: string): string {
  if (!s) return "";
  try {
    let out = s.normalize && s.normalize("NFC") ? s.normalize("NFC") : s;
    out = out
      .replace(/\u2022/g, "-")
      .replace(/\uFFFD/g, "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");
    out = out.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
    return out.trim();
  } catch {
    return s.replace(/\u2022/g, "-").trim();
  }
}
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

/** Fusiona entradas de la mezcla global que representen lo mismo (por idioma u etiqueta) */
function mergeGlobalMix(mix: GlobalMix): GlobalMix {
  const acc = new Map<string, MineralPct>();

  for (const m of mix || []) {
    const label = normalizeMineralName(m.name);
    const key = label.toLowerCase(); // clave de agrupación

    const prev = acc.get(key);
    if (prev) {
      prev.pct += m.pct;
    } else {
      acc.set(key, { name: label, pct: m.pct });
    }
  }

  return Array.from(acc.values());
}

/** Mapa estático */
async function fetchStaticMap(
  lat: number,
  lng: number,
  width = 900,
  height = 380
): Promise<string | null> {
  try {
    const url = `/api/staticmap?lat=${lat}&lng=${lng}&zoom=14&size=${width}x${height}`;
    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) return null;

    const blob = await res.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Heurísticas metalíferas (ES + EN) */
const RX = {
  cu: /(malaquita|malachite|azurita|azurite|crisocola|chrysocolla|cuprita|cuprite|tenorita|tenorite|bornita|bornite|chalcopyrita|chalcopyrite)/i,
  fe: /(pirita|pyrite|hematita|hematite|goethita|goethite|magnetita|magnetite|limonita|limonite|marcasita|marcasite)/i,
  au: /(oro nativo|oro|gold|arsenopirita|arsenopyrite)/i,
  ag: /(plata nativa|plata|silver|argentita|argentite|acantita|acanthite)/i,
  zn: /(esfalerita|sphalerite|blenda)/i,
  pb: /(galena)/i,
  gangas: /(calcita|calcite|dolomita|dolomite|barita|barite|cuarzo|quartz)/i,
};


/** Mapea mineral detectado a commodity */
function mineralToMetals(name: string): CommodityCode[] {
  if (RX.cu.test(name)) return ["Cu"];
  if (RX.pb.test(name)) return ["Pb"];
  if (RX.zn.test(name)) return ["Zn"];
  if (RX.au.test(name)) return ["Au"];
  if (RX.ag.test(name)) return ["Ag"];
  if (RX.fe.test(name)) return ["Fe"];
  return [];
}

/** === Interpretación dinámica (ponderada por % del mix) === */
function interpretMix(mix: GlobalMix): string {
  const w = {
    Cu: mix.filter((m) => RX.cu.test(m.name)).reduce((a, b) => a + b.pct, 0),
    Fe: mix.filter((m) => RX.fe.test(m.name)).reduce((a, b) => a + b.pct, 0),
    Au: mix.filter((m) => RX.au.test(m.name)).reduce((a, b) => a + b.pct, 0),
    Ag: mix.filter((m) => RX.ag.test(m.name)).reduce((a, b) => a + b.pct, 0),
    Zn: mix.filter((m) => RX.zn.test(m.name)).reduce((a, b) => a + b.pct, 0),
    Pb: mix.filter((m) => RX.pb.test(m.name)).reduce((a, b) => a + b.pct, 0),
    G: mix.filter((m) => RX.gangas.test(m.name)).reduce((a, b) => a + b.pct, 0),
  };

  const lines: string[] = [];

  if (w.Cu >= 15) {
    const dominio = w.Cu >= 40 ? "Dominio cuprífero" : "Signo cuprífero";
    lines.push(
      `• ${dominio} (≈ ${round2(
        w.Cu
      )} % del ensamblaje): especies carbonato/óxido sugieren zona oxidada o transición; evaluar lixiviación o beneficio oxidado.`
    );
  }

  if (w.Fe >= 10) {
    lines.push(
      `• Impronta férrica (≈ ${round2(
        w.Fe
      )} %): gossan/meteorización o ambiente hidrotermal; la pirita puede correlacionar con Au fino no visible.`
    );
  }

  if (w.Au >= 3) {
    lines.push(
      `• Potencial aurífero (≈ ${round2(
        w.Au
      )} %): revisar sulfuros finos (pirita/arsenopirita). Recomendado ensayo al fuego o metal screen.`
    );
  }

  if (w.Ag >= 5) {
    lines.push(
      `• Plata relevante (≈ ${round2(
        w.Ag
      )} %): verificar mena argentífera secundaria en zona oxidada.`
    );
  }

  if (w.Zn >= 5 || w.Pb >= 5) {
    const tags: string[] = [];
    if (w.Pb >= 5) tags.push(`Pb≈${round2(w.Pb)}%`);
    if (w.Zn >= 5) tags.push(`Zn≈${round2(w.Zn)}%`);
    lines.push(
      `• Firma polimetálica acompañante (${tags.join(
        " / "
      )}): Pb/Zn podrían adicionar valor en concentrado o blend.`
    );
  }

  if (w.G >= 10) {
    lines.push(
      `• Ganga significativa (≈ ${round2(
        w.G
      )} %: calcita/dolomita/cuarzo): posible dilución de leyes; considerar preconcentración o selección manual.`
    );
  }

  if (!lines.length) {
    lines.push(
      "• Ensamble sin indicadores metálicos dominantes. Sugerido muestreo adicional y verificación analítica."
    );
  }

  lines.push(
    "• Estimación visual asistida por IA. Confirmar con ensayo químico (Au/Ag: fuego/AA; Cu/Pb/Zn: ICP/AA)."
  );

  return sanitizeText(lines.join("\n"));
}

/** Construye tabla económica (alineada con UI: Au/Ag en USD/g, resto en USD/t) */
function buildEconomics(mix: GlobalMix, overrides?: EconOverrides) {
  const currency: CurrencyCode = overrides?.currency || "USD";
  const pricesOverride = overrides?.prices || {};
  const payablesOverride = overrides?.payables || {};

  // Tipos de cambio: soporta formato antiguo (fxUsdToPen / fxEurToPen)
  // y el nuevo anidado (fx: { usdToPen, eurToPen })
  const fxNested = overrides?.fx || {};

  const usdPenRate =
    typeof fxNested.usdToPen === "number" && fxNested.usdToPen > 0
      ? fxNested.usdToPen
      : typeof overrides?.fxUsdToPen === "number" && overrides.fxUsdToPen! > 0
      ? overrides.fxUsdToPen!
      : 1;

  const eurPenRate =
    typeof fxNested.eurToPen === "number" && fxNested.eurToPen > 0
      ? fxNested.eurToPen
      : typeof overrides?.fxEurToPen === "number" && overrides.fxEurToPen! > 0
      ? overrides.fxEurToPen!
      : 0;

  const usdEurRate =
    usdPenRate > 0 && eurPenRate > 0 ? usdPenRate / eurPenRate : 0;

  // Determinar qué commodities aparecen realmente en la muestra
  const present = new Set<CommodityCode>();
  mix.forEach((m) =>
    mineralToMetals(m.name).forEach((code) => present.add(code))
  );
  if (mix.some((m) => /oro/i.test(m.name))) present.add("Au");
  if (mix.some((m) => /plata/i.test(m.name))) present.add("Ag");

  const commodities = BASE_COMMODITIES.filter(
    (c) => c.enabled || present.has(c.code)
  );

  // Estimación de tenor basada en tu lógica actual
  function estimateTenor(code: CommodityCode): number {
    const rel = mix
      .filter((m) => mineralToMetals(m.name).includes(code))
      .reduce((a, b) => a + b.pct, 0);

    switch (code) {
      case "Cu":
        return round2(rel * 0.5); // kg/t
      case "Zn":
      case "Pb":
        return round2(rel * 0.3); // kg/t
      case "Au":
        return round2(rel * 0.2); // g/t
      case "Ag":
        return round2(rel * 1.5); // g/t
      case "Fe":
        return round2(rel * 0.4); // kg/t
      default:
        return 0;
    }
  }

  const rows = commodities.map((c) => {
    const tenor = estimateTenor(c.code);

    const payable =
      typeof payablesOverride[c.code] === "number"
        ? payablesOverride[c.code]!
        : c.payableDefault;

    // ✅ 1) Precio base EXACTAMENTE igual que la UI
//    - Au, Ag, Pt, Pd → USD/g
//    - Todos los demás → USD/kg (NO más USD/t)
const basePrice =
  typeof pricesOverride[c.code] === "number"
    ? pricesOverride[c.code]!
    : c.priceDefault;

const isPrecious =
  c.code === "Au" ||
  c.code === "Ag" ||
  c.code === "Pt" ||
  c.code === "Pd";

// 👉 AQUÍ EL CAMBIO CLAVE
const basePriceUnit = isPrecious ? "USD/g" : "USD/kg";

    // 2) Conversión de moneda (solo divisa, no masas)
    let adjustedPrice = basePrice;
    let finalCurrency: CurrencyCode = "USD";

    if (currency === "PEN" && usdPenRate > 0) {
      adjustedPrice = basePrice * usdPenRate;
      finalCurrency = "PEN";
    } else if (currency === "EUR" && usdEurRate > 0) {
      adjustedPrice = basePrice * usdEurRate;
      finalCurrency = "EUR";
    } else {
      finalCurrency = "USD";
    }

    // 3) Cantidad pagable (misma unidad que tenor: g/t o kg/t)
    const payQty = round2(tenor * payable);

    // 4) Valor económico por tonelada de mineral
    //    Según combinación:
    //    - Si precio es por g (USD/g, PEN/g, EUR/g):
    //        * Si tenor es g/t → valor = payQty[g/t] * precio
    //        * Si tenor es kg/t → valor = payQty[kg/t] * 1000 [g/kg] * precio
    //    - Si precio es por t (USD/t, PEN/t, EUR/t):
    //        * Si tenor es kg/t → valor = (payQty[kg/t] / 1000) [t] * precio
    //        * Si tenor es g/t → valor = (payQty[g/t] / 1_000_000) [t] * precio
    let valuePerTon = 0;

    // ✅ NUEVA LÓGICA: TODA alineada con UI
//    - Precios en USD/g o USD/kg
//    - Nada de USD/t

if (basePriceUnit === "USD/g") {
  if (c.unit === "g/t") {
    // g/t * USD/g = USD/t
    valuePerTon = payQty * adjustedPrice;
  } else {
    // kg/t → g/t
    const grams = payQty * 1000;
    valuePerTon = grams * adjustedPrice;
  }
} else {
  // USD/kg
  if (c.unit === "kg/t") {
    // kg/t * USD/kg = USD/t
    valuePerTon = payQty * adjustedPrice;
  } else {
    // g/t → kg/t
    const kilos = payQty / 1000;
    valuePerTon = kilos * adjustedPrice;
  }
}

    const value = round2(valuePerTon);

    // 5) Unidad de precio para mostrar en el PDF:
    //    - Au, Ag, Pt, Pd → moneda/g
    //    - Resto → moneda/t
    const massUnit = isPrecious ? "g" : "kg";
const finalPriceUnit = `${finalCurrency}/${massUnit}`;


    return {
      ...c,
      tenor,
      payable,
      payQty,
      price: adjustedPrice,
      value,
      currency: finalCurrency,
      priceUnit: finalPriceUnit,
    };
  });

  return { currency, rows };
}

/** Genera el PDF principal */
export async function buildReportPdfPlus(args: {
  mixGlobal: GlobalMix;
  byImage: ImageResult[];
  opts?: BuildReportOptions;
}): Promise<jsPDF> {
 const { mixGlobal: rawMixGlobal, byImage, opts } = args;

// 🔹 Normalizamos mezcla global (para evitar "Óxidos de hierro" / "Iron Oxides" duplicados)
const mixGlobal = mergeGlobalMix(rawMixGlobal || []);

const doc = new jsPDF({ unit: "pt", format: "a4" });


  const margin = 42;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  let y = margin;

  const headFill = [230, 240, 255];
  const headText = [30, 30, 30];
  const cellText = [20, 20, 20];
  doc.setTextColor(...cellText);

  // Título
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(
    opts?.title || "Reporte de Análisis Mineral – MinQuant_WSCA",
    margin,
    y
  );
  y += 18;

  // Fecha
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const when = opts?.dateISO
    ? new Date(opts.dateISO).toLocaleString()
    : new Date().toLocaleString();
  doc.text(`Fecha: ${when}`, margin, y);
  y += 14;

  // Mapa
  if (typeof opts?.lat === "number" && typeof opts?.lng === "number") {
    const mapW = 250;
    const mapH = 140;
    const x = pageW - margin - mapW;
    const topY = margin;

    try {
      const durl = await fetchStaticMap(opts.lat, opts.lng, 900, 380);
      if (durl) {
        try {
          doc.addImage(durl, "PNG", x, topY, mapW, mapH);
        } catch {
          doc.setDrawColor(180);
          doc.rect(x, topY, mapW, mapH);
          doc.text("Mapa (no PNG) — ver ficha", x + 8, topY + 16);
        }
      } else {
        doc.setDrawColor(180);
        doc.rect(x, topY, mapW, mapH);
        doc.text("Mapa no disponible", x + 8, topY + 16);
      }
    } catch {
      doc.setDrawColor(180);
      doc.rect(x, topY, mapW, mapH);
      doc.text("Error al cargar mapa", x + 8, topY + 16);
    }

    doc.setFontSize(9);
    const coordY = topY + mapH + 8;
    doc.text(
      `Lat: ${opts.lat.toFixed(6)}  Lng: ${opts.lng.toFixed(6)}`,
      x,
      coordY
    );

    y = Math.max(y, topY + mapH + 28);
  }

  // Nota
  if (opts?.note) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const text = doc.splitTextToSize(
      sanitizeText(opts.note),
      pageW - margin * 2 - 260
    );
    doc.text(text, margin, y);
    y += 14 * text.length + 8;
  } else {
    y += 6;
  }

 // Mezcla Global
doc.setFont("helvetica", "bold");
doc.setFontSize(12);
doc.text("Mezcla Global (normalizada a 100 %)", margin, y);
y += 10;

autoTable(doc, {
  startY: y + 6,
  head: [["Mineral", "%"]],
  body: mixGlobal.map((m) => [
    normalizeMineralName(m.name),  // 👈 ya normalizado
    toPct(m.pct),
  ]),
  styles: { fontSize: 9, cellPadding: 4, textColor: cellText },
  headStyles: { fillColor: headFill, textColor: headText },
  margin: { left: margin, right: margin },
  theme: "grid",
});

  y = (doc as any).lastAutoTable.finalY + 14;

  // Interpretación
 doc.setFont("helvetica", "bold");
doc.setFontSize(12);
doc.text("Interpretación preliminar (automática)", margin, y);
y += 22;   // 🔹 más aire bajo el título

doc.setFont("helvetica", "normal");
doc.setFontSize(10);

const interLines = doc.splitTextToSize(
  sanitizeText(interpretMix(mixGlobal)),
  pageW - margin * 2
);
doc.text(interLines, margin, y);

// 🔹 más espacio después del bloque
y += 14 * interLines.length + 20;


  // Resultados por imagen
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Resultados por imagen", margin, y);
  y += 10;

  autoTable(doc, {
    startY: y + 6,
    head: [["Imagen", "Top minerales (%)", "Exclusiones"]],

        body: byImage.map((img, idx) => {
    const topMinerals = img.minerals
      .slice(0, 3)
      .map((m) => {
        const label = normalizeMineralName(m.name);
        return `${label} (${m.pct.toFixed(2)}%)`;
      })
      .join(", ");

    return [
      img.filename || `Imagen ${idx + 1}`,
      topMinerals,
      img.excluded?.reason || "",
    ];
  }),


    styles: { fontSize: 9, cellPadding: 4, textColor: cellText },
    headStyles: { fillColor: headFill, textColor: headText },
    margin: { left: margin, right: margin },
    theme: "grid",
  });
  y = (doc as any).lastAutoTable.finalY + 14;

 // Estimación económica
doc.setFont("helvetica", "bold");
doc.setFontSize(12);
doc.text("Estimación económica (referencial)", margin, y);
y += 22; // 🔹 más espacio bajo el título

// Nota clara sobre unidades y tipo de cambio
doc.setFont("helvetica", "normal");
doc.setFontSize(9);

const econNote = doc.splitTextToSize(
  "Todos los precios base están en USD; se convierten a la moneda seleccionada según el tipo de cambio configurado en la app.",
  pageW - margin * 2
);

doc.text(econNote, margin, y);

// 🔹 Más espacio después de la nota
y += econNote.length * 14 + 14;

// Generar tabla económica
const econ = buildEconomics(mixGlobal, opts?.econ);

autoTable(doc, {
  startY: y + 6,  // 🔹 pequeño margen antes de la tabla
  head: [
    [
      "Commodity",
      "Tenor",
      "Unidad",
      "Payable",
      "Cant. Pagable",
      "Precio",
      "Valor",
      "Moneda",
    ],
  ],
  body: econ.rows.map((r) => [
    r.display,
    r.tenor.toFixed(2),
    r.unit,
    `${(r.payable * 100).toFixed(0)} %`,
    r.payQty.toFixed(2),
    `${r.price.toFixed(2)} ${r.priceUnit}`,
    r.value.toFixed(2),
    `${r.currency}`,
  ]),
  styles: { fontSize: 9, cellPadding: 4, textColor: cellText },
  headStyles: { fillColor: headFill, textColor: headText },
  margin: { left: margin, right: margin },
  theme: "grid",
});

// 🔹 Más aire debajo de la tabla
y = (doc as any).lastAutoTable.finalY + 20;


    // ================= YACIMIENTOS / CANTERAS CERCANAS =================
  {
    const sources: any[] = Array.isArray(opts?.nearbySources)
      ? (opts!.nearbySources as any[])
      : [];

    if (y + 80 > pageH - margin) {
      doc.addPage();
      y = margin;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Yacimientos / canteras cercanas (detectados)", margin, y);
    y += 14;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    let body: any[][] = [];

    if (sources.length > 0) {
      body = sources.map((src: any, idx: number) => [
        String(idx + 1),
        sanitizeText(src.name || src.title || "Fuente"),
        sanitizeText(src.mineral || src.commodity || "-"),
        src.distance_km != null ? `${round2(src.distance_km)} km` : "-",
        sanitizeText(src.provider || src.source || ""),
      ]);
    } else {
      // 👉 Mensaje cuando no hay yacimientos cercanos disponibles
      body = [
        [
          "-",
          "No se registran yacimientos cercanos para las coordenadas analizadas.",
          "-",
          "-",
          "",
        ],
      ];
    }

    autoTable(doc, {
      startY: y + 4,
      head: [["#", "Yacimiento / ocurrencia", "Mineral", "Distancia", "Fuente"]],
      body,
      styles: { fontSize: 9, cellPadding: 3, textColor: cellText },
      headStyles: { fillColor: headFill, textColor: headText },
      margin: { left: margin, right: margin },
      theme: "grid",
    });

    y = (doc as any).lastAutoTable.finalY + 18;
  }

  // ================= CONCLUSIONES Y RECOMENDACIONES =================
  try {
    const { conclusiones, recomendaciones } =
      buildConclusionesYRecomendaciones(mixGlobal);

    // Forzar nueva página
    doc.addPage();
    y = margin;

    // --- TÍTULO GENERAL ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Conclusiones y recomendaciones", margin, y);
    y += 24;

    // --- CONCLUSIONES ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Conclusiones:", margin, y);
    y += 18;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    const concText = doc.splitTextToSize(
      sanitizeText(conclusiones.map((c) => `• ${c}`).join("\n")),
      pageW - margin * 2
    );

    doc.text(concText, margin, y);
    y += concText.length * 14 + 22;

    // --- RECOMENDACIONES ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Recomendaciones:", margin, y);
    y += 18;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    const recText = doc.splitTextToSize(
      sanitizeText(recomendaciones.map((r) => `• ${r}`).join("\n")),
      pageW - margin * 2
    );

    doc.text(recText, margin, y);
    y += recText.length * 14 + 30;
  } catch (e) {
    console.error("Error en conclusiones/recomendaciones PDF:", e);
    y += 20;
  }

  // ================= PIE DE PÁGINA =================
  const footerText = sanitizeText(
    "Nota: Los valores mostrados son referenciales y basados en reconocimiento mineral asistido por IA y precios de mercado aproximados. " +
      "Requieren validación con ensayos químicos certificados. © MinQuant_WSCA"
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  const footerWidth = pageW - margin * 2;
  const footerLines = doc.splitTextToSize(footerText, footerWidth);

  const footerY = pageH - margin - footerLines.length * 10;
  doc.text(footerLines, margin, footerY);

  return doc;
}
