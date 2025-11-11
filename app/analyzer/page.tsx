"use client";

import React from "react";
import Link from "next/link";
import CameraCapture, { type CapturedPhoto } from "../../components/CameraCapture";
import GeoCapture, { type GeoResult } from "../../components/GeoCapture";
import GeoSourcesPanel from "../../components/GeoSourcesPanel";
import type { GeoSourceItem } from "../../lib/Geo/Types";
// IMPORTS: ahora usamos buildReportPdfPlus (contiene la tabla nearby)
import { buildReportPdfPlus } from "../../lib/pdf_plus";
import {
  buildMineralPdf,
  downloadPdf,
  type MineralResult,
  type CurrencyCode,
} from "../../lib/pdf";

/* ==================== Helpers ==================== */

/** Convierte File -> dataURL para insertar fotos en el PDF general */
async function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

/** Normaliza nombre de minerales: quita acentos, unifica sinónimos */
function normalizeMineralName(name: string): string {
  if (!name) return "";
  // Quitar acentos
  const s = name.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const low = s.trim().toLowerCase();

  // Mapa de sinónimos / normalizaciones comunes (añade según tus datos)
  const map: Record<string, string> = {
    "azurite": "Azurita",
    "azurita": "Azurita",
    "malachite": "Malaquita",
    "malaquita": "Malaquita",
    "cuarzo": "Cuarzo",
    "calcita": "Calcita",
    "pirita": "Pirita",
    "malachite oxide": "Malaquita",
    // agrega más normalizaciones que necesites
  };

  if (map[low]) return map[low];

  // Capitaliza la primera letra por defecto
  return low.replace(/^\w/, (c) => c.toUpperCase());
}

/** Promedia resultados por mineral a partir de perImage devuelto por /api/analyze
 *  Versión mejorada: normaliza nombres para evitar duplicados por idioma/acentos
 */
function computeGlobalAverage(
  perImage: { fileName: string; results: MineralResult[] }[]
): MineralResult[] {
  const acc = new Map<string, number>();
  const count = new Map<string, number>();

  for (const img of perImage) {
    for (const r of img.results) {
      const normName = normalizeMineralName(r.name || "");
      acc.set(normName, (acc.get(normName) || 0) + (r.pct || 0));
      count.set(normName, (count.get(normName) || 0) + 1);
    }
  }

  // promedio simple (promedia % sobre # de imágenes donde aparece)
  const out: MineralResult[] = [];
  for (const [name, sum] of acc.entries()) {
    const n = count.get(name) || 1;
    const avg = sum / n;
    out.push({ name, pct: avg });
  }

  // normaliza a 100 con 1 decimal; ordena desc
  const total = out.reduce((s, x) => s + x.pct, 0) || 1;
  const scaled = out.map((r) => ({ ...r, pct: Math.round((r.pct / total) * 1000) / 10 })); // 1 decimal
  scaled.sort((a, b) => b.pct - a.pct);
  return scaled;
}

/* === Base de datos mínima para ficha técnica (tipo v-4) === */
type MineralDetails = {
  formula?: string;
  commodity?: string;
  density?: string | number; // g/cm³
  mohs?: number;
  color?: string;
  luster?: string;
  habit?: string;
  system?: string;
  occurrence?: string;
  associates?: string;
  notes?: string;
};
const MINERAL_DB: Record<string, MineralDetails> = {
  Cuarzo: {
    formula: "SiO2",
    commodity: "SiO2",
    density: 2.65,
    mohs: 7,
    color: "Incoloro a variado",
    luster: "Vítreo",
    habit: "Prismático, masivo",
    system: "Trigonal",
    occurrence: "Ubicuo",
    associates: "Feldespatos; Micas",
    notes: "Arenas industriales",
  },
  Calcita: {
    formula: "CaCO₃",
    commodity: "CaCO₃",
    density: "2.71",
    mohs: 3,
    color: "Incoloro a blanco",
    luster: "Vítreo a nacarado",
    habit: "Romboédrico, masivo",
    system: "Trigonal",
    occurrence: "Ubiquo en rocas sedimentarias",
    associates: "Dolomita; Cuarzo",
    notes: "Reacciona con HCl diluido",
  },
  Pirita: {
    formula: "FeS₂",
    commodity: "Fe",
    density: "5.0",
    mohs: 6.0,
    color: "Amarillo latón",
    luster: "Metálico",
    habit: "Cúbico, masivo",
    system: "Cúbico",
    occurrence: "Sulfuros en muchos ambientes",
    associates: "Cuarzo; Calcita",
    notes: "Conocida como 'oro de los tontos'",
  },
  Malaquita: {
    formula: "Cu₂CO₃(OH)₂",
    commodity: "Cu",
    density: "3.6–4.0",
    mohs: 3.5,
    color: "Verde intenso",
    luster: "Sedoso a terroso",
    habit: "Botrioidal, masivo",
    system: "Monoclínico",
    occurrence: "Zona de oxidación de yacimientos cupríferos",
    associates: "Azurita; Cuprita",
    notes: "Pigmento y mena secundaria de cobre",
  },
  Feldespato: {
    formula: "KAlSi₃O₈ – NaAlSi₃O₈ – CaAl₂Si₂O₈",
    commodity: "—",
    density: "2.55–2.76",
    mohs: 6,
    color: "Blanco a rosado",
    luster: "Vítreo",
    habit: "Prismático, tabular",
    system: "Monoclínico/Triclínico",
    occurrence: "Muy común en rocas ígneas",
    associates: "Cuarzo; Micas",
    notes: "Importante en cerámica y vidrio",
  },
};

/* Precios demo (puedes sustituir por tu tabla de Supabase) */
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

/* ==================== Página ==================== */

export default function AnalyzerPage() {
  // Captura
  const [photos, setPhotos] = React.useState<CapturedPhoto[]>([]);
  const [imagesDataURL, setImagesDataURL] = React.useState<string[]>([]);
  const [geo, setGeo] = React.useState<GeoResult | null>(null);

  // Parámetros
  const [sampleCode, setSampleCode] = React.useState("MQ-0001");
  const [currency, setCurrency] = React.useState<CurrencyCode>("USD");

  // Resultados
  const [globalResults, setGlobalResults] = React.useState<MineralResult[]>([]);
  const [perImage, setPerImage] = React.useState<{ fileName: string; results: MineralResult[] }[]>([]);

  // Estados UI
  const [busyAnalyze, setBusyAnalyze] = React.useState(false);
  const [busyGeneralPdf, setBusyGeneralPdf] = React.useState(false);
  const [busyMineralPdf, setBusyMineralPdf] = React.useState(false);

  // Nearby (yacimiento) states
  const [nearbyItems, setNearbyItems] = React.useState<GeoSourceItem[]>([]);
  const [nearbySelected, setNearbySelected] = React.useState<GeoSourceItem[]>([]);
  const [loadingNearby, setLoadingNearby] = React.useState(false);
  const [errorNearby, setErrorNearby] = React.useState<string | null>(null);

  // Modal ficha
  const [modalOpen, setModalOpen] = React.useState(false);
  const [modalMineral, setModalMineral] = React.useState<MineralResult | null>(null);

  // Al recibir fotos → generar dataURL y mostrar miniaturas
  const handlePhotos = React.useCallback(async (arr: CapturedPhoto[]) => {
    setPhotos(arr);
    const dataurls = await Promise.all(arr.map((p) => fileToDataURL(p.file)));
    setImagesDataURL(dataurls);
  }, []);

  // Ubicación
  const handleGeo = React.useCallback((g: GeoResult) => setGeo(g), []);

  // Llamada REAL al backend /api/analyze con FormData
  async function handleAnalyze() {
    if (!photos.length) {
      alert("Primero toma o sube al menos una foto.");
      return;
    }
    setBusyAnalyze(true);
    try {
      // 1) Construir FormData con todas las fotos
      const fd = new FormData();
      photos.forEach((p) => {
        // La CLAVE debe ser EXACTAMENTE "images", el backend la espera así
        fd.append("images", p.file, p.file.name || "foto.jpg");
      });

      // 2) Llamar a tu endpoint /api/analyze
      const r = await fetch("/api/analyze", { method: "POST", body: fd });
      if (!r.ok) {
        const errTxt = await r.text().catch(() => "");
        throw new Error(`Error del servidor (${r.status}): ${errTxt || "ver consola"}`);
      }

      // 3) Parsear respuesta { perImage, meta }
      const j = await r.json();
      const per = Array.isArray(j?.perImage)
        ? (j.perImage as { fileName: string; results: MineralResult[] }[])
        : [];

      if (!per.length) {
        alert("No se obtuvieron resultados.");
        setPerImage([]);
        setGlobalResults([]);
        return;
      }

      // 4) Guardar “por imagen” y calcular mezcla global
      setPerImage(per);
      setGlobalResults(computeGlobalAverage(per));
    } catch (e: any) {
      console.error("ANALYZE UI error:", e?.message || e);
      alert(`No se pudo analizar: ${e?.message || e}`);
    } finally {
      setBusyAnalyze(false);
    }
  }

  // PDF general (con mapa estático si hay geo) -> usa buildReportPdfPlus
  async function handleExportGeneralPdf() {
    if (!globalResults.length || !perImage.length) {
      alert("Primero realiza el análisis.");
      return;
    }
    setBusyGeneralPdf(true);
    try {
      // Construimos byImage en la forma esperada por buildReportPdfPlus
      const byImage = perImage.map((p) => ({
        filename: p.fileName,
        minerals: p.results,
        excluded: null,
      }));

      const opts = {
        title: `Reporte ${sampleCode}`,
        note: undefined,
        lat: geo?.point?.lat,
        lng: geo?.point?.lng,
        dateISO: new Date().toISOString(),
        econ: undefined,
        // IMPORTANT: aquí pasamos los seleccionados (nearbySelected)
        nearbySources: nearbySelected || [],
      };

      const doc = await buildReportPdfPlus({
        mixGlobal: globalResults,
        byImage,
        opts,
      } as any);

      const buffer = doc.output("arraybuffer");
      downloadPdf(new Uint8Array(buffer), `Reporte_${sampleCode}.pdf`);
    } catch (e: any) {
      console.error("Error generando PDF general:", e?.message || e);
      alert(`No fue posible generar el PDF: ${e?.message || e}`);
    } finally {
      setBusyGeneralPdf(false);
    }
  }

  // Ficha técnica (modal)
  function openMineral(m: MineralResult) {
    setModalMineral(m);
    setModalOpen(true);
  }
  async function exportMineralPdf() {
    if (!modalMineral) return;
    setBusyMineralPdf(true);
    try {
      const { name, pct } = modalMineral;
      const price = PRICE_MAP_USD[name] ?? 0;
      const bytes = await buildMineralPdf({
        mineralName: name,
        price,
        samplePct: pct,
        currency,
        notes: `Ficha técnica generada para la muestra ${sampleCode}.`,
      });
      downloadPdf(bytes, `Ficha_${name}.pdf`);
    } finally {
      setBusyMineralPdf(false);
    }
  }

  const canAnalyze = photos.length > 0;
  const resultsReady = globalResults.length > 0;

  // helpers ficha
  function getDetails(name: string): MineralDetails {
    return MINERAL_DB[name] || {};
  }
  function fmt(n: any) {
    return n == null || n === "" ? "—" : String(n);
  }
  function estValue(name: string, pct: number) {
    const price = PRICE_MAP_USD[name];
    if (!price) return null;
    const v = price * (pct / 100);
    return new Intl.NumberFormat("es-PE", { style: "currency", currency }).format(v);
  }

  /* ==================== Nearby (fetch) ==================== */

  async function fetchNearby(lat: number, lon: number) {
    try {
      setLoadingNearby(true);
      setErrorNearby(null);
      setNearbyItems([]);
      const res = await fetch(`/api/geosources?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`);
      const j = await res.json();
      if (!res.ok) {
        setErrorNearby(j?.error || "Error al obtener yacimientos");
        setNearbyItems([]);
      } else {
        setNearbyItems(Array.isArray(j.items) ? j.items : []);
      }
    } catch (err: any) {
      setErrorNearby(err?.message || "Error de red");
      setNearbyItems([]);
    } finally {
      setLoadingNearby(false);
    }
  }

  // Toggle selección de yacimiento (añadir/quitar)
  function toggleNearbySelect(item: GeoSourceItem) {
    setNearbySelected((prev) => {
      const exists = prev.find((p) => p.id === item.id);
      if (exists) return prev.filter((p) => p.id !== item.id);
      return [...prev, item];
    });
  }

  /* ==================== UI ==================== */

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Banner finito con efecto mineral */}
      <div className="relative h-16 md:h-20 overflow-hidden">
        {/* Franja degradada animada */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-700 via-cyan-400 via-emerald-400 to-amber-300 animate-mineral" />
        {/* Capa de partículas sutiles */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="particles-layer particles-layer--slow" />
          <div className="particles-layer particles-layer--fast" />
        </div>

        {/* Contenido del banner */}
        <div className="relative h-full max-w-5xl mx-auto px-4 flex items-center justify-between">
          <h1 className="text-white drop-shadow-lg text-lg md:text-xl font-semibold tracking-wide">
            Analizador de Muestras — Cámara + GPS
          </h1>

          <Link
            href="/"
            className="shrink-0 inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-white transition"
            title="Volver a la portada"
          >
            <span aria-hidden>←</span>
            <span>Volver a inicio</span>
          </Link>
        </div>
      </div>

      {/* Contenido principal */}
      <section className="max-w-6xl mx-auto px-5 py-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Columna izquierda: captura */}
        <div>
          {/* Código + moneda */}
          <div className="flex flex-wrap items-end gap-4 mb-4">
            <div>
              <label className="text-sm text-gray-700">Código de muestra</label>
              <input
                value={sampleCode}
                onChange={(e) => setSampleCode(e.target.value)}
                className="mt-1 border rounded px-3 py-2"
                placeholder="Ej. MQ-0001"
              />
            </div>
            <div>
              <label className="text-sm text-gray-700">Moneda</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                className="mt-1 border rounded px-3 py-2"
              >
                <option value="USD">USD (US$)</option>
                <option value="PEN">PEN (S/.)</option>
                <option value="EUR">EUR (€)</option>
              </select>
            </div>
          </div>

          {/* Cámara */}
          <div className="mb-3">
            <CameraCapture onPhotos={handlePhotos} />
          </div>

          {/* Miniaturas de las fotos tomadas/subidas */}
          {photos.length > 0 && (
            <div className="mb-6 grid grid-cols-2 md:grid-cols-3 gap-3">
              {photos.map((p, i) => (
                <div key={i} className="border rounded overflow-hidden">
                  <img src={URL.createObjectURL(p.file)} className="w-full h-28 object-cover" />
                  <div className="px-2 py-1 text-[11px] truncate">
                    {p.file.name || `foto_${i + 1}.jpg`}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Ubicación */}
          <div className="mb-4">
            <GeoCapture onChange={setGeo} />
          </div>

          {/* Botón buscar yacimientos (usa geo) */}
          <div className="mb-4">
            <button
              disabled={!geo?.point || loadingNearby}
              onClick={() => {
                if (geo?.point) fetchNearby(geo.point.lat, geo.point.lng);
                else alert("Primero obtén la ubicación (activar GPS / seleccionar punto).");
              }}
              className="px-3 py-2 rounded bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {loadingNearby ? "Buscando yacimientos…" : "Buscar yacimientos cercanos"}
            </button>
            {errorNearby && <div className="text-red-600 text-sm mt-2">{errorNearby}</div>}
          </div>

          {/* Vista rápida de yacimientos bajo la captura */}
          <div className="mb-6">
            <GeoSourcesPanel
              items={nearbyItems}
              onInclude={(it) => {
                toggleNearbySelect(it);
                // Retroalimentación
                const exists = nearbySelected.find((s) => s.id === it.id);
                alert(exists ? `Removido de selección: ${it.name}` : `Seleccionado: ${it.name}`);
              }}
            />

            {/* Lista simple de seleccionados (pequeña vista) */}
            {nearbySelected.length > 0 && (
              <div className="mt-3 p-2 border rounded bg-white">
                <div className="text-sm font-medium mb-1">Seleccionados ({nearbySelected.length})</div>
                <ul className="text-sm space-y-1">
                  {nearbySelected.map((s) => (
                    <li key={s.id} className="flex items-center justify-between">
                      <span>{s.name || "Sin nombre"}</span>
                      <button
                        onClick={() => toggleNearbySelect(s)}
                        className="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300"
                      >
                        Quitar
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Acciones */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleAnalyze}
              disabled={!canAnalyze || busyAnalyze}
              className="px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {busyAnalyze ? "Analizando…" : "Analizar"}
            </button>

            <button
              onClick={handleExportGeneralPdf}
              disabled={!resultsReady || busyGeneralPdf}
              className="px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {busyGeneralPdf ? "Generando PDF…" : "Generar PDF general"}
            </button>
          </div>
        </div>

        {/* Columna derecha: resultados */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Resultados</h3>

          {!resultsReady && (
            <p className="text-sm text-gray-600">
              Toma fotos y presiona <b>Analizar</b> para ver resultados.
            </p>
          )}

          {resultsReady && (
            <div className="grid grid-cols-1 gap-4">
              {/* Global */}
              <div className="border rounded-xl p-3">
                <h4 className="font-semibold mb-2">Mezcla promediada (global)</h4>
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="text-left px-3 py-2">Mineral</th>
                      <th className="text-right px-3 py-2">%</th>
                      <th className="text-center px-3 py-2">Ficha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {globalResults.map((r, i) => (
                      <tr key={i} className="border-b">
                        <td className="px-3 py-2">{r.name}</td>
                        <td className="px-3 py-2 text-right">{r.pct.toFixed(1)}</td>
                        <td className="px-3 py-2 text-center">
                          <button
                            onClick={() => openMineral(r)}
                            className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                          >
                            Ver ficha
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Por imagen */}
              <div className="border rounded-xl p-3">
                <h4 className="font-semibold mb-2">Resultados por imagen</h4>
                {perImage.map((img, idx) => (
                  <div key={idx} className="mb-3">
                    <div className="text-sm font-medium mb-1">
                      {idx + 1}. {img.fileName}
                    </div>
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="text-left px-3 py-2">Mineral</th>
                          <th className="text-right px-3 py-2">%</th>
                          <th className="text-center px-3 py-2">Ficha</th>
                        </tr>
                      </thead>
                      <tbody>
                        {img.results.map((r, i) => (
                          <tr key={i} className="border-b">
                            <td className="px-3 py-2">{r.name}</td>
                            <td className="px-3 py-2 text-right">{r.pct.toFixed(1)}</td>
                            <td className="px-3 py-2 text-center">
                              <button
                                onClick={() => openMineral(r)}
                                className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                              >
                                Ver ficha
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>

              {/* Panel extendido de yacimientos */}
              <div className="border rounded-xl p-3">
                <h4 className="font-semibold mb-2">Yacimientos / Canteras cercanas</h4>
                <p className="text-sm text-gray-600 mb-3">Resultados obtenidos desde OpenStreetMap (Overpass) y Geoapify.</p>

                <GeoSourcesPanel
                  items={nearbyItems}
                  onInclude={(it) => {
                    toggleNearbySelect(it);
                    const exists = nearbySelected.find((s) => s.id === it.id);
                    alert(exists ? `Removido de selección: ${it.name}` : `Seleccionado: ${it.name}`);
                  }}
                />

                {/* Lista de seleccionados (mayor espacio en el panel) */}
                {nearbySelected.length > 0 && (
                  <div className="mt-4 p-3 bg-white border rounded">
                    <div className="font-medium mb-2">Yacimientos seleccionados ({nearbySelected.length})</div>
                    <ul className="text-sm space-y-2">
                      {nearbySelected.map((s) => (
                        <li key={s.id} className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">{s.name || "Sin nombre"}</div>
                            <div className="text-xs text-gray-500">{s.latitude.toFixed(5)}, {s.longitude.toFixed(5)}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <a href={s.source_url} target="_blank" rel="noreferrer" className="text-xs underline text-blue-600">Fuente</a>
                            <button onClick={() => toggleNearbySelect(s)} className="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300">Quitar</button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Modal de ficha técnica — estilo detallado tipo v-4 */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h4 className="font-semibold">
                {modalMineral ? modalMineral.name : "Ficha técnica"}
              </h4>
              <button
                onClick={() => setModalOpen(false)}
                className="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300"
              >
                Cerrar
              </button>
            </div>

            <div className="p-5 text-sm">
              {!modalMineral ? (
                <p className="text-gray-600">Seleccione un mineral.</p>
              ) : (
                <>
                  {(() => {
                    const d = getDetails(modalMineral.name);
                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                        <div className="md:col-span-2 text-xl font-bold">{modalMineral.name}</div>
                        <div><b>Fórmula:</b> {fmt(d.formula)}</div>
                        <div><b>Commodity:</b> {fmt(d.commodity)}</div>
                        <div><b>Densidad (g/cm³):</b> {fmt(d.density)}</div>
                        <div><b>Dureza Mohs:</b> {fmt(d.mohs)}</div>
                        <div><b>Color:</b> {fmt(d.color)}</div>
                        <div><b>Brillo:</b> {fmt(d.luster)}</div>
                        <div><b>Hábito:</b> {fmt(d.habit)}</div>
                        <div><b>Sistema:</b> {fmt(d.system)}</div>
                        <div className="md:col-span-2"><b>Ocurrencia:</b> {fmt(d.occurrence)}</div>
                        <div className="md:col-span-2"><b>Asociados:</b> {fmt(d.associates)}</div>
                        <div className="md:col-span-2"><b>Notas:</b> {fmt(d.notes)}</div>
                        <div className="md:col-span-2 pt-2">
                          <b>% en la muestra:</b> {modalMineral.pct.toFixed(2)} %
                          {estValue(modalMineral.name, modalMineral.pct) && (
                            <> — <b>Valor estimado/t:</b> {estValue(modalMineral.name, modalMineral.pct)}</>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  <div className="pt-4">
                    <button
                      onClick={exportMineralPdf}
                      disabled={busyMineralPdf}
                      className="px-3 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {busyMineralPdf ? "Generando PDF…" : "Descargar PDF de este mineral"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Estilos del efecto (mismo que portada) */}
      <style jsx global>{`
        /* Degradado animado */
        @keyframes mineralFlow {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-mineral {
          background-size: 300% 300%;
          animation: mineralFlow 10s ease-in-out infinite;
          filter: brightness(0.95);
        }

        /* Partículas sutiles */
        .particles-layer {
          position: absolute;
          inset: -6px -12px;
          opacity: 0.14;
          filter: blur(0.2px);
          mask-image: radial-gradient(closest-side, rgba(0,0,0,1), rgba(0,0,0,0.4));
          -webkit-mask-image: radial-gradient(closest-side, rgba(0,0,0,1), rgba(0,0,0,0.4));
          pointer-events: none;
          background-image:
            radial-gradient(2px 2px at 10% 20%, rgba(255,255,255,0.9) 60%, transparent 61%),
            radial-gradient(1.8px 1.8px at 30% 80%, rgba(255,255,255,0.8) 60%, transparent 61%),
            radial-gradient(2.2px 2.2px at 70% 30%, rgba(255,255,255,0.85) 60%, transparent 61%),
            radial-gradient(1.6px 1.6px at 85% 60%, rgba(255,255,255,0.75) 60%, transparent 61%),
            radial-gradient(1.4px 1.4px at 45% 50%, rgba(255,255,255,0.7) 60%, transparent 61%),
            radial-gradient(2px 2px at 60% 15%, rgba(255,255,255,0.85) 60%, transparent 61%),
            radial-gradient(1.8px 1.8px at 20% 60%, rgba(255,255,255,0.8) 60%, transparent 61%);
          background-repeat: no-repeat;
          background-size: 100% 100%;
          mix-blend-mode: screen;
        }
        @keyframes dustDriftSlow {
          0%   { transform: translate3d(-6px, 0px, 0) }
          50%  { transform: translate3d(6px, -3px, 0) }
          100% { transform: translate3d(-6px, 0px, 0) }
        }
        @keyframes dustDriftFast {
          0%   { transform: translate3d(6px, -2px, 0) }
          50%  { transform: translate3d(-6px, 2px, 0) }
          100% { transform: translate3d(6px, -2px, 0) }
        }
        .particles-layer--slow { animation: dustDriftSlow 12s ease-in-out infinite; }
        .particles-layer--fast { animation: dustDriftFast 7.5s ease-in-out infinite; opacity: 0.1; }

        @media (max-width: 380px) {
          .particles-layer { opacity: 0.12; }
        }
      `}</style>
    </main>
  );
}
