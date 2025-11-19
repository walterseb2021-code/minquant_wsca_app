"use client";

import React from "react";
import Link from "next/link";
import CameraCapture, { type CapturedPhoto } from "../../components/CameraCapture";
import GeoCapture, { type GeoResult } from "../../components/GeoCapture";
import GeoSourcesPanel from "@/components/GeoSourcesPanel"; // Panel de fuentes geoespaciales (ruta absoluta)
import type { GeoSourceItem } from "../../lib/geo/types";

import {
  buildMineralPdf,
  downloadPdf,
  type MineralResult,
  type CurrencyCode,
  type CommodityAdjustments,
} from "../../lib/pdf";

import { buildReportPdfPlus } from "../../lib/pdf_plus"; // PDF general con sección económica e interpretación
import { suggestFromMinerals } from "../../lib/minerals";

/* ===================== Helpers de archivos/imagenes ===================== */
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
  const dstW = Math.max(1, Math.round(width * scale));
  const dstH = Math.max(1, Math.round(height * scale));

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

// Mapa sencillo para la ficha individual (por nombre de mineral)
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

/* ======== Configuración de 20 commodities (económico) ======== */

type CommodityCode =
  | "Au"
  | "Ag"
  | "Pt"
  | "Pd"
  | "Cu"
  | "Zn"
  | "Pb"
  | "Sn"
  | "Ni"
  | "Mo"
  | "Sb"
  | "Co"
  | "V"
  | "Ti"
  | "W"
  | "Li"
  | "Fe"
  | "Al"
  | "Mn"
  | "REE";

type CommodityConfig = {
  code: CommodityCode;
  label: string;
  group: "Metales preciosos" | "Metales base" | "Críticos / Menores" | "Industriales / Energéticos" | "Tierras raras";
};

const COMMODITY_CONFIG: CommodityConfig[] = [
  // Metales preciosos
  { code: "Au", label: "Oro (Au)", group: "Metales preciosos" },
  { code: "Ag", label: "Plata (Ag)", group: "Metales preciosos" },
  { code: "Pt", label: "Platino (Pt)", group: "Metales preciosos" },
  { code: "Pd", label: "Paladio (Pd)", group: "Metales preciosos" },

  // Metales base
  { code: "Cu", label: "Cobre (Cu)", group: "Metales base" },
  { code: "Zn", label: "Zinc (Zn)", group: "Metales base" },
  { code: "Pb", label: "Plomo (Pb)", group: "Metales base" },
  { code: "Sn", label: "Estaño (Sn)", group: "Metales base" },
  { code: "Ni", label: "Níquel (Ni)", group: "Metales base" },
  { code: "Mo", label: "Molibdeno (Mo)", group: "Metales base" },

  // Críticos / menores
  { code: "Sb", label: "Antimonio (Sb)", group: "Críticos / Menores" },
  { code: "Co", label: "Cobalto (Co)", group: "Críticos / Menores" },
  { code: "V", label: "Vanadio (V)", group: "Críticos / Menores" },
  { code: "Ti", label: "Titanio (Ti)", group: "Críticos / Menores" },
  { code: "W", label: "Tungsteno (W)", group: "Críticos / Menores" },

  // Industriales / energéticos
  { code: "Li", label: "Litio (Li)", group: "Industriales / Energéticos" },
  { code: "Fe", label: "Hierro (Fe)", group: "Industriales / Energéticos" },
  { code: "Al", label: "Bauxita / Aluminio (Al)", group: "Industriales / Energéticos" },
  { code: "Mn", label: "Manganeso (Mn)", group: "Industriales / Energéticos" },

  // Tierras raras
  { code: "REE", label: "Tierras raras (REE)", group: "Tierras raras" },
];

// Valores por defecto (estimaciones referenciales, el usuario puede cambiarlos)
const DEFAULT_PRICES: Record<CommodityCode, number> = {
  Au: 75.0, // p.ej. USD/gramo equivalente (referencial)
  Ag: 0.9,
  Pt: 35.0,
  Pd: 45.0,

  Cu: 9.0,
  Zn: 2.7,
  Pb: 2.1,
  Sn: 28.0,
  Ni: 18.0,
  Mo: 20.0,

  Sb: 10.0,
  Co: 40.0,
  V: 15.0,
  Ti: 5.0,
  W: 32.0,

  Li: 25.0,
  Fe: 0.15,
  Al: 2.0,
  Mn: 3.0,

  REE: 60.0,
};

const DEFAULT_PAYABLES: Record<CommodityCode, number> = {
  // Metales preciosos
  Au: 0.92,
  Ag: 0.9,
  Pt: 0.9,
  Pd: 0.9,

  // Metales base
  Cu: 0.96,
  Zn: 0.85,
  Pb: 0.9,
  Sn: 0.95,
  Ni: 0.95,
  Mo: 0.97,

  // Críticos / menores
  Sb: 0.9,
  Co: 0.9,
  V: 0.88,
  Ti: 0.85,
  W: 0.95,

  // Industriales / energéticos
  Li: 0.85,
  Fe: 0.98,
  Al: 0.9,
  Mn: 0.9,

  // Tierras raras
  REE: 0.9,
};

/* ===================== Interpretación en cliente (fallback) ===================== */
type Interpretation = { geology: string; economics: string; caveats: string };

function buildInterpretationClient(results: MineralResult[]): Interpretation {
  if (!Array.isArray(results) || results.length === 0) {
    return {
      geology: "—",
      economics: "—",
      caveats:
        "• Estimación preliminar • Confirmar con laboratorio (Au/Ag por fuego/AA; Cu/Pb/Zn por ICP/AA).",
    };
  }

  const names = results.map((r) => r.name.toLowerCase());
  const has = (s: string) => names.some((n) => n.includes(s));

  const gossan = has("limonita") || has("goethita");
  const cuarzo = has("cuarzo");
  const cu_sec = has("malaquita") || has("azurita");
  const cu_sulf = has("calcopirita") || has("bornita") || has("calcocita") || has("calcosina");
  const pirita = has("pirita");
  const pbzn = has("galena") || has("esfalerita");

  const geo: string[] = [];
  if (cu_sec) geo.push("Cobre en zona oxidada (malaquita/azurita) sobre fracturas");
  if (cu_sulf) geo.push("Sulfuros de cobre (p. ej., calcopirita) en matriz");
  if (gossan) geo.push("Gossan/óxidos de Fe (limonita/goethita) por meteorización");
  if (cuarzo) geo.push("Vetas/venillas de cuarzo como hospedante");
  if (pirita) geo.push("Pirita abundante; posible Au 'invisible' en sulfuros");
  if (pbzn) geo.push("Firma polimetálica (Pb-Zn) acompañante");
  if (!geo.length) geo.push("Asociación compatible con ambiente hidrotermal");

  const eco: string[] = [];
  if (cu_sec || cu_sulf) eco.push("Potencial Cu (especies de cobre presentes)");
  if ((pirita || cu_sulf) && cuarzo)
    eco.push("Posible Au/Ag asociado a sulfuros en vetas de cuarzo (no visible a simple vista)");
  if (pbzn) eco.push("Pb/Zn accesorios podrían adicionar valor");
  if (!eco.length) eco.push("Sin indicadores claros de metales de alto valor en superficie");

  const adv = [
    "Estimación visual/IA preliminar",
    "Validar con ensayo químico (Au/Ag fuego/AA; Cu/Pb/Zn ICP/AA)",
    "Evitar decisiones económicas sin verificación",
  ];

  return {
    geology: "• " + geo.join(" • "),
    economics: "• " + eco.join(" • "),
    caveats: "• " + adv.join(" • "),
  };
}

/* ===================== Componente principal ===================== */
export default function AnalisisPage() {
  // Capturas y ubicación
  const [photos, setPhotos] = React.useState<CapturedPhoto[]>([]);
  const [imagesDataURL, setImagesDataURL] = React.useState<string[]>([]);
  const [geo, setGeo] = React.useState<GeoResult | null>(null);

  // Contador de sesión para códigos: aumenta cada "Nuevo análisis"
  const [sessionCounter, setSessionCounter] = React.useState<number>(1);
  const fmtCode = (n: number) => `MQ-${String(n).padStart(4, "0")}`;

  // Parámetros
  const [sampleCode, setSampleCode] = React.useState<string>(fmtCode(1));
  const [currency, setCurrency] = React.useState<CurrencyCode>("USD");

  // Ajustes de recuperaciones/payables por proceso (de momento Cu/Zn/Pb; luego podemos extender)
  const [adj, setAdj] = React.useState<CommodityAdjustments>({
    Cobre: { recovery: 0.88, payable: 0.96 },
    Zinc: { recovery: 0.85, payable: 0.85 },
    Plomo: { recovery: 0.9, payable: 0.9 },
  });

  // Precios y payables por commodity (para PDF económico) — ahora 20 commodities
  const [prices, setPrices] = React.useState<Record<CommodityCode, number>>(DEFAULT_PRICES);
  const [payables, setPayables] = React.useState<Record<CommodityCode, number>>(DEFAULT_PAYABLES);

  // ======= PERSISTENCIA EN LOCALSTORAGE (solo preferencias) =======
  React.useEffect(() => {
    try {
      const c = localStorage.getItem("mq_currency");
      const p = localStorage.getItem("mq_prices");
      const pa = localStorage.getItem("mq_payables");
      const adjStr = localStorage.getItem("mq_process_adj");

      if (c) setCurrency(c as any);

      if (p) {
        const parsed = JSON.parse(p) as Partial<Record<CommodityCode, number>>;
        setPrices((prev) => ({ ...prev, ...parsed }));
      }

      if (pa) {
        const parsed = JSON.parse(pa) as Partial<Record<CommodityCode, number>>;
        setPayables((prev) => ({ ...prev, ...parsed }));
      }

      if (adjStr) {
        // Se mantiene la estructura anterior, pero el usuario puede editarla en la UI de procesos
        setAdj((prev) => ({ ...prev, ...JSON.parse(adjStr) }));
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    try {
      localStorage.setItem("mq_currency", String(currency));
    } catch {}
  }, [currency]);

  React.useEffect(() => {
    try {
      localStorage.setItem("mq_prices", JSON.stringify(prices));
    } catch {}
  }, [prices]);

  React.useEffect(() => {
    try {
      localStorage.setItem("mq_payables", JSON.stringify(payables));
    } catch {}
  }, [payables]);

  React.useEffect(() => {
    try {
      localStorage.setItem("mq_process_adj", JSON.stringify(adj));
    } catch {}
  }, [adj]);
  // ======= FIN PERSISTENCIA =======

  // Resultados
  const [globalResults, setGlobalResults] = React.useState<MineralResult[]>([]);
  const [perImage, setPerImage] = React.useState<{ fileName: string; results: MineralResult[] }[]>([]);
  const [excluded, setExcluded] = React.useState<{ fileName: string; reason: string }[]>([]);
  const [interpretation, setInterpretation] = React.useState<Interpretation | null>(null);
// Sugerencias automáticas (PASO 3.2)
const [autoSuggestion, setAutoSuggestion] = React.useState<any>(null);

  // Estados UI
  const [busyAnalyze, setBusyAnalyze] = React.useState(false);
  const [busyGeneralPdf, setBusyGeneralPdf] = React.useState(false);
  const [busyMineralPdf, setBusyMineralPdf] = React.useState(false);

  // Modal ficha
  const [modalOpen, setModalOpen] = React.useState(false);
  const [modalMineral, setModalMineral] = React.useState<MineralResult | null>(null);
  const [modalInfo, setModalInfo] = React.useState<MineralInfoWeb | null>(null);
  const [loadingInfo, setLoadingInfo] = React.useState(false);

  // Nearby (yacimientos)
  const [nearbyItems, setNearbyItems] = React.useState<GeoSourceItem[]>([]);
  const [nearbySelected, setNearbySelected] = React.useState<GeoSourceItem[]>([]);
  const [loadingNearby, setLoadingNearby] = React.useState(false);
  const [errorNearby, setErrorNearby] = React.useState<string | null>(null);

  // Toast simple
  const [toast, setToast] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(t);
  }, [toast]);

  // Handlers de UI (proceso Cu/Zn/Pb)
  const setNum = (metal: "Cobre" | "Zinc" | "Plomo", field: "recovery" | "payable", val: string) => {
    const pct = Math.max(0, Math.min(100, Number(val)));
    setAdj((prev) => ({
      ...prev,
      [metal]: { ...prev[metal], [field]: isFinite(pct) ? pct / 100 : prev[metal][field] },
    }));
  };

  const handlePhotos = React.useCallback(async (arr: CapturedPhoto[]) => {
    setPhotos(arr);
    const dataurls = await Promise.all(arr.map((p) => fileToDataURL(p.file)));
    setImagesDataURL(dataurls);
  }, []);

  const handleGeo = React.useCallback((g: GeoResult) => setGeo(g), []);

  /* ===================== Analizar (llama /api/analyze) ===================== */
  async function handleAnalyze() {
    if (!photos.length) {
      setToast("Primero toma o sube al menos una foto.");
      return;
    }
    setBusyAnalyze(true);

    try {
      const form = new FormData();
      const MAX = 6;
      const subset = photos.slice(0, MAX);

      for (const p of subset) {
        const blob = await resizeImageFile(p.file, 1280, 0.7);
        const name = (p.file.name || "foto.jpg")
          .replace(/\.(png|jpg|jpeg|webp)$/i, "")
          .concat("_cmp.jpg");
        form.append("images", new File([blob], name, { type: "image/jpeg" }));
      }

      const r = await fetch("/api/analyze", { method: "POST", body: form });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Error analizando");

      const perFromApi = (j.perImage ?? []) as { fileName: string; results: MineralResult[] }[];
      setPerImage(perFromApi);
      setExcluded(Array.isArray(j?.excluded) ? j.excluded : []);

      const results = (j.global ?? []) as MineralResult[];
      setGlobalResults(results);

      const inter: Interpretation | null = j?.interpretation ?? buildInterpretationClient(results);
      setInterpretation(inter);
      // PASO 3.2 — generar sugerencias automáticas
try {
  const countryCode =
    geo?.countryCode ||
    geo?.country ||
    geo?.point?.country ||
    null;

  const sug = suggestFromMinerals(results, countryCode || undefined);
  setAutoSuggestion(sug);
} catch (err) {
  console.warn("No se pudieron generar sugerencias automáticas:", err);
}

    } catch (e: any) {
      console.error("[Analyze] Error:", e);
      setToast(e?.message || "Error analizando");
    } finally {
      setBusyAnalyze(false);
    }
  }

  /* ===================== Buscar yacimientos cercanos ===================== */
  async function fetchNearby(lat: number, lon: number) {
    try {
      setLoadingNearby(true);
      setErrorNearby(null);
      setNearbyItems([]);

      const ctxResp = await fetch(
        `/api/geocontext?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lon)}`
      );
      const ctxJson = await ctxResp.json();

      const countryName =
        ctxJson?.country ||
        ctxJson?.name ||
        (ctxJson?.code === "PE" ? "Perú" : ctxJson?.code) ||
        "Global";

      const srcResp = await fetch(`/api/geosources?country=${encodeURIComponent(countryName)}`);
      const srcJson = await srcResp.json();
      if (!srcResp.ok) {
        setErrorNearby(srcJson?.error || "Error obteniendo fuentes");
        setToast("Error al obtener fuentes geoespaciales.");
        setLoadingNearby(false);
        return;
      }

      const sources = Array.isArray(srcJson.sources) ? srcJson.sources : [];
      if (!sources.length) {
        setToast("No hay fuentes configuradas para este país (usar fallback global).");
      } else {
        setToast(`Fuentes encontradas: ${sources.map((s: any) => s.name).slice(0, 3).join(", ")}`);
      }

      const items = Array.isArray(srcJson.items) ? (srcJson.items as GeoSourceItem[]) : [];
      setNearbyItems(items);

      if (!items.length) {
        setToast(
          "No se encontraron yacimientos automáticamente. Revisa las fuentes en el panel para investigar."
        );
      }
    } catch (err: any) {
      console.error("[Nearby] Error:", err);
      setErrorNearby(err?.message || "Error de red");
      setNearbyItems([]);
      setToast("Error de red buscando yacimientos.");
    } finally {
      setLoadingNearby(false);
    }
  }

  function toggleNearbySelect(item: GeoSourceItem) {
    setNearbySelected((prev) => {
      const exists = prev.find((p) => p.id === item.id);
      if (exists) return prev.filter((p) => p.id !== item.id);
      return [...prev, item];
    });
  }

  /* ===================== PDF general ===================== */
  async function handleExportGeneralPdf() {
    if (!globalResults.length) {
      setToast("Primero realiza el análisis.");
      return;
    }
    setBusyGeneralPdf(true);

    try {
      const safeAdj = {
        Cobre: { recovery: adj?.Cobre?.recovery ?? 0.85, payable: adj?.Cobre?.payable ?? 0.96 },
        Zinc: { recovery: adj?.Zinc?.recovery ?? 0.85, payable: adj?.Zinc?.payable ?? 0.96 },
        Plomo: { recovery: adj?.Plomo?.recovery ?? 0.9, payable: adj?.Plomo?.payable ?? 0.9 },
      };

      const econCurrency = (currency === "PEN" ? "PEN" : "USD") as "USD" | "PEN";
      const econOverrides = {
        currency: econCurrency,
        prices: { ...prices },
        payables: { ...payables },
      };

      const byImage = perImage.map((p) => ({
        filename: p.fileName,
        minerals: p.results,
        excluded: null,
      }));

      const opts = {
        title: `Reporte ${sampleCode}`,
        note: "Advertencia: Informe preliminar, referencial; requiere validación con ensayo químico.",
        lat: geo?.point?.lat,
        lng: geo?.point?.lng,
        dateISO: new Date().toISOString(),
        econ: econOverrides,
        nearbySources: nearbySelected || [],
        processAdj: safeAdj,
        images: imagesDataURL,
      };

      const doc = await (buildReportPdfPlus as any)({
        mixGlobal: globalResults,
        byImage,
        opts,
      } as any);
      const buffer = doc.output("arraybuffer");
      downloadPdf(new Uint8Array(buffer), `Reporte_${sampleCode}.pdf`);
    } catch (e: any) {
      console.error("[PDF] Error:", e);
      setToast("Error al generar el PDF.");
    } finally {
      setBusyGeneralPdf(false);
    }
  }

  /* ===================== Ficha individual ===================== */
  async function openMineral(m: MineralResult) {
    setModalMineral(m);
    setModalOpen(true);
    setLoadingInfo(true);
    setModalInfo(null);

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
      const price = PRICE_MAP_USD[name] ?? 0;
      const bytes = await buildMineralPdf({
        mineralName: modalInfo?.nombre || name,
        price,
        samplePct: pct,
        currency,
        notes: modalInfo?.notas || undefined,
        infoOverride: modalInfo || undefined,
      });
      downloadPdf(bytes, `Ficha_${name}.pdf`);
    } catch {
      setToast("Error al generar el PDF del mineral.");
    } finally {
      setBusyMineralPdf(false);
    }
  }

  /* ===================== NUEVO: limpiar y preparar nuevo análisis ===================== */
  function handleNewAnalysis() {
    const next = sessionCounter + 1;
    setSessionCounter(next);
    const newCode = fmtCode(next);
    setSampleCode(newCode);

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

    setToast("Listo: preparado para nuevo análisis.");
  }

  /* ===================== Render ===================== */
  const canAnalyze = photos.length > 0;
  const extra = Math.max(0, photos.length - 6);
  const fmt = (v: any) => (v == null ? "—" : v);

  // Agrupamos commodities por grupo para la UI
  const groupedCommodities = React.useMemo(() => {
    const groups: Record<string, CommodityConfig[]> = {};
    for (const c of COMMODITY_CONFIG) {
      if (!groups[c.group]) groups[c.group] = [];
      groups[c.group].push(c);
    }
    return groups;
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
          </div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-5 py-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* IZQUIERDA */}
        <div>
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
          </div>

          {/* Recuperación/Payable por proceso */}
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
                      step={1}
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
                      step={1}
                      value={Math.round((adj[metal]?.payable ?? 0) * 100)}
                      onChange={(e) => setNum(metal, "payable", e.target.value)}
                      className="border rounded px-2 py-1 w-14 text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Precios y Payables por commodity (20 commodities) */}
          <div className="border rounded-lg p-3 bg-gray-50 mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">Economía: Precios y Payables por commodity</div>
              <button
                type="button"
                onClick={() => {
                  setPrices(DEFAULT_PRICES);
                  setPayables(DEFAULT_PAYABLES);
                  setToast("Valores económicos restaurados por defecto.");
                }}
                className="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300"
              >
                Restaurar por defecto
              </button>
            </div>
            <p className="text-xs text-gray-600 mb-2">
              Edita el <b>precio</b> (unidad referencial que se mostrará en el PDF) y el <b>payable</b> (0–1)
              para cada commodity. Estos coeficientes se usarán en la estimación económica del PDF general.
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
                          <input
                            type="number"
                            step="0.01"
                            className="border rounded px-2 py-1 w-28 text-xs"
                            value={String(prices[cfg.code])}
                            onChange={(e) =>
                              setPrices((p) => ({
                                ...p,
                                [cfg.code]: Number(e.target.value || 0),
                              }))
                            }
                            placeholder="Precio"
                            title={`Precio para ${cfg.label}`}
                          />
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <label className="text-[11px] w-16">Payable</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="1"
                            className="border rounded px-2 py-1 w-28 text-xs"
                            value={String(payables[cfg.code])}
                            onChange={(e) => {
                              const v = Math.max(0, Math.min(1, Number(e.target.value || 0)));
                              setPayables((p) => ({ ...p, [cfg.code]: v }));
                            }}
                            placeholder="0–1"
                            title={`Payable para ${cfg.label}`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-gray-500 mt-2">
              Nota: Más adelante estos valores podrán ajustarse automáticamente según el tipo de mineral
              detectado y la zona (planta / país). Siempre podrás modificarlos manualmente.
            </p>
          </div>

          <CameraCapture onPhotos={handlePhotos} resetSignal={sessionCounter} />

          {extra > 0 && (
            <div className="mt-3 rounded bg-yellow-50 border border-yellow-300 px-3 py-2 text-sm text-yellow-800">
              Solo se procesarán 6 fotos. El resto será ignorado.
            </div>
          )}

          {photos.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
              {photos.map((p, i) => (
                <div key={i} className="border rounded overflow-hidden">
                  <img src={p.url} className="w-full h-28 object-cover" alt={p.file.name} />
                  <div className="px-2 py-1 text-[11px] truncate">{p.file.name}</div>
                </div>
              ))}
            </div>
          )}

          <GeoCapture onChange={handleGeo} />

          {/* Panel de fuentes geoespaciales + botón para buscar nearby */}
          <div className="mt-3 mb-3">
            <div className="flex items-center gap-2 mb-2">
              <button
                disabled={!geo?.point || loadingNearby}
                onClick={() => {
                  if (geo?.point) fetchNearby(geo.point.lat, geo.point.lng);
                  else setToast("Primero obtén la ubicación (activar GPS / seleccionar punto).");
                }}
                className="px-3 py-2 rounded bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {loadingNearby ? "Buscando yacimientos…" : "Buscar yacimientos cercanos"}
              </button>
              {errorNearby && <div className="text-red-600 text-sm">{errorNearby}</div>}
            </div>

            <GeoSourcesPanel />

            <div className="mt-3">
              <h4 className="font-medium mb-2">Resultados (yacimientos cercanos)</h4>
              {loadingNearby && <div className="text-sm text-gray-600">Buscando...</div>}
              {!loadingNearby && nearbyItems.length === 0 && (
                <div className="text-sm text-gray-500">No hay yacimientos devueltos automáticamente.</div>
              )}
              {nearbyItems.length > 0 && (
                <ul className="space-y-2">
                  {nearbyItems.map((it) => (
                    <li key={it.id} className="border rounded p-2 flex items-center justify-between">
                      <div>
                        <div className="font-medium text-sm">{it.name || "Sin nombre"}</div>
                        <div className="text-xs text-gray-500">
                          {it.latitude?.toFixed(5)}, {it.longitude?.toFixed(5)}
                        </div>
                        <div className="text-xs text-gray-500">{it.source_name || it.source_url}</div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => toggleNearbySelect(it)}
                          className="px-2 py-1 rounded bg-sky-50 text-sky-700 text-xs"
                        >
                          {nearbySelected.find((s) => s.id === it.id) ? "Remover" : "Incluir"}
                        </button>
                        <a
                          href={it.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2 py-1 bg-gray-200 rounded text-xs"
                        >
                          Fuente
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="flex gap-3 mt-3">
            <button
              onClick={handleAnalyze}
              disabled={!canAnalyze || busyAnalyze}
              className="px-4 py-2 bg-indigo-600 text-white rounded disabled:opacity-50"
            >
              {busyAnalyze ? "Analizando..." : "Analizar"}
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

          {!globalResults.length && <p className="text-sm text-gray-500">Pendiente de análisis</p>}

          {globalResults.length > 0 && (
            <>
              {/* Global */}
              <div className="border rounded-xl p-3 mb-4">
                <h4 className="font-semibold mb-2">Mezcla global</h4>
                <table className="w-full text-sm">
                  <tbody>
                    {globalResults.map((r, i) => (
                      <tr key={i} className="border-b">
                        <td className="px-3 py-2">{r.name}</td>
                        <td className="px-3 py-2 text-right">{r.pct.toFixed(1)}%</td>
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
                    <div className="font-medium text-sm mb-1">{img.fileName}</div>
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

              {/* Interpretación preliminar */}
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

              {/* Seleccionados (yacimientos incluidos) */}
              {nearbySelected.length > 0 && (
                <div className="border rounded-xl p-3 bg-white mt-4">
                  <div className="font-semibold mb-2">
                    Yacimientos incluidos ({nearbySelected.length})
                  </div>
                  <ul className="text-sm space-y-2">
                    {nearbySelected.map((s) => (
                      <li key={s.id} className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{s.name || "Sin nombre"}</div>
                          <div className="text-xs text-gray-500">
                            {s.latitude?.toFixed(5)}, {s.longitude?.toFixed(5)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <a
                            href={s.source_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs underline text-blue-600"
                          >
                            Fuente
                          </a>
                          <button
                            onClick={() => toggleNearbySelect(s)}
                            className="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300"
                          >
                            Quitar
                          </button>
                        </div>
                      </li>
                    ))}
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
              <h4 className="font-semibold">{modalInfo?.nombre || modalMineral?.name}</h4>
              <button onClick={() => setModalOpen(false)} className="px-2 py-1 bg-gray-200 rounded">
                Cerrar
              </button>
            </div>
            <div className="p-4 text-sm">
              {loadingInfo
                ? "Cargando..."
                : modalMineral && (
                    <>
                      <p>
                        <b>% en muestra:</b> {modalMineral.pct.toFixed(2)}%
                      </p>
                      <button
                        onClick={exportMineralPdf}
                        className="mt-3 bg-emerald-600 text-white px-3 py-2 rounded text-sm"
                        disabled={busyMineralPdf}
                      >
                        PDF Mineral
                      </button>
                    </>
                  )}
            </div>
          </div>
        </div>
      )}

      {/* Toast simple */}
      {toast && (
        <div className="fixed right-4 bottom-6 z-50 bg-black/85 text-white px-4 py-2 rounded shadow">
          {toast}
        </div>
      )}
    </main>
  );
}
