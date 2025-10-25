// mineral-app/app/analisis/page.tsx
"use client";

import React from "react";
import Link from "next/link";
import CameraCapture, { type CapturedPhoto } from "../../components/CameraCapture";
import GeoCapture, { type GeoResult } from "../../components/GeoCapture";
import {
  buildReportPdf,
  buildMineralPdf,
  downloadPdf,
  type MineralResult,
  type CurrencyCode,
  type CommodityAdjustments,
} from "../../lib/pdf";

/* File -> dataURL para PDF */
async function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

/* === NUEVO: redimensionar/comprimir imagen antes de subir === */
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

/* Respuesta de /api/mineral-info */
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

/* Precios demo para la ficha */
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

export default function AnalisisPage() {
  // Captura
  const [photos, setPhotos] = React.useState<CapturedPhoto[]>([]);
  const [imagesDataURL, setImagesDataURL] = React.useState<string[]>([]);
  const [geo, setGeo] = React.useState<GeoResult | null>(null);

  // Parámetros
  const [sampleCode, setSampleCode] = React.useState("MQ-0001");
  const [currency, setCurrency] = React.useState<CurrencyCode>("USD");

  // Overrides por commodity (Cu/Zn/Pb)
  const [adj, setAdj] = React.useState<CommodityAdjustments>({
    Cobre: { recovery: 0.88, payable: 0.96 },
    Zinc: { recovery: 0.85, payable: 0.85 },
    Plomo: { recovery: 0.90, payable: 0.90 },
  });
  const setNum = (metal: "Cobre" | "Zinc" | "Plomo", field: "recovery" | "payable", val: string) => {
    const pct = Math.max(0, Math.min(100, Number(val)));
    setAdj((prev) => ({
      ...prev,
      [metal]: { ...prev[metal], [field]: isFinite(pct) ? pct / 100 : prev[metal][field] },
    }));
  };

  // Resultados
  const [globalResults, setGlobalResults] = React.useState<MineralResult[]>([]);
  const [perImage, setPerImage] = React.useState<{ fileName: string; results: MineralResult[] }[]>([]);

  // Estados UI
  const [busyAnalyze, setBusyAnalyze] = React.useState(false);
  const [busyGeneralPdf, setBusyGeneralPdf] = React.useState(false);
  const [busyMineralPdf, setBusyMineralPdf] = React.useState(false);

  // Modal ficha
  const [modalOpen, setModalOpen] = React.useState(false);
  const [modalMineral, setModalMineral] = React.useState<MineralResult | null>(null);
  const [modalInfo, setModalInfo] = React.useState<MineralInfoWeb | null>(null);
  const [loadingInfo, setLoadingInfo] = React.useState(false);

  // Fotos -> dataURLs para PDF
  const handlePhotos = React.useCallback(async (arr: CapturedPhoto[]) => {
    setPhotos(arr);
    const dataurls = await Promise.all(arr.map((p) => fileToDataURL(p.file)));
    setImagesDataURL(dataurls);
  }, []);

  // Ubicación
  const handleGeo = React.useCallback((g: GeoResult) => setGeo(g), []);

  // ===== Análisis (/api/analyze) con envío comprimido =====
  async function handleAnalyze() {
    if (!photos.length) {
      alert("Primero toma o sube al menos una foto.");
      return;
    }
    setBusyAnalyze(true);
    try {
      const form = new FormData();

      // Limitar a 6 fotos y comprimir cada una
      const MAX = 6;
      const subset = photos.slice(0, MAX);
      for (const p of subset) {
        const blob = await resizeImageFile(p.file, 1280, 0.7);
        const name = (p.file.name || "foto.jpg").replace(/\.(png|jpg|jpeg|webp)$/i, "") + "_cmp.jpg";
        form.append("images", new File([blob], name, { type: "image/jpeg" }));
      }

      const r = await fetch("/api/analyze", { method: "POST", body: form });
      const ct = (r.headers.get("content-type") || "").toLowerCase();
      if (!ct.includes("application/json")) {
        const txt = await r.text();
        throw new Error(`El servidor no devolvió JSON (${r.status}). Resumen: ${txt.slice(0, 160)}`);
      }
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Error analizando");

      const perFromApi = (j?.perImage ?? []) as { fileName: string; results: MineralResult[] }[];
      setPerImage(perFromApi);

      // Global promedio simple normalizado a 100
      const totals = new Map<string, number>();
      const counts = new Map<string, number>();
      perFromApi.forEach((img) => {
        img.results.forEach((r) => {
          const k = r.name;
          totals.set(k, (totals.get(k) || 0) + r.pct);
          counts.set(k, (counts.get(k) || 0) + 1);
        });
      });
      const global: MineralResult[] = Array.from(totals.entries()).map(([name, sum]) => ({
        name,
        pct: sum / (counts.get(name) || 1),
      }));
      const sum = global.reduce((a, b) => a + b.pct, 0) || 1;
      let normalized = global.map((g) => ({ name: g.name, pct: Math.round((g.pct / sum) * 1000) / 10 }));
      const diff = Math.round((100 - normalized.reduce((a, b) => a + b.pct, 0)) * 10) / 10;
      if (diff !== 0 && normalized.length) {
        const iMax = normalized.reduce((idx, r, i, arr) => (r.pct > arr[idx].pct ? i : idx), 0);
        normalized[iMax] = { ...normalized[iMax], pct: Math.round((normalized[iMax].pct + diff) * 10) / 10 };
      }
      setGlobalResults(normalized);
    } catch (e: any) {
      console.error("[Analyze] Error:", e);
      alert(e?.message || "Error analizando (revisa la consola - F12).");
    } finally {
      setBusyAnalyze(false);
    }
  }

  // ===== PDF General =====
  async function handleExportGeneralPdf() {
    if (!globalResults.length || !perImage.length) {
      alert("Primero realiza el análisis.");
      return;
    }
    setBusyGeneralPdf(true);
    try {
      const doc = await buildReportPdf({
        appName: "MinQuant_WSCA",
        sampleCode,
        results: globalResults,
        perImage,
        imageDataUrls: imagesDataURL,
        generatedAt: new Date().toISOString(),
        location: geo?.point
          ? {
              lat: geo.point.lat,
              lng: geo.point.lng,
              accuracy: geo.point.accuracy,
              address: geo.address?.formatted,
            }
          : undefined,
        embedStaticMap: true,
        recoveryPayables: adj, // ← pasa overrides al PDF
      });
      const buffer = doc.output("arraybuffer");
      downloadPdf(new Uint8Array(buffer), `Reporte_${sampleCode}.pdf`);
    } catch (e: any) {
      console.error("[PDF General] Error:", e);
      alert(
        "No se pudo generar el PDF general. Revisa la consola (F12) → Console.\n" +
          "Si ves 'autoTable is not a function', instala y reinicia: npm i jspdf jspdf-autotable"
      );
    } finally {
      setBusyGeneralPdf(false);
    }
  }

  // ===== Ficha =====
  async function openMineral(m: MineralResult) {
    setModalMineral(m);
    setModalOpen(true);
    setModalInfo(null);
    setLoadingInfo(true);
    try {
      const r = await fetch(`/api/mineral-info?name=${encodeURIComponent(m.name)}`, { cache: "no-store" });
      const ct = (r.headers.get("content-type") || "").toLowerCase();
      if (!ct.includes("application/json")) {
        const txt = await r.text();
        throw new Error(`Ficha no JSON (${r.status}): ${txt.slice(0, 120)}`);
      }
      const info = (await r.json()) as MineralInfoWeb;
      setModalInfo(info);
    } catch (e) {
      console.error("[Ficha] Error obteniendo info:", e);
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
      downloadPdf(bytes, `Ficha_${(modalInfo?.nombre || name).replace(/\s+/g, "_")}.pdf`);
    } catch (e: any) {
      console.error("[PDF Mineral] Error:", e);
      alert("No se pudo generar el PDF del mineral. Revisa consola (F12) → Console.");
    } finally {
      setBusyMineralPdf(false);
    }
  }

  const canAnalyze = photos.length > 0;
  const resultsReady = globalResults.length > 0;

  const fmt = (v?: string | number | null) => (v == null || v === "" ? "—" : String(v));

  return (
    <main className="min-h-screen">
      <header className="w-full py-3 px-5 bg-gradient-to-r from-cyan-600 to-emerald-600 text-white">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-semibold">Cámara • Ubicación • Análisis</h1>
          <Link href="/" className="px-3 py-1 rounded bg-white/20 hover:bg-white/30">Inicio</Link>
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

          {/* Panel Rec./Pay. */}
          <div className="mb-4 border rounded-lg p-3 bg-gray-50">
            <div className="font-semibold mb-2">Recuperación y Payable por commodity</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(["Cobre", "Zinc", "Plomo"] as const).map((metal) => (
                <div key={metal} className="border rounded p-2 bg-white">
                  <div className="text-sm font-medium mb-1">{metal}</div>
                  <div className="flex items-center gap-2 text-sm">
                    <label className="w-16">Rec. %</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="1"
                      value={Math.round((adj[metal]?.recovery ?? 0) * 100)}
                      onChange={(e) => setNum(metal, "recovery", e.target.value)}
                      className="border rounded px-2 py-1 w-20"
                    />
                  </div>
                  <div className="flex items-center gap-2 text-sm mt-2">
                    <label className="w-16">Pay. %</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="1"
                      value={Math.round((adj[metal]?.payable ?? 0) * 100)}
                      onChange={(e) => setNum(metal, "payable", e.target.value)}
                      className="border rounded px-2 py-1 w-20"
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[12px] text-gray-600 mt-2">
              Si un metal no está en esta lista, se usan valores por defecto (Rec. 85% • Pay. 96%).
            </p>
          </div>

          <div className="mb-3">
            <CameraCapture onPhotos={handlePhotos} />
          </div>

          {photos.length > 0 && (
            <div className="mb-6 grid grid-cols-2 md:grid-cols-3 gap-3">
              {photos.map((p, i) => (
                <div key={i} className="border rounded overflow-hidden">
                  <img src={URL.createObjectURL(p.file)} className="w-full h-28 object-cover" />
                  <div className="px-2 py-1 text-[11px] truncate">{p.file.name || `foto_${i + 1}.jpg`}</div>
                </div>
              ))}
            </div>
          )}

          <div className="mb-6">
            <GeoCapture onChange={setGeo} />
          </div>

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

        {/* DERECHA */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Resultados</h3>

          {!resultsReady && <p className="text-sm text-gray-600">Toma fotos y presiona <b>Analizar</b>.</p>}

          {resultsReady && (
            <div className="grid grid-cols-1 gap-4">
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
            </div>
          )}
        </div>
      </section>

      {/* Modal ficha */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h4 className="font-semibold">{modalInfo?.nombre || modalMineral?.name || "Ficha técnica"}</h4>
              <button onClick={() => setModalOpen(false)} className="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300">Cerrar</button>
            </div>

            <div className="p-5 text-sm">
              {!modalMineral ? (
                <p className="text-gray-600">Seleccione un mineral.</p>
              ) : loadingInfo ? (
                <p className="text-gray-600">Cargando ficha desde la web…</p>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                    <div className="md:col-span-2 text-xl font-bold">
                      {modalInfo?.nombre || modalMineral.name}
                    </div>
                    <div><b>Fórmula:</b> {fmt(modalInfo?.formula)}</div>
                    <div><b>Commodity:</b> {fmt(modalInfo?.commodity)}</div>
                    <div><b>Densidad (g/cm³):</b> {fmt(modalInfo?.densidad)}</div>
                    <div><b>Dureza Mohs:</b> {fmt(modalInfo?.mohs)}</div>
                    <div><b>Color:</b> {fmt(modalInfo?.color)}</div>
                    <div><b>Brillo:</b> {fmt(modalInfo?.brillo)}</div>
                    <div><b>Hábito:</b> {fmt(modalInfo?.habito)}</div>
                    <div><b>Sistema:</b> {fmt(modalInfo?.sistema)}</div>
                    <div className="md:col-span-2"><b>Ocurrencia:</b> {fmt(modalInfo?.ocurrencia)}</div>
                    <div className="md:col-span-2"><b>Asociados:</b> {fmt(modalInfo?.asociados)}</div>
                    <div className="md:col-span-2"><b>Notas:</b> {fmt(modalInfo?.notas)}</div>
                    <div className="md:col-span-2 pt-2">
                      <b>% en la muestra:</b> {modalMineral.pct.toFixed(2)} %
                    </div>
                  </div>

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
    </main>
  );
}
