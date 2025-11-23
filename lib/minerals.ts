// lib/minerals.ts — cliente con caché para /api/mineral-info
// + motor de sugerencias automáticas de recovery/payables según minerales y país.

export type MineralInfo = {
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

const cache = new Map<string, MineralInfo>();

export async function getMineralInfo(name: string): Promise<MineralInfo> {
  const key = (name || "").trim().toLowerCase();
  if (cache.has(key)) return cache.get(key)!;

  try {
    const url = `/api/mineral-info?name=${encodeURIComponent(name)}`;
    const r = await fetch(url, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error || "Bad response");
    cache.set(key, j);
    return j;
  } catch {
    const fallback: MineralInfo = { nombre: name };
    cache.set(key, fallback);
    return fallback;
  }
}

/* -------------------------------------------------------------------------- */
/*    NUEVO: Motor de sugerencias automáticas según minerales y país          */
/* -------------------------------------------------------------------------- */

/** Mapa mineral → metal económico */
const MINERAL_TO_METAL: Record<string, string> = {
  // Cobre
  malaquita: "Cu",
  azurita: "Cu",
  calcopirita: "Cu",
  bornita: "Cu",
  calcocita: "Cu",
  calcosina: "Cu",

  // Oro / Plata (no siempre visibles)
  oro: "Au",
  electrum: "Au",
  plata: "Ag",
  argentita: "Ag",

  // Zinc
  esfalerita: "Zn",
  smithsonita: "Zn",

  // Plomo
  galena: "Pb",

  // Estaño
  casiterita: "Sn",

  // Hierro
  hematita: "Fe",
  magnetita: "Fe",
  limonita: "Fe",
  goethita: "Fe",
};

/**
 * Sugerencias por país
 * — Valores orientativos para recuperar/payable por metal.
 */
const COUNTRY_DEFAULTS: Record<
  string,
  {
    processAdj: {
      Cobre: { recovery: number; payable: number };
      Zinc: { recovery: number; payable: number };
      Plomo: { recovery: number; payable: number };
    };
    payables: Record<string, number>;
  }
> = {
  PE: {
    processAdj: {
      Cobre: { recovery: 0.88, payable: 0.96 },
      Zinc: { recovery: 0.85, payable: 0.85 },
      Plomo: { recovery: 0.90, payable: 0.90 },
    },
    payables: {
      Cu: 0.85,
      Zn: 0.85,
      Pb: 0.85,
      Au: 0.92,
      Ag: 0.90,
      Fe: 0.70,
      Sn: 0.75,
    },
  },

  GLOBAL: {
    processAdj: {
      Cobre: { recovery: 0.85, payable: 0.95 },
      Zinc: { recovery: 0.80, payable: 0.82 },
      Plomo: { recovery: 0.88, payable: 0.88 },
    },
    payables: {
      Cu: 0.80,
      Zn: 0.78,
      Pb: 0.80,
      Au: 0.90,
      Ag: 0.88,
      Fe: 0.65,
      Sn: 0.70,
    },
  },
};

/**
 * Dado un conjunto de minerales detectados por IA,
 * sugiere:
 * - qué commodities están presentes
 * - valores recomendados de recovery/payable
 * - payables por metal
 */
export function suggestFromMinerals(
  mix: { name: string; pct: number }[],
  country?: string
) {
  // 1. Detectar país
  const cc =
    country?.toUpperCase() === "PE" ||
    country?.toLowerCase() === "peru" ||
    country?.toLowerCase() === "perú"
      ? "PE"
      : "GLOBAL";

  const base = COUNTRY_DEFAULTS[cc];

  // 2. Detectar metales en la mezcla
  const metals = new Set<string>();
  for (const m of mix) {
    const k = m.name.toLowerCase();
    if (MINERAL_TO_METAL[k]) metals.add(MINERAL_TO_METAL[k]);
  }

  const commodities = Array.from(metals);

  // 3. Construir payables sugeridos
  const payables: Record<string, number> = {};
  for (const metal of commodities) {
    payables[metal] = base.payables[metal] ?? base.payables["Cu"];
  }

  return {
    country: cc,
    commodities,
    processAdj: base.processAdj,
    payables,
  };
}
