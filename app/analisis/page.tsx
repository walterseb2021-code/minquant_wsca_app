"use client";

import React from "react";
import Link from "next/link";
import CameraCapture, { type CapturedPhoto } from "../../components/CameraCapture";
import GeoCapture, { type GeoResult } from "../../components/GeoCapture";
import GeoSourcesPanel from "@/components/GeoSourcesPanel";
import type { GeoSourceItem } from "../../lib/geo/types";

import {
  buildMineralPdf,
  downloadPdf,
  type MineralResult,
  type CurrencyCode,
  type CommodityAdjustments,
} from "../../lib/pdf";

import { buildReportPdfPlus } from "../../lib/pdf_plus";
import { suggestFromMinerals } from "../../lib/minerals";
import LogoutButton from "@/components/LogoutButton";


/* ===================== Helpers ===================== */
async function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

async function resizeImageFile(file: File, maxWH = 1280, quality = 0.7): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  const scale = Math.min(1, maxWH / Math.max(width, height));
  const dstW = Math.round(width * scale);
  const dstH = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = dstW;
  canvas.height = dstH;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, dstW, dstH);

  const blob: Blob = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b || file), "image/jpeg", quality)
  );
  bitmap.close?.();
  return blob;
}

/* ===================== Tipos y datos ===================== */
type MineralInfoWeb = {
  nombre: string;
  formula?: string;
  densidad?: string;
  color?: string;
  habito?: string;
  ocurrencia?: string;
  notas?: string;
  mohs?: string;
  brillo?: string;
  sistema?: string;
  asociados?: string;
  commodity?: string;
  fuentes?: { title: string; url: string }[];
};

const PRICE_MAP_USD: Record<string, number> = {
  Oro: 80000,
  Plata: 900,
  Cobre: 9000,
  Litio: 15000,
  Platino: 30000,
  Calcita: 38.4,
  Cuarzo: 22,
  Feldespato: 30.2,
};

/* ======== 20 COMMODITIES ======== */
type CommodityCode =
  | "Au" | "Ag" | "Pt" | "Pd"
  | "Cu" | "Zn" | "Pb" | "Sn" | "Ni" | "Mo"
  | "Sb" | "Co" | "V" | "Ti" | "W"
  | "Li" | "Fe" | "Al" | "Mn"
  | "REE";

type CommodityConfig = {
  code: CommodityCode;
  label: string;
  group:
    | "Metales preciosos"
    | "Metales base"
    | "Críticos / Menores"
    | "Industriales / Energéticos"
    | "Tierras raras";
};

const COMMODITY_CONFIG: CommodityConfig[] = [
  { code: "Au", label: "Oro (Au)", group: "Metales preciosos" },
  { code: "Ag", label: "Plata (Ag)", group: "Metales preciosos" },
  { code: "Pt", label: "Platino (Pt)", group: "Metales preciosos" },
  { code: "Pd", label: "Paladio (Pd)", group: "Metales preciosos" },

  { code: "Cu", label: "Cobre (Cu)", group: "Metales base" },
  { code: "Zn", label: "Zinc (Zn)", group: "Metales base" },
  { code: "Pb", label: "Plomo (Pb)", group: "Metales base" },
  { code: "Sn", label: "Estaño (Sn)", group: "Metales base" },
  { code: "Ni", label: "Níquel (Ni)", group: "Metales base" },
  { code: "Mo", label: "Molibdeno (Mo)", group: "Metales base" },

  { code: "Sb", label: "Antimonio (Sb)", group: "Críticos / Menores" },
  { code: "Co", label: "Cobalto (Co)", group: "Críticos / Menores" },
  { code: "V", label: "Vanadio (V)", group: "Críticos / Menores" },
  { code: "Ti", label: "Titanio (Ti)", group: "Críticos / Menores" },
  { code: "W", label: "Tungsteno (W)", group: "Críticos / Menores" },

  { code: "Li", label: "Litio (Li)", group: "Industriales / Energéticos" },
  { code: "Fe", label: "Hierro (Fe)", group: "Industriales / Energéticos" },
  { code: "Al", label: "Bauxita / Aluminio (Al)", group: "Industriales / Energéticos" },
  { code: "Mn", label: "Manganeso (Mn)", group: "Industriales / Energéticos" },

  { code: "REE", label: "Tierras raras (REE)", group: "Tierras raras" },
];

const DEFAULT_PRICES: Record<CommodityCode, number> = {
  // Metales preciosos (USD por gramo)
  Au: 131,
  Ag: 1.67,
  Pt: 32,
  Pd: 30.5,

  // Metales base y otros (USD por kilogramo)
  Cu: 11,
  Zn: 3.25,
  Pb: 2.05,
  Sn: 36.2,
  Ni: 14.5,
  Mo: 20,
  Sb: 12,
  Co: 32,
  V: 25,
  Ti: 4,
  W: 40,
  Li: 14,
  Fe: 0.12,
  Al: 2.81,
  Mn: 2,
  REE: 80,
};

const DEFAULT_PAYABLES: Record<CommodityCode, number> = {
  Au: 0.92,
  Ag: 0.9,
  Pt: 0.9,
  Pd: 0.9,

  Cu: 0.96,
  Zn: 0.85,
  Pb: 0.9,
  Sn: 0.95,
  Ni: 0.95,
  Mo: 0.97,

  Sb: 0.9,
  Co: 0.9,
  V: 0.88,
  Ti: 0.85,
  W: 0.95,

  Li: 0.85,
  Fe: 0.98,
  Al: 0.9,
  Mn: 0.9,

  REE: 0.9,
};

// Conversión sólo para la UI
function convertPrice(
  priceUSD: number,
  currency: CurrencyCode,
  usdToPen: number,
  eurToPen: number
): number {
  if (currency === "USD") return priceUSD;
  if (currency === "PEN") return priceUSD * usdToPen;
  if (currency === "EUR") {
    const usdToEur = usdToPen / eurToPen;
    return priceUSD * usdToEur;
  }
  return priceUSD;
}

const NAME_TO_CODE: Record<string, CommodityCode> = {
  Oro: "Au",
  Plata: "Ag",
  Cobre: "Cu",
  Aluminio: "Al",
  Zinc: "Zn",
  Plomo: "Pb",
  Estaño: "Sn",
  Níquel: "Ni",
};

// Unidades que se muestran en la UI para el precio
const COMMODITY_UNITS: Record<CommodityCode, string> = {
  // Metales preciosos → precio por gramo
  Au: "USD/g",
  Ag: "USD/g",
  Pt: "USD/g",
  Pd: "USD/g",

  // Resto → precio por kilogramo de metal fino
  Cu: "USD/kg",
  Zn: "USD/kg",
  Pb: "USD/kg",
  Sn: "USD/kg",
  Ni: "USD/kg",
  Mo: "USD/kg",

  Sb: "USD/kg",
  Co: "USD/kg",
  V: "USD/kg",
  Ti: "USD/kg",
  W: "USD/kg",

  Li: "USD/kg",
  Fe: "USD/kg",
  Al: "USD/kg",
  Mn: "USD/kg",

  REE: "USD/kg",
};

type Interpretation = { geology: string; economics: string; caveats: string };

type NearbySummary = {
  hasAu: boolean;
  hasCu: boolean;
  hasAg: boolean;
};

/** Resume si en los yacimientos cercanos aparece Au / Cu / Ag */
function summarizeNearbyForInterpretation(
  list: GeoSourceItem[]
): NearbySummary | undefined {
  if (!list || !list.length) return undefined;

  const text = list
    .map((it) => {
      const anyCommodity = (it as any).commodity || "";
      const name = it.name || "";
      return `${anyCommodity} ${name}`;
    })
    .join(" ")
    .toUpperCase();

  return {
    hasAu: /\bORO\b|\bAU\b/.test(text),
    hasCu: /\bCOBRE\b|\bCU\b/.test(text),
    hasAg: /\bPLATA\b|\bAG\b/.test(text),
  };
}

/** Construye la interpretación considerando minerales + yacimientos cercanos */
function buildInterpretationClient(
  results: MineralResult[],
  nearby?: NearbySummary
): Interpretation {
  if (!results.length) {
    return {
      geology: "—",
      economics: "—",
      caveats:
        "• Estimación preliminar basada en imágenes • Validar con ensayos de laboratorio certificados.",
    };
  }

  const names = results.map((r) => r.name.toLowerCase());
  const has = (s: string) =>
    names.some((n) => n.includes(s.toLowerCase()));

  const gOxFe =
    has("limonita") ||
    has("goethita") ||
    has("óxidos de hierro") ||
    has("oxidos de hierro") ||
    has("hematita");
  const gCuSec = has("malaquita") || has("azurita");
  const gCuSulf = has("calcopirita") || has("bornita");
  const gQtz = has("cuarzo") || has("quartz");

  const geo: string[] = [];
  if (gOxFe) geo.push("Óxidos/hidróxidos de hierro (gossan)");
  if (gQtz) geo.push("Vetas/venillas de cuarzo");
  if (gCuSec) geo.push("Minerales secundarios de cobre (malaquita/azurita)");
  if (gCuSulf) geo.push("Sulfuros de cobre en zona primaria");

  if (!geo.length) {
    geo.push(
      "Ensamble mineral compatible con ambiente hidrotermal o supergénico."
    );
  }

  const hasAuNear = nearby?.hasAu ?? false;
  const hasCuNear = nearby?.hasCu ?? false;
  const hasAgNear = nearby?.hasAg ?? false;

  let economics: string;

  if (gOxFe && hasAuNear) {
    economics =
      "Posible asociación a sistema aurífero con oro fino no visible alojado en sulfuros alterados bajo el gossan. " +
      "Se requieren ensayos geoquímicos específicos para Au (ensayo al fuego, AA u otro método certificado) para confirmarlo.";
  } else if ((gCuSec || gCuSulf) && hasCuNear) {
    economics =
      "Asociación consistente con un sistema cuprífero; los minerales observados y los yacimientos de cobre cercanos " +
      "sugieren potencial de Cu económicamente interesante, sujeto a ensayo químico detallado.";
  } else {
    economics =
      "Evaluar potencial de Cu, Pb/Zn y metales preciosos 'invisibles' en sulfuros mediante ensayos geoquímicos detallados.";
  }

  const caveats: string[] = [
    "• Estimación preliminar asistida por IA a partir de imágenes.",
    "• No reemplaza estudios geológicos de detalle ni ensayos químicos certificados (ICP, AA, ensayo al fuego u otros).",
  ];

  if (hasAuNear || hasCuNear || hasAgNear) {
    const metals: string[] = [];
    if (hasAuNear) metals.push("oro (Au)");
    if (hasCuNear) metals.push("cobre (Cu)");
    if (hasAgNear) metals.push("plata (Ag)");

    caveats.push(
      `• En el entorno inmediato se registran yacimientos con ${metals.join(
        ", "
      )} según la cartografía oficial, lo que refuerza el potencial metalífero de la zona.`
    );

    if (hasAuNear) {
      caveats.push(
        "• Se recomienda muestrear material fresco (romper la roca y evitar sólo costras muy oxidadas) y enviar submuestras " +
          "a ensayo específico de Au y Ag por ensayo al fuego/AA."
      );
    }
  }

  caveats.push(
    "• No utilizar este reporte como único sustento para decisiones económicas o de inversión."
  );

  return {
    geology: "• " + geo.join(" • "),
    economics,
    caveats: caveats.join(" "),
  };
}


/* ===================== COMPONENTE PRINCIPAL ===================== */
export default function AnalisisPage() {
  const [photos, setPhotos] = React.useState<CapturedPhoto[]>([]);
  const [imagesDataURL, setImagesDataURL] = React.useState<string[]>([]);
  const [geo, setGeo] = React.useState<GeoResult | null>(null);

  /* Sesión */
  const [sessionCounter, setSessionCounter] = React.useState(1);
  const fmtCode = (n: number) => `MQ-${String(n).padStart(4, "0")}`;
  const [sampleCode, setSampleCode] = React.useState(fmtCode(1));

  /* Moneda */
  const [currency, setCurrency] = React.useState<CurrencyCode>("USD");
  const [usdToPen, setUsdToPen] = React.useState<number>(3.38);
  const [eurToPen, setEurToPen] = React.useState<number>(3.89);

  /* Procesos Cu/Zn/Pb */
  const [adj, setAdj] = React.useState<CommodityAdjustments>({
    Cobre: { recovery: 0.88, payable: 0.96 },
    Zinc: { recovery: 0.85, payable: 0.85 },
    Plomo: { recovery: 0.9, payable: 0.9 },
  });

  /* Economía 20 commodities */
  const [prices, setPrices] = React.useState(DEFAULT_PRICES);
  const [payables, setPayables] = React.useState(DEFAULT_PAYABLES);

  React.useEffect(() => {
    async function loadMarketPrices() {
      try {
        const res = await fetch("/api/commodity-prices?currency=USD", {
          cache: "no-store",
        });
        const data = await res.json();

        if (!res.ok || !data?.prices) {
          console.warn("No se pudieron cargar precios de mercado, usando DEFAULT_PRICES.");
          return;
        }

        const apiPrices = data.prices as Record<string, number>;
        const apiUnits = (data.units || {}) as Record<string, string>;

        setPrices((prev) => {
          const next = { ...prev };

          for (const [name, rawValue] of Object.entries(apiPrices)) {
            const code = NAME_TO_CODE[name as keyof typeof NAME_TO_CODE];
            if (!code) continue;

            const unit = (apiUnits[name] || "").toUpperCase();
            let finalPrice = rawValue;

            const isPrecious = name === "Oro" || name === "Plata";

            if (!isPrecious) {
              if (unit.includes("USD/T")) {
                finalPrice = rawValue / 1000;
              } else {
                finalPrice = rawValue / 1000;
              }
            }

            next[code] = finalPrice;
          }

          return next;
        });

        console.log("Precios normalizados desde API:", data.prices);
        console.log("Unidades originales:", apiUnits);
        console.log("Fuente:", data.source, "Fecha:", data.updatedAt);
      } catch (err) {
        console.error("Error cargando precios de mercado:", err);
      }
    }

    loadMarketPrices();
  }, []);

  /* Resultados */
  const [globalResults, setGlobalResults] = React.useState<MineralResult[]>([]);
  const [perImage, setPerImage] = React.useState<{ fileName: string; results: MineralResult[] }[]>([]);
  const [excluded, setExcluded] = React.useState<{ fileName: string; reason: string }[]>([]);
  const [interpretation, setInterpretation] = React.useState<Interpretation | null>(null);

  /* Sugerencias automáticas */
  const [autoSuggestion, setAutoSuggestion] = React.useState<any>(null);
  const [suggestionApplied, setSuggestionApplied] = React.useState(false);

  /* UI */
  const [busyAnalyze, setBusyAnalyze] = React.useState(false);
  const [busyGeneralPdf, setBusyGeneralPdf] = React.useState(false);
  const [busyMineralPdf, setBusyMineralPdf] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(t);
  }, [toast]);

  /* Modal ficha mineral */
  const [modalOpen, setModalOpen] = React.useState(false);
  const [modalMineral, setModalMineral] = React.useState<MineralResult | null>(null);
  const [modalInfo, setModalInfo] = React.useState<MineralInfoWeb | null>(null);
  const [loadingInfo, setLoadingInfo] = React.useState(false);

  /* Nearby */
  const [nearbyItems, setNearbyItems] = React.useState<GeoSourceItem[]>([]);
  const [nearbySelected, setNearbySelected] = React.useState<GeoSourceItem[]>([]);
  const [loadingNearby, setLoadingNearby] = React.useState(false);
  const [errorNearby, setErrorNearby] = React.useState<string | null>(null);

  // Recalcular interpretación cuando cambian resultados o yacimientos
React.useEffect(() => {
  async function runInterpretation() {
    if (!globalResults.length) {
      setInterpretation(null);
      return;
    }

    // Preparar payload igual que en el PDF
    const payload = {
      sampleLabel: sampleCode || null,
      mixGlobal: globalResults,
      byImage: perImage.map((p) => ({
        filename: p.fileName,
        minerals: p.results,
        excluded: null,
      })),
      nearbySources:
        nearbySelected.length > 0 ? nearbySelected : nearbyItems,
      geoContext: geo || null,
    };

    try {
      const resp = await fetch("/api/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (resp.ok) {
        const data = await resp.json();
        setInterpretation(data);
      } else {
        console.warn("Fallo interpret dinámico:", await resp.text());

        // fallback a tu función antigua
        const summary = summarizeNearbyForInterpretation(
          nearbySelected.length ? nearbySelected : nearbyItems
        );
        setInterpretation(buildInterpretationClient(globalResults, summary));
      }
    } catch (err) {
      console.error("Error interpret:", err);

      // fallback seguro
      const summary = summarizeNearbyForInterpretation(
        nearbySelected.length ? nearbySelected : nearbyItems
      );
      setInterpretation(buildInterpretationClient(globalResults, summary));
    }
  }

  runInterpretation();
}, [globalResults, perImage, nearbyItems, nearbySelected, geo, sampleCode]);


  /* Handlers */
  const setNum = (metal: "Cobre" | "Zinc" | "Plomo", field: "recovery" | "payable", val: string) => {
    const pct = Math.max(0, Math.min(100, Number(val)));
    setAdj((prev) => ({
      ...prev,
      [metal]: {
        ...prev[metal],
        [field]: pct / 100,
      },
    }));
  };

  const handlePhotos = React.useCallback(async (arr: CapturedPhoto[]) => {
    setPhotos(arr);
    const urls = await Promise.all(arr.map((x) => fileToDataURL(x.file)));
    setImagesDataURL(urls);
  }, []);

  const handleGeo = (g: GeoResult) => setGeo(g);

  /* ===================== ANALIZAR ===================== */
  async function handleAnalyze() {
    if (!photos.length) {
      setToast("Primero toma o sube una foto.");
      return;
    }

    setBusyAnalyze(true);

    try {
      const form = new FormData();
      const subset = photos.slice(0, 6);

      for (const p of subset) {
        const blob = await resizeImageFile(p.file);
        const name = p.file.name.replace(/\.(jpg|jpeg|png|webp)$/i, "") + "_cmp.jpg";
        form.append("images", new File([blob], name, { type: "image/jpeg" }));
      }

      const r = await fetch("/api/analyze", { method: "POST", body: form });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Error analizando.");

      setPerImage(j.perImage ?? []);
      setExcluded(j.excluded ?? []);
      setGlobalResults(j.global ?? []);

      try {
        const cc =
          geo?.countryCode ||
          geo?.country ||
          geo?.point?.country ||
          null;

        const sug = suggestFromMinerals(j.global ?? [], cc || undefined);
        setAutoSuggestion(sug);
      } catch (err) {
        console.warn("No se pudieron generar sugerencias:", err);
      }
    } catch (e: any) {
      console.error(e);
      setToast(e.message || "Error al analizar.");
    } finally {
      setBusyAnalyze(false);
    }
  }

  /* ===================== SUGERENCIAS ===================== */
  function applyAutoSuggestion() {
    if (!autoSuggestion) {
      setToast("No hay sugerencias disponibles.");
      return;
    }

    try {
      if (autoSuggestion.processAdj) {
        const pa = autoSuggestion.processAdj;
        setAdj({
          Cobre: pa.Cobre,
          Zinc: pa.Zinc,
          Plomo: pa.Plomo,
        });
      }

      const updated = { ...payables };
      for (const k of Object.keys(autoSuggestion.payables || {})) {
        updated[k as CommodityCode] = autoSuggestion.payables[k];
      }
      setPayables(updated);

      setSuggestionApplied(true);
      setToast("Sugerencias aplicadas.");
    } catch {
      setToast("Error aplicando sugerencias.");
    }
  }

  /* ===================== BUSCAR YACIMIENTOS ===================== */
  async function fetchNearby(lat: number, lng: number) {
    try {
      setLoadingNearby(true);
      setNearbyItems([]);
      setErrorNearby(null);

      const r = await fetch(
        `/api/nearby?lat=${lat}&lon=${lng}&radius_km=15`,
        { cache: "no-store" }
      );
      const js = await r.json();

      if (!r.ok) {
        setErrorNearby(js.error || "Error obteniendo yacimientos.");
        return;
      }

      const items = (js.items ?? []) as GeoSourceItem[];
      setNearbyItems(items);

      if (!items.length) {
        setToast("No se encontraron yacimientos automáticos.");
      }
    } catch (e: any) {
      console.error(e);
      setErrorNearby("Error buscando yacimientos.");
    } finally {
      setLoadingNearby(false);
    }
  }

  function toggleNearbySelect(it: GeoSourceItem) {
    setNearbySelected((prev) => {
      const ex = prev.find((x) => x.id === it.id);
      return ex ? prev.filter((x) => x.id !== it.id) : [...prev, it];
    });
  }

  /* ===================== METADATOS GEO PARA UI ===================== */
  function getGeoMeta(it: GeoSourceItem) {
    const anyIt = it as any;

    const type: string = anyIt.type || "Elemento geológico";
    const subtype: string = anyIt.subtype || "";
    const rawCommodity = anyIt.commodity ?? anyIt.mineral ?? anyIt.element ?? "";
    const commodityArr: string[] = Array.isArray(rawCommodity)
      ? rawCommodity
      : rawCommodity
      ? [String(rawCommodity)]
      : [];
    const commodityText = commodityArr.join(", ");

    const distMeters = typeof anyIt.distance_m === "number" ? anyIt.distance_m : null;
    const distanceKm = distMeters != null ? distMeters / 1000 : null;

    return { type, subtype, commodityText, distanceKm };
  }
  /* ===================== PDF GENERAL ===================== */
 async function handleExportGeneralPdf() {
  if (!globalResults.length) {
    setToast("Primero analiza las imágenes.");
    return;
  }

  setBusyGeneralPdf(true);

  try {
    // ============================================================
    // 1) PREPARAR PAYLOAD PARA INTERPRETACIÓN DINÁMICA
    // ============================================================
    const payload = {
      sampleLabel: sampleCode || null,
      mixGlobal: globalResults,
      byImage: perImage.map((p) => ({
        filename: p.fileName,
        minerals: p.results,
        excluded: null,
      })),
      nearbySources:
        nearbySelected.length > 0 ? nearbySelected : nearbyItems,
      geoContext: geo || null,
    };

    // ============================================================
    // 2) LLAMAR A /api/interpret
    // ============================================================
    let interpreted = null;

    try {
      const resp = await fetch("/api/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (resp.ok) {
        interpreted = await resp.json();
        console.log("[Interpretación dinámica lista]", interpreted);
      } else {
        console.warn(
          "[Interpretación dinámica] Falló /api/interpret:",
          await resp.text()
        );
      }
    } catch (err) {
      console.error("[Interpretación dinámica] Error en llamada:", err);
    }

    // ============================================================
    // 3) CONFIG ECONÓMICA / PAYABLES / FX (TU CÓDIGO NORMAL)
    // ============================================================
    const processAdj = {
      Cobre: adj.Cobre ?? { recovery: 0.85, payable: 0.96 },
      Zinc: adj.Zinc ?? { recovery: 0.85, payable: 0.85 },
      Plomo: adj.Plomo ?? { recovery: 0.9, payable: 0.9 },
    };

    const econ = {
      currency,
      prices: { ...prices },
      payables: { ...payables },
      fx: {
        usdToPen,
        eurToPen,
      },
    };

    const byImage = perImage.map((p) => ({
      filename: p.fileName,
      minerals: p.results,
      excluded: null,
    }));

    const selectedOrAll =
      nearbySelected.length > 0 ? nearbySelected : nearbyItems;

    // ============================================================
    // 4) ARMAR OPCIONES PARA EL PDF GENERAL
    // ============================================================
    const opts = {
      title: `Reporte ${sampleCode}`,
      note: "Informe generado automáticamente por MinQuant_WSCA.",
      lat: geo?.point?.lat,
      lng: geo?.point?.lng,
      dateISO: new Date().toISOString(),
      econ,
      nearbySources: selectedOrAll,
      processAdj,
      images: imagesDataURL,

      // 🔥 CLAVE: enviar la interpretación dinámica al PDF
      interpretation: interpreted || interpretation || null,
    };

    // ============================================================
    // 5) GENERAR PDF GENERAL
    // ============================================================
    const doc = await buildReportPdfPlus({
      mixGlobal: globalResults,
      byImage,
      opts,
    } as any);

    const buf = doc.output("arraybuffer");
    downloadPdf(new Uint8Array(buf), `Reporte_${sampleCode}.pdf`);
  } catch (e) {
    console.error(e);
    setToast("Error al generar el PDF.");
  } finally {
    setBusyGeneralPdf(false);
  }
}

  /* ===================== FICHA INDIVIDUAL ===================== */
  async function openMineral(m: MineralResult) {
    setModalMineral(m);
    setModalOpen(true);
    setLoadingInfo(true);

    try {
      const r = await fetch(`/api/mineral-info?name=${encodeURIComponent(m.name)}`);
      const j = await r.json();
      setModalInfo(j ?? { nombre: m.name });
    } catch {
      setModalInfo({ nombre: m.name });
    } finally {
      setLoadingInfo(false);
    }
  }

  async function exportMineralPdf() {
    if (!modalMineral) return;

    setBusyMineralPdf(true);

    try {
      const { name, pct } = modalMineral;

      const bytes = await buildMineralPdf({
        mineralName: modalInfo?.nombre || name,
        price: PRICE_MAP_USD[name] ?? 0,
        samplePct: pct,
        currency,
        notes: modalInfo?.notas,
        infoOverride: modalInfo || undefined,
      });

      downloadPdf(bytes, `Ficha_${name}.pdf`);
    } catch {
      setToast("Error generando ficha.");
    } finally {
      setBusyMineralPdf(false);
    }
  }

  /* ===================== NUEVO ANÁLISIS ===================== */
  function handleNewAnalysis() {
    const next = sessionCounter + 1;
    setSessionCounter(next);
    setSampleCode(fmtCode(next));

    setPhotos([]);
    setImagesDataURL([]);
    setGeo(null);
    setGlobalResults([]);
    setPerImage([]);
    setExcluded([]);
    setInterpretation(null);
    setModalOpen(false);
    setModalMineral(null);
    setModalInfo(null);
    setNearbyItems([]);
    setNearbySelected([]);
    setErrorNearby(null);
    setAutoSuggestion(null);
    setSuggestionApplied(false);

    setToast("Listo para nuevo análisis.");
  }

  /* ===================== UI ===================== */
  const canAnalyze = photos.length > 0;
  const extra = Math.max(0, photos.length - 6);
  const fmt = (v: any) => (v == null ? "—" : v);

  const groupedCommodities = React.useMemo(() => {
    const g: Record<string, CommodityConfig[]> = {};
    for (const c of COMMODITY_CONFIG) {
      if (!g[c.group]) g[c.group] = [];
      g[c.group].push(c);
    }
    return g;
  }, []);

  return (
    <main className="min-h-screen">
<header className="w-full py-3 px-5 bg-gradient-to-r from-cyan-600 to-emerald-600 text-white">
  <div className="max-w-6xl mx-auto flex items-center justify-between">
    <h1 className="text-lg font-semibold">Cámara • Ubicación • Análisis</h1>

    <div className="flex items-center gap-2">
      <button
        onClick={handleNewAnalysis}
        className="px-3 py-1 rounded bg-white/20 hover:bg-white/30"
      >
        Nuevo Análisis
      </button>

      <Link href="/" className="px-3 py-1 rounded bg-white/20 hover:bg-white/30">
        Inicio
      </Link>

      {/* ⭐ BOTÓN DE CERRAR SESIÓN */}
      <LogoutButton />
    </div>
  </div>
</header>


      <section className="max-w-6xl mx-auto px-5 py-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* IZQUIERDA */}
        <div>
          {/* Código de muestra y moneda */}
          <div className="flex flex-wrap items-end gap-4 mb-4">
            <div>
              <label className="text-sm text-gray-700">Código de muestra</label>
              <input
                value={sampleCode}
                onChange={(e) => setSampleCode(e.target.value)}
                className="mt-1 border rounded px-3 py-2"
              />
            </div>

            <div>
              <label className="text-sm text-gray-700">Moneda</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                className="mt-1 border rounded px-3 py-2"
              >
                <option value="USD">USD</option>
                <option value="PEN">PEN</option>
                <option value="EUR">EUR</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-600">Tipo de cambio (manual)</label>
              <div className="flex flex-col mt-1 text-xs gap-1">
                <div className="flex items-center gap-1">
                  <span>1 USD =</span>
                  <input
                    type="number"
                    step="0.01"
                    value={usdToPen}
                    onChange={(e) => setUsdToPen(Number(e.target.value) || 0)}
                    className="border rounded px-2 py-1 w-24"
                  />
                  <span>PEN</span>
                </div>
                <div className="flex items-center gap-1">
                  <span>1 EUR =</span>
                  <input
                    type="number"
                    step="0.01"
                    value={eurToPen}
                    onChange={(e) => setEurToPen(Number(e.target.value) || 0)}
                    className="border rounded px-2 py-1 w-24"
                  />
                  <span>PEN</span>
                </div>
              </div>
            </div>
          </div>

          {/* Recuperación Cu/Zn/Pb */}
          <div className="border rounded-lg p-3 bg-gray-50 mb-4">
            <div className="font-semibold mb-2">Recuperación y Payable (proceso Cu/Zn/Pb)</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(["Cobre", "Zinc", "Plomo"] as const).map((metal) => (
                <div key={metal} className="border rounded p-2 bg-white">
                  <div className="text-sm font-medium mb-1">{metal}</div>

                  <div className="flex items-center gap-2">
                    <label className="text-xs w-12">Rec %</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={Math.round((adj[metal]?.recovery ?? 0) * 100)}
                      onChange={(e) => setNum(metal, "recovery", e.target.value)}
                      className="border rounded px-2 py-1 w-14 text-sm"
                    />
                  </div>

                  <div className="flex items-center gap-2 mt-2">
                    <label className="text-xs w-12">Pay %</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={Math.round((adj[metal]?.payable ?? 0) * 100)}
                      onChange={(e) => setNum(metal, "payable", e.target.value)}
                      className="border rounded px-2 py-1 w-14 text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Economía (20 commodities) */}
          <div className="border rounded-lg p-3 bg-gray-50 mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">
                Economía – Precios de referencia (editable por el usuario)
              </div>

              <button
                type="button"
                onClick={() => {
                  setPrices(DEFAULT_PRICES);
                  setPayables(DEFAULT_PAYABLES);
                  setToast("Valores restaurados por defecto.");
                }}
                className="text-xs px-2 py-1 rounded bg-gray-200"
              >
                Restaurar por defecto
              </button>
            </div>

            <p className="text-xs text-gray-600 mb-2">
              Los precios están expresados en <b>USD/g</b> para Au/Ag/Pt/Pd y en <b>USD/kg</b> para
              el resto de metales. Puedes editar el <b>precio</b> y el <b>payable</b> (0–1) para
              cada commodity; estos valores se usarán en la estimación económica del PDF.
            </p>

            <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
              {Object.entries(groupedCommodities).map(([groupName, items]) => (
                <div key={groupName} className="border rounded-md bg-white">
                  <div className="px-2 py-1 border-b text-xs font-semibold bg-gray-100">
                    {groupName}
                  </div>

                  <div className="p-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {items.map((cfg) => (
                      <div key={cfg.code} className="border rounded p-2 bg-white">
                        <div className="text-xs font-medium mb-1">{cfg.label}</div>

                        <div className="flex items-center gap-2">
                          <label className="text-[11px] w-16">Precio</label>

                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step="0.01"
                              value={convertPrice(
                                prices[cfg.code],
                                currency,
                                usdToPen,
                                eurToPen
                              ).toFixed(2)}
                              onChange={(e) => {
                                const raw = Number(e.target.value || 0);
                                let priceInUSD = raw;

                                if (currency === "PEN") {
                                  priceInUSD = raw / usdToPen;
                                }

                                if (currency === "EUR") {
                                  const usdToEur = usdToPen / eurToPen;
                                  priceInUSD = raw / usdToEur;
                                }

                                setPrices((p) => ({
                                  ...p,
                                  [cfg.code]: priceInUSD,
                                }));
                              }}
                              className="border rounded px-2 py-1 w-20 text-xs"
                            />

                            <span className="text-[10px] text-gray-500 whitespace-nowrap">
                              {COMMODITY_UNITS[cfg.code]}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 mt-1">
                          <label className="text-[11px] w-16">Payable</label>
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            max={1}
                            value={payables[cfg.code]}
                            onChange={(e) => {
                              const v = Math.max(0, Math.min(1, Number(e.target.value || 0)));
                              setPayables((p) => ({ ...p, [cfg.code]: v }));
                            }}
                            className="border rounded px-2 py-1 w-28 text-xs"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-gray-500 mt-2">
              Estos valores se usarán en la estimación económica del PDF.
            </p>
          </div>

          <CameraCapture onPhotos={handlePhotos} resetSignal={sessionCounter} />

          {extra > 0 && (
            <div className="mt-3 bg-yellow-50 border border-yellow-300 px-3 py-2 text-sm">
              Solo se procesan 6 fotos. El resto será ignorado.
            </div>
          )}

          {photos.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
              {photos.map((p, i) => (
                <div key={i} className="border rounded overflow-hidden">
                  <img src={p.url} className="w-full h-28 object-cover" />
                  <div className="px-2 py-1 text-[11px] truncate">{p.file.name}</div>
                </div>
              ))}
            </div>
          )}

          <GeoCapture onChange={handleGeo} />

          {/* Fuentes + Nearby */}
          <div className="mt-3 mb-3">
            <div className="flex items-center gap-2 mb-2">
              <button
                disabled={!geo?.point || loadingNearby}
                onClick={() => {
                  if (geo?.point) fetchNearby(geo.point.lat, geo.point.lng);
                  else setToast("Primero obtén la ubicación.");
                }}
                className="px-3 py-2 bg-sky-600 text-white rounded disabled:opacity-50"
              >
                {loadingNearby ? "Buscando…" : "Buscar yacimientos cercanos"}
              </button>

              {errorNearby && (
                <div className="text-red-600 text-sm">{errorNearby}</div>
              )}
            </div>

            <GeoSourcesPanel />

            <div className="mt-3">
              <h4 className="font-medium mb-2">Resultados (yacimientos cercanos)</h4>

              {loadingNearby && <div className="text-sm">Buscando…</div>}

              {!loadingNearby && nearbyItems.length === 0 && (
                <div className="text-sm text-gray-500">
                  No se detectaron concesiones, yacimientos o fallas cercanas en las fuentes oficiales consultadas.
                </div>
              )}

              {nearbyItems.length > 0 && (
                <ul className="space-y-2">
                  {nearbyItems.map((it) => {
                    const meta = getGeoMeta(it);
                    return (
                      <li
                        key={it.id}
                        className="border rounded p-2 flex items-center justify-between"
                      >
                        <div>
                          <div className="font-medium text-sm">
                            {it.name || "Sin nombre"}
                          </div>

                          <div className="text-xs text-emerald-700">
                            {meta.type}
                            {meta.subtype && ` – ${meta.subtype}`}
                            {meta.commodityText && ` • ${meta.commodityText}`}
                          </div>

                          <div className="text-xs text-gray-500">
                            {it.latitude?.toFixed(5)}, {it.longitude?.toFixed(5)}
                            {meta.distanceKm != null && (
                              <> • {meta.distanceKm.toFixed(2)} km</>
                            )}
                          </div>

                          <div className="text-[11px] text-gray-500">
                            {(it as any).source ||
                              (it as any).source_name ||
                              (it as any).source_url}
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => toggleNearbySelect(it)}
                            className="px-2 py-1 bg-sky-50 text-sky-700 text-xs rounded"
                          >
                            {nearbySelected.find((s) => s.id === it.id)
                              ? "Remover"
                              : "Incluir"}
                          </button>

                          {(it as any).source_url && (
                            <a
                              href={(it as any).source_url}
                              target="_blank"
                              className="px-2 py-1 bg-gray-200 rounded text-xs"
                            >
                              Fuente
                            </a>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

            </div>
          </div>

          {/* Botones */}
          <div className="flex gap-3 mt-3">
            <button
              onClick={handleAnalyze}
              disabled={!canAnalyze || busyAnalyze}
              className="px-4 py-2 bg-indigo-600 text-white rounded disabled:opacity-50"
            >
              {busyAnalyze ? "Analizando…" : "Analizar"}
            </button>

            <button
              onClick={handleExportGeneralPdf}
              disabled={!globalResults.length || busyGeneralPdf}
              className="px-4 py-2 bg-emerald-600 text-white rounded disabled:opacity-50"
            >
              {busyGeneralPdf ? "Generando PDF…" : "PDF general"}
            </button>
          </div>
        </div>

        {/* DERECHA */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Resultados</h3>

          {!globalResults.length && (
            <p className="text-sm text-gray-500">Pendiente de análisis</p>
          )}

          {!!globalResults.length && (
            <>
              {/* Global */}
              <div className="border rounded-xl p-3 mb-4">
                <h4 className="font-semibold mb-2">Mezcla global</h4>
                <table className="w-full text-sm">
                  <tbody>
                    {globalResults.map((r, i) => (
                      <tr key={i} className="border-b">
                        <td className="px-3 py-2">{r.name}</td>
                        <td className="px-3 py-2 text-right">
                          {r.pct.toFixed(1)}%
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => openMineral(r)}
                            className="px-2 py-1 bg-blue-600 text-white text-xs rounded"
                          >
                            Ficha
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Por imagen */}
              <div className="border rounded-xl p-3 mb-4">
                <h4 className="font-semibold mb-2">Por imagen</h4>

                {perImage.map((img, idx) => (
                  <div key={idx} className="mb-2">
                    <div className="font-medium text-sm mb-1">
                      {img.fileName}
                    </div>
                    <ul className="text-sm">
                      {img.results.map((r, i) => (
                        <li key={i} className="flex justify-between">
                          <span>{r.name}</span>
                          <span>{r.pct.toFixed(1)}%</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              {/* Interpretación */}
              {interpretation && (
                <div className="border rounded-xl p-3 bg-sky-50 mb-4">
                  <b>Interpretación preliminar</b>
                  <p className="text-sm mt-1">
                    <b>Geología:</b> {fmt(interpretation.geology)}
                  </p>
                  <p className="text-sm mt-1">
                    <b>Economía:</b> {fmt(interpretation.economics)}
                  </p>
                  <p className="text-sm mt-1">
                    <b>Advertencias:</b> {fmt(interpretation.caveats)}
                  </p>
                </div>
              )}

              {/* Sugerencias automáticas */}
              {autoSuggestion && (
                <div className="border rounded-xl p-3 bg-emerald-50 mb-4">
                  <div className="font-semibold mb-2 text-emerald-800">
                    Sugerencias automáticas disponibles
                  </div>

                  <p className="text-sm text-gray-700">
                    Basado en minerales detectados y la zona.
                  </p>

                  <div className="text-sm mt-2">
                    <b>País:</b>{" "}
                    {autoSuggestion.country === "PE" ? "Perú" : "Global"} <br />
                    <b>Metales detectados:</b>{" "}
                    {autoSuggestion.commodities?.length
                      ? autoSuggestion.commodities.join(", ")
                      : "Ninguno"}
                  </div>

                  {!suggestionApplied ? (
                    <button
                      onClick={applyAutoSuggestion}
                      className="mt-3 px-3 py-2 bg-emerald-600 text-white rounded text-sm"
                    >
                      Aplicar sugerencias
                    </button>
                  ) : (
                    <div className="text-sm text-emerald-700 mt-2">
                      ✔ Sugerencias aplicadas
                    </div>
                  )}
                </div>
              )}

              {/* Excluidas */}
              {excluded.length > 0 && (
                <div className="border rounded-xl p-3 bg-yellow-50 text-yellow-900">
                  <b>Imágenes excluidas</b>
                  <ul className="text-sm mt-2 ml-4 list-disc">
                    {excluded.map((e, i) => (
                      <li key={i}>
                        {e.fileName} — {e.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Nearby seleccionados */}
              {nearbySelected.length > 0 && (
                <div className="border rounded-xl p-3 bg-white mt-4">
                  <div className="font-semibold mb-2">
                    Yacimientos incluidos ({nearbySelected.length})
                  </div>

                  <ul className="text-sm space-y-2">
                    {nearbySelected.map((s) => {
                      const anyS = s as any;
                      const meta = getGeoMeta(s);

                      return (
                        <li
                          key={s.id}
                          className="flex items-center justify-between"
                        >
                          <div>
                            <div className="font-medium">
                              {s.name || "Sin nombre"}
                            </div>

                            <div className="text-xs text-emerald-700">
                              {meta.type}
                              {meta.subtype && ` – ${meta.subtype}`}
                              {meta.commodityText && ` • ${meta.commodityText}`}
                            </div>

                            <div className="text-xs text-gray-500">
                              {s.latitude?.toFixed(5)}, {s.longitude?.toFixed(5)}
                              {meta.distanceKm != null && (
                                <> • {meta.distanceKm.toFixed(2)} km</>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {anyS.source_url && (
                              <a
                                href={anyS.source_url}
                                target="_blank"
                                className="text-xs underline text-blue-600"
                              >
                                Fuente
                              </a>
                            )}

                            <button
                              onClick={() => toggleNearbySelect(s)}
                              className="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300"
                            >
                              Quitar
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

            </>
          )}
        </div>
      </section>

      {/* Modal Ficha */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
            <div className="flex justify-between border-b px-4 py-2">
              <h4 className="font-semibold">
                {modalInfo?.nombre || modalMineral?.name}
              </h4>

              <button
                onClick={() => setModalOpen(false)}
                className="px-2 py-1 bg-gray-200 rounded"
              >
                Cerrar
              </button>
            </div>

            <div className="p-4 text-sm">
              {loadingInfo ? (
                "Cargando..."
              ) : modalMineral ? (
                <>
                  <p>
                    <b>% en muestra:</b> {modalMineral.pct.toFixed(2)}%
                  </p>

                  {modalInfo && (
                    <div className="mt-3 space-y-1 text-xs">
                      {modalInfo.formula && (
                        <div>
                          <b>Fórmula:</b> {modalInfo.formula}
                        </div>
                      )}
                      {modalInfo.sistema && (
                        <div>
                          <b>Sistema cristalino:</b> {modalInfo.sistema}
                        </div>
                      )}
                      {modalInfo.mohs && (
                        <div>
                          <b>Dureza (Mohs):</b> {modalInfo.mohs}
                        </div>
                      )}
                      {modalInfo.densidad && (
                        <div>
                          <b>Densidad:</b> {modalInfo.densidad}
                        </div>
                      )}
                      {modalInfo.habito && (
                        <div>
                          <b>Hábito:</b> {modalInfo.habito}
                        </div>
                      )}
                      {modalInfo.ocurrencia && (
                        <div>
                          <b>Ocurrencia típica:</b> {modalInfo.ocurrencia}
                        </div>
                      )}
                      {modalInfo.notas && (
                        <div>
                          <b>Notas:</b> {modalInfo.notas}
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    onClick={exportMineralPdf}
                    className="mt-3 bg-emerald-600 text-white px-3 py-2 rounded text-sm"
                    disabled={busyMineralPdf}
                  >
                    PDF Mineral
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed right-4 bottom-6 z-50 bg-black/85 text-white px-4 py-2 rounded shadow">
          {toast}
        </div>
      )}
    </main>
  );
}
