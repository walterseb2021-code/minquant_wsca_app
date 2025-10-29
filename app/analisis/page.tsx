"use client";

import React from "react";
import Link from "next/link";
import CameraCapture, { type CapturedPhoto } from "../../components/CameraCapture";
import GeoCapture, { type GeoResult } from "../../components/GeoCapture";

import {
  buildMineralPdf,
  downloadPdf,
  type MineralResult,
  type CurrencyCode,
  type CommodityAdjustments,
} from "../../lib/pdf";

import { buildReportPdfPlus } from "../../lib/pdf_plus"; // ✅ NUEVO

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

export default function AnalisisPage() {
  const [photos, setPhotos] = React.useState<CapturedPhoto[]>([]);
  const [imagesDataURL, setImagesDataURL] = React.useState<string[]>([]);
  const [geo, setGeo] = React.useState<GeoResult | null>(null);

  const [sampleCode, setSampleCode] = React.useState("MQ-0001");
  const [currency, setCurrency] = React.useState<CurrencyCode>("USD");

  const [adj, setAdj] = React.useState<CommodityAdjustments>({
    Cobre: { recovery: 0.88, payable: 0.96 },
    Zinc: { recovery: 0.85, payable: 0.85 },
    Plomo: { recovery: 0.90, payable: 0.90 },
  });

  const [globalResults, setGlobalResults] = React.useState<MineralResult[]>([]);
  const [perImage, setPerImage] = React.useState<{ fileName: string; results: MineralResult[] }[]>([]);
  const [excluded, setExcluded] = React.useState<{ fileName: string; reason: string }[]>([]);
  const [interpretation, setInterpretation] = React.useState<{ geology: string; economics: string; caveats: string } | null>(null);

  const [busyAnalyze, setBusyAnalyze] = React.useState(false);
  const [busyGeneralPdf, setBusyGeneralPdf] = React.useState(false);
  const [busyMineralPdf, setBusyMineralPdf] = React.useState(false);

  const [modalOpen, setModalOpen] = React.useState(false);
  const [modalMineral, setModalMineral] = React.useState<MineralResult | null>(null);
  const [modalInfo, setModalInfo] = React.useState<MineralInfoWeb | null>(null);
  const [loadingInfo, setLoadingInfo] = React.useState(false);

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

  async function handleAnalyze() {
    if (!photos.length) {
      alert("Primero toma o sube al menos una foto.");
      return;
    }
    setBusyAnalyze(true);

    try {
      const form = new FormData();
      const MAX = 6;
      const subset = photos.slice(0, MAX);

      for (const p of subset) {
        const blob = await resizeImageFile(p.file, 1280, 0.7);
        const name = (p.file.name || "foto.jpg").replace(/\.(png|jpg|jpeg|webp)$/i, "") + "_cmp.jpg";
        form.append("images", new File([blob], name, { type: "image/jpeg" }));
      }

      const r = await fetch("/api/analyze", { method: "POST", body: form });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Error analizando");

      const perFromApi = (j.perImage ?? []) as { fileName: string; results: MineralResult[] }[];
      setPerImage(perFromApi);
      setExcluded(Array.isArray(j?.excluded) ? j.excluded : []);
      setInterpretation(j?.interpretation ?? null);
      const results = j.global ?? [];

      setGlobalResults(results);
    } catch (e: any) {
      console.error("[Analyze] Error:", e);
      alert(e?.message || "Error analizando");
    } finally {
      setBusyAnalyze(false);
    }
  }

  async function handleExportGeneralPdf() {
    if (!globalResults.length) {
      alert("Primero realiza el análisis.");
      return;
    }
    setBusyGeneralPdf(true);

    try {
      const safeAdj = {
        Cobre: { recovery: adj?.Cobre?.recovery ?? 0.85, payable: adj?.Cobre?.payable ?? 0.96 },
        Zinc: { recovery: adj?.Zinc?.recovery ?? 0.85, payable: adj?.Zinc?.payable ?? 0.96 },
        Plomo: { recovery: adj?.Plomo?.recovery ?? 0.90, payable: adj?.Plomo?.payable ?? 0.90 },
      };

      const doc = await buildReportPdfPlus({
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
        recoveryPayables: safeAdj,
        interpretation: interpretation || undefined,
        excluded,
      });

      const buffer = doc.output("arraybuffer");
      downloadPdf(new Uint8Array(buffer), `Reporte_${sampleCode}.pdf`);
    } catch (e: any) {
      console.error("[PDF] Error:", e);
      alert("Error PDF.");
    } finally {
      setBusyGeneralPdf(false);
    }
  }

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
      alert("Error PDF mineral");
    } finally {
      setBusyMineralPdf(false);
    }
  }

  const canAnalyze = photos.length > 0;
  const extra = Math.max(0, photos.length - 6);
  const fmt = (v: any) => (v == null ? "—" : v);

  return (
    <main className="min-h-screen">
      <header className="w-full py-3 px-5 bg-gradient-to-r from-cyan-600 to-emerald-600 text-white">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-semibold">Cámara • Ubicación • Análisis</h1>
          <Link href="/" className="px-3 py-1 rounded bg-white/20 hover:bg-white/30">Inicio</Link>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-5 py-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="flex flex-wrap items-end gap-4 mb-4">
            <div>
              <label className="text-sm text-gray-700">Código de muestra</label>
              <input value={sampleCode} onChange={(e) => setSampleCode(e.target.value)}
                className="mt-1 border rounded px-3 py-2" />
            </div>
            <div>
              <label className="text-sm text-gray-700">Moneda</label>
              <select value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                className="mt-1 border rounded px-3 py-2">
                <option value="USD">USD</option>
                <option value="PEN">PEN</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>

          <div className="border rounded-lg p-3 bg-gray-50 mb-4">
            <div className="font-semibold mb-2">Recuperación y Payable</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(["Cobre", "Zinc", "Plomo"] as const).map(metal => (
                <div key={metal} className="border rounded p-2 bg-white">
                  <div className="text-sm font-medium mb-1">{metal}</div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs w-12">Rec %</label>
                    <input type="number" min={0} max={100} step={1}
                      value={Math.round((adj[metal]?.recovery ?? 0) * 100)}
                      onChange={(e) => setNum(metal, "recovery", e.target.value)}
                      className="border rounded px-2 py-1 w-14 text-sm" />
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <label className="text-xs w-12">Pay %</label>
                    <input type="number" min={0} max={100} step={1}
                      value={Math.round((adj[metal]?.payable ?? 0) * 100)}
                      onChange={(e) => setNum(metal, "payable", e.target.value)}
                      className="border rounded px-2 py-1 w-14 text-sm" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <CameraCapture onPhotos={handlePhotos} />

          {extra > 0 && (
            <div className="mt-3 rounded bg-yellow-50 border border-yellow-300 px-3 py-2 text-sm text-yellow-800">
              Solo se procesarán 6 fotos. El resto será ignorado.
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

          <GeoCapture onChange={setGeo} />

          <button
            onClick={handleAnalyze}
            disabled={!canAnalyze || busyAnalyze}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded disabled:opacity-50">
            {busyAnalyze ? "Analizando..." : "Analizar"}
          </button>

          <button
            onClick={handleExportGeneralPdf}
            disabled={!globalResults.length}
            className="mt-4 ml-3 px-4 py-2 bg-emerald-600 text-white rounded disabled:opacity-50">
            PDF general
          </button>
        </div>

        {/* RESULTADOS */}
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
                            className="px-2 py-1 bg-blue-600 text-white text-xs rounded">
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
                  <p className="text-sm mt-1"><b>Geología:</b> {fmt(interpretation.geology)}</p>
                  <p className="text-sm mt-1"><b>Economía:</b> {fmt(interpretation.economics)}</p>
                  <p className="text-sm mt-1"><b>Advertencias:</b> {fmt(interpretation.caveats)}</p>
                </div>
              )}

              {/* Excluidas */}
              {excluded.length > 0 && (
                <div className="border rounded-xl p-3 bg-yellow-50 text-yellow-900">
                  <b>Imágenes excluidas</b>
                  <ul className="text-sm mt-2 ml-4 list-disc">
                    {excluded.map((e, i) => (
                      <li key={i}>{e.fileName} — {e.reason}</li>
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
              <button onClick={() => setModalOpen(false)} className="px-2 py-1 bg-gray-200 rounded">Cerrar</button>
            </div>
            <div className="p-4 text-sm">
              {loadingInfo ? "Cargando..." :
                modalMineral && (
                  <>
                    <p><b>% en muestra:</b> {modalMineral.pct.toFixed(2)}%</p>
                    <button
                      onClick={exportMineralPdf}
                      className="mt-3 bg-emerald-600 text-white px-3 py-2 rounded text-sm"
                      disabled={busyMineralPdf}>
                      PDF Mineral
                    </button>
                  </>
                )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
