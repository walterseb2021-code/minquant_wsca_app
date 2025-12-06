import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
// ==== Helpers para conclusiones dinámicas según minerales ====

type ConclusionesYRecs = {
  conclusiones: string[];
  recomendaciones: string[];
};

function buildConclusionesYRecomendaciones(globalMix: GlobalMix): ConclusionesYRecs {
  const mixOrdenado =
    [...(globalMix || [])]
      .filter((m) => m && typeof m.pct === "number" && !!m.name)
      .sort((a, b) => b.pct - a.pct);

  const conclusiones: string[] = [];
  const recomendaciones: string[] = [];

  if (!mixOrdenado.length) {
    conclusiones.push(
      "No se identificó una mezcla mineral global consistente; el análisis no arrojó minerales dominantes."
    );
    recomendaciones.push(
      "Repetir el muestreo con una muestra más representativa.",
      "Complementar el reconocimiento por imagen con ensayos de laboratorio geoquímico básico."
    );
    return { conclusiones, recomendaciones };
  }

  // ================== NORMALIZAR NOMBRES (ES/EN) ==================
  const normNames = mixOrdenado.map((m) =>
    normalizeMineralName(m.name).toLowerCase()
  );

  function sumPct(regex: RegExp): number {
    return mixOrdenado.reduce((acc, m, i) => {
      return regex.test(normNames[i]) ? acc + m.pct : acc;
    }, 0);
  }

  // 1) Óxidos / carbonatos de Cu
  const pctOxCu = sumPct(
    /(malaquita|malachite|azurita|azurite|crisocola|chrysocolla|cuprita|cuprite|brochantita|brochantite)/
  );

  // 2) Óxidos de Fe
  const pctOxFe = sumPct(
    /(limonita|limonite|goethita|goethite|hematita|hematite)/
  );

  // 3) Sulfuros (Cu, Fe, Pb, Zn, As)
  const pctSulfuros = sumPct(
    /(calcopirita|chalcopyrite|bornita|pyrite|pirita|arsenopirita|arsenopyrite|galena|sphalerite|esfalerita|covelina|covellite|calcosina|chalcocite)/
  );

  // 4) Silicatos típicos (ganga)
  const pctSilicatos = sumPct(
    /(feldespato|feldspar|cuarzo|quartz|muscovita|muscovite|biotita|biotite|anfibol|amphibole|piroxeno|pyroxene)/
  );

  // 5) Arcillas / alteración
  const pctArcillas = sumPct(
    /(caolinita|kaolinite|illita|illite|smectita|smectite|montmorillonita|montmorillonite|arcilla)/
  );

  // 6) Au / Ag
  const pctAu = sumPct(/(oro nativo|oro|gold|electrum|electro)/);
  const pctAg = sumPct(/(plata nativa|plata|silver|acantita|acanthite|argentita|argentite)/);

  // ================== RESUMEN DE MEZCLA TOP 3 ==================
  const top = mixOrdenado.slice(0, 3);
  const resumenTop = top
    .map((m) => `${normalizeMineralName(m.name)} (${m.pct.toFixed(2)}%)`)
    .join(", ");

  conclusiones.push(
    `La mezcla mineral global está dominada por: ${resumenTop}.`
  );

  // ================== BLOQUES PRINCIPALES DE CONCLUSIÓN ==================

  // Cu óxidos / carbonatos
  if (pctOxCu >= 10) {
    const dominio = pctOxCu >= 30 ? "dominio de óxidos/carbonatos de cobre" : "presencia significativa de óxidos/carbonatos de cobre";
    conclusiones.push(
      `Se observa ${dominio} (≈ ${round2(
        pctOxCu
      )} % del ensamblaje), compatible con zona de oxidación o transición de un sistema cuprífero.`
    );
  }

  // Óxidos de Fe
  if (pctOxFe >= 10) {
    conclusiones.push(
      `La abundancia de óxidos/hidróxidos de hierro (≈ ${round2(
        pctOxFe
      )} %) sugiere un entorno fuertemente meteorizado (gossan o alteración supergénica).`
    );
  }

  // Sulfuros
  if (pctSulfuros >= 5) {
    const dominio =
      pctSulfuros >= 25 ? "ensamblaje dominado por sulfuros metálicos" : "presencia clara de sulfuros metálicos";
    conclusiones.push(
      `Se identifica ${dominio} (≈ ${round2(
        pctSulfuros
      )} %), lo que indica posible mineralización primaria o zona de transición sulfuros–óxidos.`
    );
  }

  // Silicatos / ganga
  if (pctSilicatos >= 20) {
    conclusiones.push(
      `Existe una proporción importante de silicatos de ganga (≈ ${round2(
        pctSilicatos
      )} %: cuarzo/feldespatos/micas), que pueden diluir las leyes metálicas del material.`
    );
  }

  // Arcillas
  if (pctArcillas >= 5) {
    conclusiones.push(
      `La presencia de minerales arcillosos (≈ ${round2(
        pctArcillas
      )} %) puede asociarse a zonas de alteración hidrotermal avanzada o a meteorización intensa.`
    );
  }

  // Potencial Au/Ag
  if (pctAu > 0 || pctAg > 0) {
    const partes: string[] = [];
    if (pctAu > 0) partes.push(`oro (≈ ${round2(pctAu)} %)`);
    if (pctAg > 0) partes.push(`plata (≈ ${round2(pctAg)} %)`);

    conclusiones.push(
      `Se reconocen indicios de minerales portadores de ${partes.join(
        " y "
      )}; el valor económico potencial depende de la ley real medida en laboratorio.`
    );
  }

  if (
    pctOxCu === 0 &&
    pctOxFe === 0 &&
    pctSulfuros === 0 &&
    pctAu === 0 &&
    pctAg === 0
  ) {
    conclusiones.push(
      "El ensamblaje no muestra indicadores metalíferos claros; se interpreta principalmente como roca de ganga o material sin interés económico evidente."
    );
  }

  // ================== RECOMENDACIONES (PRUEBAS MECÁNICAS + GEOQUÍMICA) ==================

  // Recomendaciones base
  recomendaciones.push(
    "Registrar fotografías adicionales con diferentes ángulos e iluminación para refinar el reconocimiento mineral por imagen.",
    "Describir en campo color, brillo, dureza estimada y tipo de fractura de los minerales más abundantes."
  );

  // Si hay sulfuros → primero agotar pruebas mecánicas
  if (pctSulfuros >= 5) {
    recomendaciones.push(
      "Realizar pruebas mecánicas sobre los sulfuros: raya en placa de porcelana no esmaltada, observación cuidadosa del brillo metálico y evaluación de dureza relativa frente a vidrio, navaja y moneda.",
      "Observar color de la raya (ej. amarilla–verdosa en calcosina/bornita, negra en otros sulfuros) y posibles iridiscencias superficiales.",
      "Si tras las pruebas mecánicas no es posible discriminar qué sulfuro predomina (Cu, Fe, Pb, Zn, As), enviar submuestras frescas a análisis químico cuantitativo (ICP-OES/AA)."
    );
  }

  // Si hay óxidos de Cu pero sin sulfuros claros
  if (pctOxCu >= 10 && pctSulfuros < 5) {
    recomendaciones.push(
      "Tomar muestras frescas en profundidad (evitando únicamente costras superficiales de oxidación) para evaluar si existen sulfuros primarios de Cu en el subsuelo.",
      "En caso de que las pruebas visuales y mecánicas sean consistentes con óxidos de cobre, enviar muestras compuestas a análisis de Cu total para estimar el potencial económico."
    );
  }

  // Si hay muchos óxidos de Fe y poca firma metálica
  if (pctOxFe >= 15 && pctSulfuros < 5 && pctOxCu < 5 && pctAu === 0 && pctAg === 0) {
    recomendaciones.push(
      "Tratar la zona como un gossan o horizonte de alteración: útil como guía exploratoria, pero no necesariamente económico por sí mismo.",
      "Utilizar la información para cartografía de alteración y definir áreas con mayor potencial antes de invertir en estudios detallados."
    );
  }

  // Arcillas / alteración
  if (pctArcillas >= 10) {
    recomendaciones.push(
      "Verificar si la presencia de arcillas se asocia a estructuras (vetas, brechas, fracturas) o a mantos superficiales, para discriminar entre alteración hidrotermal y simple meteorización.",
      "En zonas con arcillas y alguna firma metálica, considerar muestreos sistemáticos a lo largo de estructuras para definir tendencias de ley."
    );
  }

  // Recomendación estándar final
  recomendaciones.push(
    "Antes de tomar cualquier decisión de explotación o inversión, confirmar los resultados con ensayos químicos certificados y, de ser posible, estudios geológicos y metalúrgicos básicos."
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

  /** NUEVO: galería de imágenes originales usadas en el análisis */
  images?: {
    label: string;   // Ej: "Imagen 1", "Foto campo 1", etc.
    dataUrl: string; // data:image/...;base64,.....
  }[];

  /** NUEVO: contexto geológico del punto (INGEMMET) */
  geologyContext?: {
    unit?: string;       // Unidad geológica, p.ej. "Formación Chimú"
    lithology?: string;  // Litología, p.ej. "Cuarcitas y lutitas"
    age?: string;        // Edad, p.ej. "Cretácico Inferior"
    code?: string;       // Código, p.ej. "KICh"
    source?: string;     // Fuente, p.ej. "INGEMMET – Mapa geológico 1:100 000"
  } | null;

  interpretation?: {
    geology?: string;
    economics?: string;
    caveats?: string;
  } | null;
};

/** Utilidades */
const round2 = (n: number) => Math.round(n * 100) / 100;
const toPct = (n: number, digits = 2) => `${n.toFixed(digits)} %`;

/** Limpieza de texto */
/** Limpieza de texto */
function sanitizeText(raw: unknown): string {
  // Caso nulo/indefinido
  if (raw === null || raw === undefined) return "";

  let s: string;

  // Si ya es string, lo usamos tal cual
  if (typeof raw === "string") {
    s = raw;
  } else if (Array.isArray(raw)) {
    // Si viene un arreglo (por ejemplo, lista de cosas)
    s = raw
      .map((item) =>
        item === null || item === undefined ? "" : String(item)
      )
      .join(" ");
  } else if (typeof raw === "object") {
    // Si viene un objeto, lo convertimos a texto legible
    try {
      s = JSON.stringify(raw);
    } catch {
      s = String(raw);
    }
  } else {
    // number, boolean, etc.
    s = String(raw);
  }

  // Limpieza básica de espacios
  return s.replace(/\s+/g, " ").trim();
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

/** Construye tabla económica (alineada con la UI: Au/Ag/Pt/Pd en USD/g, resto en USD/kg) */
function buildEconomics(mix: GlobalMix, overrides?: EconOverrides) {
  const currency: CurrencyCode = overrides?.currency || "USD";
  const pricesOverride = overrides?.prices || {};
  const payablesOverride = overrides?.payables || {};

  // Tipos de cambio: formato antiguo y nuevo
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

    // 1) Precio base EXACTAMENTE igual que la UI:
    //    - Au, Ag, Pt, Pd → USD/g
    //    - Resto → USD/kg
    const basePrice =
      typeof pricesOverride[c.code] === "number"
        ? pricesOverride[c.code]!
        : c.priceDefault;

    const isPrecious =
      c.code === "Au" || c.code === "Ag" || c.code === "Pt" || c.code === "Pd";

    // Unidad interna del precio en USD
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
    //    Manteniendo coherencia:
    //    - Si el precio es por g:
    //        * tenor g/t → valor = g/t * (moneda/g)
    //        * tenor kg/t → (kg/t * 1000 g/kg) * (moneda/g)
    //    - Si el precio es por kg:
    //        * tenor kg/t → valor = kg/t * (moneda/kg)
    //        * tenor g/t → (g/t / 1000) kg/t * (moneda/kg)
    let valuePerTon = 0;

    if (basePriceUnit === "USD/g") {
      // precio por gramo
      if (c.unit === "g/t") {
        valuePerTon = payQty * adjustedPrice;
      } else if (c.unit === "kg/t") {
        const grams = payQty * 1000;
        valuePerTon = grams * adjustedPrice;
      }
    } else {
      // precio por kilogramo
      if (c.unit === "kg/t") {
        valuePerTon = payQty * adjustedPrice;
      } else if (c.unit === "g/t") {
        const kilos = payQty / 1000;
        valuePerTon = kilos * adjustedPrice;
      }
    }

    const value = round2(valuePerTon);

    // 5) Unidad del precio para mostrar en el PDF:
    //    - Au, Ag, Pt, Pd → moneda/g
    //    - Resto → moneda/kg
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

  // 🔹 Normalizamos mezcla global (evitar duplicados por idioma/etiqueta)
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

  // ================= ENCABEZADO =================
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(
    opts?.title || "Reporte de Análisis Mineral – MinQuant_WSCA",
    margin,
    y
  );
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const when = opts?.dateISO
    ? new Date(opts.dateISO).toLocaleString()
    : new Date().toLocaleString();
  doc.text(`Fecha: ${when}`, margin, y);
  y += 14;

  // ================= MAPA ESTÁTICO =================
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

  // ================= NOTA INICIAL =================
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

  // ================= MEZCLA GLOBAL =================
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Mezcla Global (normalizada a 100 %)", margin, y);
  y += 10;

  autoTable(doc, {
    startY: y + 6,
    head: [["Mineral", "%"]],
    body: mixGlobal.map((m) => [
      normalizeMineralName(m.name),
      toPct(m.pct),
    ]),
    styles: { fontSize: 9, cellPadding: 4, textColor: cellText },
    headStyles: { fillColor: headFill, textColor: headText },
    margin: { left: margin, right: margin },
    theme: "grid",
  });

  y = (doc as any).lastAutoTable.finalY + 14;

  // ================= INTERPRETACIÓN PRELIMINAR =================
  const interpretation = (opts as any)?.interpretation as
    | { geology?: string; economics?: string; caveats?: string }
    | undefined;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Interpretación preliminar", margin, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  if (interpretation) {
    const geoText = sanitizeText(interpretation.geology || "");
    const ecoText = sanitizeText(interpretation.economics || "");
    const cavText = sanitizeText(interpretation.caveats || "");

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      styles: {
        fontSize: 8,
        cellPadding: { top: 3, right: 3, bottom: 3, left: 3 },
      },
      columnStyles: {
        0: { cellWidth: 70, fontStyle: "bold" }, // títulos más anchos
        1: { cellWidth: pageW - margin * 2 - 70 },
      },
      body: [
        ["Geología", geoText || "—"],
        ["Economía", ecoText || "—"],
        ["Advertencias", cavText || "—"],
      ],
    });

    y = (doc as any).lastAutoTable.finalY + 14;
  } else {
    const fallback =
      "No se recibió interpretación automática desde la aplicación para esta muestra. " +
      "Puedes generar una nueva interpretación en la pantalla principal y volver a exportar el PDF.";
    const interLines = doc.splitTextToSize(
      sanitizeText(fallback),
      pageW - margin * 2
    );
    doc.text(interLines, margin, y);
    y += 14 * interLines.length + 20;
  }

 // ================= RESULTADOS POR IMAGEN (CON MINIATURA + TABLA) =================
doc.setFont("helvetica", "bold");
doc.setFontSize(12);
doc.text("Resultados por imagen", margin, y);
y += 16;

// Miniaturas que vienen desde la app
const thumbImages = opts?.images || [];

// Si no hay imágenes en opts, caemos a un mensaje simple
if (!byImage.length) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    "No se registraron resultados por imagen en este análisis.",
    margin,
    y
  );
  y += 20;
} else {
  for (let i = 0; i < byImage.length; i++) {
    const imgRes = byImage[i];
    const thumb = thumbImages[i]; // asumimos mismo orden que en la app

    // Si no hay espacio suficiente, nueva página
    if (y + 120 > pageH - margin) {
      doc.addPage();
      y = margin;
    }

    // ----- TÍTULO DE LA IMAGEN -----
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    const labelBase =
      imgRes.filename || thumb?.label || `Imagen ${i + 1}`;
    doc.text(`Imagen ${i + 1}: ${labelBase}`, margin, y);
    y += 10;

    // ----- MINIATURA (SI EXISTE) -----
    let blockTopY = y;
    const thumbW = 80;
    const thumbH = 80;

    try {
      if (thumb?.dataUrl) {
        doc.addImage(
          thumb.dataUrl,
          "JPEG",
          margin,
          blockTopY,
          thumbW,
          thumbH
        );
      } else {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(9);
        doc.text("Imagen no disponible en este PDF.", margin, blockTopY + 12);
      }
    } catch (err) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.text("Error al cargar imagen.", margin, blockTopY + 12);
    }

    // ----- TABLA DE MINERALES A LA DERECHA -----
    const tableStartY = blockTopY;
    const tableLeft = margin + thumbW + 10;

    const topMinerals = (imgRes.minerals || []).map((m) => [
      normalizeMineralName(m.name),
      `${m.pct.toFixed(2)} %`,
    ]);

    autoTable(doc, {
      startY: tableStartY,
      margin: { left: tableLeft, right: margin },
      head: [["Mineral detectado", "%"]],
      body: topMinerals,
      styles: { fontSize: 9, cellPadding: 3, textColor: cellText },
      headStyles: { fillColor: headFill, textColor: headText },
      theme: "grid",
      tableWidth: pageW - tableLeft - margin,
    });

    const tableEndY = (doc as any).lastAutoTable?.finalY || (tableStartY + 10);

    // Ajustamos Y debajo de la miniatura y la tabla
    y = Math.max(blockTopY + thumbH, tableEndY) + 12;

    // ----- RAZONES DE EXCLUSIÓN (si existen) -----
    if (imgRes.excluded?.reason) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      const noteLines = doc.splitTextToSize(
        `Nota: ${sanitizeText(imgRes.excluded.reason)}`,
        pageW - margin * 2
      );
      doc.text(noteLines, margin, y);
      y += noteLines.length * 12 + 8;
    }

    // Separador entre imágenes
    doc.setDrawColor(200);
    doc.line(margin, y, pageW - margin, y);
    y += 12;
  }
}

  // ================= ESTIMACIÓN ECONÓMICA =================
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Estimación económica (referencial)", margin, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    "Todos los precios base están en USD; se convierten a la moneda seleccionada según el tipo de cambio configurado en la app.",
    margin,
    y
  );
  y += 14;

  const econ = buildEconomics(mixGlobal, opts?.econ);
  const econRows = econ.rows.filter((r) => r.tenor > 0 || r.value > 0);

  autoTable(doc, {
    startY: y + 6,
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
    body: econRows.map((r) => [
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

  y = (doc as any).lastAutoTable.finalY + 20;
    // ================= CONTEXTO GEOLÓGICO DEL PUNTO =================
const geoCtx = opts?.geologyContext;

if (geoCtx && (geoCtx.unit || geoCtx.lithology || geoCtx.age || geoCtx.code || geoCtx.source)) {
  if (y + 90 > pageH - margin) {
    doc.addPage();
    y = margin;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Contexto geológico del punto", margin, y);
  y += 14;

  const rows: string[][] = [
    ["Unidad geológica", geoCtx.unit || "—"],
    ["Litología", geoCtx.lithology || "—"],
  ];

  if (geoCtx.age)   rows.push(["Edad geológica", geoCtx.age]);
  if (geoCtx.code)  rows.push(["Código de unidad", geoCtx.code]);
  if (geoCtx.source) rows.push(["Fuente", geoCtx.source]);

  autoTable(doc, {
    startY: y + 4,
    margin: { left: margin, right: margin },
    head: [["Atributo", "Valor"]],
    body: rows,
    styles: { fontSize: 9, cellPadding: 3, textColor: cellText },
    headStyles: { fillColor: headFill, textColor: headText },
    theme: "grid",
  });

  y = (doc as any).lastAutoTable.finalY + 20;
}


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
    // ================= GALERÍA DE IMÁGENES (MUESTRAS ORIGINALES) =================
  if (opts?.images && Array.isArray(opts.images) && opts.images.length > 0) {
    doc.addPage();
    let gy = margin;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Galería de imágenes de la muestra", margin, gy);
    gy += 16;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const intro = doc.splitTextToSize(
      "A continuación se muestran miniaturas de las fotografías empleadas en el análisis. " +
        "Estas imágenes corresponden a la muestra mineral capturada en campo o subida desde galería.",
      pageW - margin * 2
    );
    doc.text(intro, margin, gy);
    gy += intro.length * 12 + 10;

    const imgW = 160;  // ancho de cada miniatura
    const imgH = 120;  // alto de cada miniatura
    const gapX = 20;
    const gapY = 40;

    // coordenadas iniciales
    let x = margin;
    let rowStartY = gy;

    for (let i = 0; i < opts.images.length; i++) {
      const item = opts.images[i];
      const dataUrl = item.dataUrl;

      // Si no cabe en la página, pasamos a una nueva
      if (gy + imgH + 40 > pageH - margin) {
        doc.addPage();
        gy = margin;
        x = margin;
        rowStartY = gy;
      }

      // Determinar formato a partir del dataURL
      let fmt: "PNG" | "JPEG" = "JPEG";
      if (typeof dataUrl === "string" && dataUrl.startsWith("data:image/png")) {
        fmt = "PNG";
      }

      try {
        doc.addImage(dataUrl, fmt, x, gy, imgW, imgH);
      } catch {
        // Si falla, ponemos un recuadro de error
        doc.setDrawColor(180);
        doc.rect(x, gy, imgW, imgH);
        doc.setFontSize(8);
        doc.text("Imagen no disponible", x + 8, gy + imgH / 2);
      }

      // Etiqueta debajo de la imagen
      doc.setFontSize(9);
      doc.text(item.label || `Imagen ${i + 1}`, x, gy + imgH + 12);

      // Siguiente columna
      x += imgW + gapX;

      // Si se sale de margen derecho, nueva fila
      if (x + imgW > pageW - margin) {
        x = margin;
        gy = rowStartY + imgH + gapY;
        rowStartY = gy;
      }
    }

    // Actualizamos y por si luego se quisiera continuar
    y = gy + imgH + 30;
  }

// ================= CONCLUSIONES Y RECOMENDACIONES (OPTIMIZADO v2) =================
try {

  const base = buildConclusionesYRecomendaciones(mixGlobal);
  let conclusiones: string[] = [];
  let recomendaciones: string[] = [];

  // === 1. CONCLUSIÓN GENERAL SOBRE MEZCLA ===
  const top3 = mixGlobal.slice(0, 3)
    .map(m => `${normalizeMineralName(m.name)} (${m.pct.toFixed(2)}%)`)
    .join(", ");
  
  conclusiones.push(
    `La mezcla mineral analizada está compuesta principalmente por: ${top3}.`
  );

  // === 2. CONCLUSIONES TÉCNICAS PROFUNDAS ===
  conclusiones.push(...base.conclusiones);

  // === 3. CONTEXTO GEOESPACIAL (yacimientos cercanos) ===
  const nearby = Array.isArray(opts?.nearbySources) ? opts!.nearbySources : [];
  if (nearby.length > 0) {

    const metalsFound = new Set<string>();
    nearby.forEach((y) => {
      const text = `${y.name || ""} ${y.mineral || ""} ${y.commodity || ""}`.toUpperCase();
      if (/ORO|AU/.test(text)) metalsFound.add("oro (Au)");
      if (/COBRE|CU/.test(text)) metalsFound.add("cobre (Cu)");
      if (/PLATA|AG/.test(text)) metalsFound.add("plata (Ag)");
      if (/HIERRO|FE/.test(text)) metalsFound.add("hierro (Fe)");
      if (/ZINC|ZN/.test(text)) metalsFound.add("zinc (Zn)");
      if (/PLOMO|PB/.test(text)) metalsFound.add("plomo (Pb)");
    });

    if (metalsFound.size > 0) {
      conclusiones.push(
        `En el entorno próximo se registran ocurrencias y yacimientos asociados a ${Array.from(metalsFound).join(
          ", "
        )}, lo cual coincide parcialmente con la firma mineral observada en la muestra.`
      );
    }
  }

  // === 4. INTEGRACIÓN NATURAL DE LA INTERPRETACIÓN PRELIMINAR ===
  // Solo aparece si aporta contenido distinto
  if (interpretation?.geology) {
    const g = sanitizeText(interpretation.geology);
    if (g && !conclusiones.some(c => c.includes(g.slice(0, 20)))) {
      conclusiones.push(`Según la interpretación preliminar asistida por IA: ${g}`);
    }
  }

  if (interpretation?.economics) {
    const e = sanitizeText(interpretation.economics);
    conclusiones.push(`Desde una perspectiva económica preliminar: ${e}`);
  }

  // ============================================================
  //                      RECOMENDACIONES
  // ============================================================

  // (A) Base general
  recomendaciones.push(
    "Registrar fotografías adicionales con diferentes ángulos e iluminación.",
    "Describir en campo color, brillo, dureza aproximada y tipo de fractura.",
    "Romper muestras frescas para descartar alteración superficial."
  );

  // (B) Ajustes según el mix mineralógico

  const pctCu = mixGlobal.filter(m => /malaquita|azurita|crisocola|cuprita|tenorita/i.test(m.name)).reduce((a,b)=>a+b.pct,0);
  const pctFe = mixGlobal.filter(m => /limonita|goethita|hematita|magnetita/i.test(m.name)).reduce((a,b)=>a+b.pct,0);
  const pctSulf = mixGlobal.filter(m => /pirita|pyrite|calcopirita|chalcopyrite|bornita|covelina/i.test(m.name)).reduce((a,b)=>a+b.pct,0);

  if (pctCu >= 10) {
    recomendaciones.push(
      "Evaluar la posibilidad de sulfuros primarios de Cu en profundidad; la zona podría corresponder a un dominio oxidado o de transición.",
      "Si la mineralización es predominantemente oxidada, realizar análisis de Cu total para determinar potencial económico."
    );
  }

  if (pctFe >= 15 && pctCu < 10 && pctSulf < 5) {
    recomendaciones.push(
      "La abundancia de óxidos/hidróxidos de Fe sugiere gossan; utilizarlo como guía para dirigir muestreo hacia zonas frescas con mayor potencial."
    );
  }

  if (pctSulf >= 5) {
    recomendaciones.push(
      "Realizar pruebas mecánicas sobre posibles sulfuros (raya, brillo metálico, dureza) para discriminar especies.",
      "Si persisten dudas, enviar submuestras frescas a ICP-OES/AA."
    );
  }

  // (C) Integración de yacimientos cercanos
  if (nearby.length > 0) {
    recomendaciones.push(
      "Correlacionar los resultados con los yacimientos detectados en el entorno, priorizando muestreo sistemático a lo largo de estructuras o zonas alteradas."
    );
  }

  // (D) Cierre obligatorio
  recomendaciones.push(
    "Este informe es preliminar y requiere validación mediante ensayos químicos certificados.",
    "No utilizar esta estimación visual asistida por IA como único sustento para decisiones económicas o de explotación."
  );

  // ============================================================
  //                   IMPRESIÓN EN EL PDF
  // ============================================================

  doc.addPage();
  let Y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Conclusiones y recomendaciones", margin, Y);
  Y += 24;

  // --- CONCLUSIONES ---
  doc.setFontSize(11);
  doc.text("Conclusiones:", margin, Y);
  Y += 16;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const concText = doc.splitTextToSize(
    conclusiones.map(c => `• ${c}`).join("\n"),
    pageW - margin * 2
  );
  doc.text(concText, margin, Y);
  Y += concText.length * 14 + 22;

  // --- RECOMENDACIONES ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Recomendaciones:", margin, Y);
  Y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const recText = doc.splitTextToSize(
    recomendaciones.map(r => `• ${r}`).join("\n"),
    pageW - margin * 2
  );
  doc.text(recText, margin, Y);

} catch (err) {
  console.error("Error en conclusiones/recomendaciones PDF v2:", err);
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
