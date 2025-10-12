"use client";
import React, { useEffect, useState } from "react";
import { getMineralByName, type Mineral } from "../lib/catalog";
import { buildFichaPdf } from "../lib/pdfFicha";

type Props = { mineralName: string; samplePct?: number; onClose: () => void };

export default function MineralSheet({ mineralName, samplePct, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [mineral, setMineral] = useState<Mineral | null>(null);
  const [price, setPrice] = useState<number | "">("");
  const [estimate, setEstimate] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const m = await getMineralByName(mineralName);
      setMineral(m);
      setLoading(false);
    })();
  }, [mineralName]);

  // Calcula valor estimado por tonelada (si price = USD/kg)
  useEffect(() => {
    if (!mineral || !samplePct || !price || !mineral.content_fraction) {
      setEstimate(null);
      return;
    }
    const val = Number(price) * 1000 * mineral.content_fraction * (samplePct / 100);
    setEstimate(Math.round(val * 100) / 100);
  }, [mineral, samplePct, price]);

  async function exportarFicha() {
    if (!mineral) return;
    try {
      setDownloading(true);

      // Asegura que el precio se envíe al PDF (o undefined si vacío)
      const usdKg =
        price === "" ? undefined : typeof price === "number" ? price : Number(price);

      const pdf = await buildFichaPdf({
        name: mineral.name,
        formula: mineral.formula ?? "",
        commodity: mineral.commodity ?? "",
        color: mineral.color ?? "",
        brillo: mineral.luster ?? "",
        habito: mineral.habit ?? "",
        sistema: mineral.system ?? "",
        densidad: mineral.density_g_cm3 ?? "",
        dureza: mineral.hardness_mohs ?? "",
        ocurrencia: mineral.occurrence ?? "",
        asociados: mineral.associated ?? "",
        notas: mineral.notes ?? "",
        porcentaje: samplePct ?? undefined,
        valorUsdKg: usdKg, // << ahora viaja al PDF
        // imagen: aquí podrías pasar una miniatura (dataURL) si la tienes
      });

      pdf.save(`Ficha_${mineral.name}.pdf`);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-[92vw] max-w-3xl p-6 relative">
        <button
          className="absolute top-3 right-3 text-gray-500 hover:text-black"
          onClick={onClose}
        >
          ✕
        </button>

        {loading && <div>Cargando ficha…</div>}

        {!loading && !mineral && (
          <div>
            <h2 className="text-xl font-bold">Sin ficha disponible</h2>
            <p className="text-sm text-gray-600 mt-2">
              No encontramos una ficha técnica para <strong>{mineralName}</strong>.
            </p>
          </div>
        )}

        {!loading && mineral && (
          <div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-2xl font-bold">{mineral.name}</h2>
                <p className="text-sm text-gray-600">
                  Fórmula: {mineral.formula || "—"}
                </p>
              </div>

              <button
                onClick={exportarFicha}
                disabled={downloading}
                className="rounded-lg bg-emerald-600 text-white px-3 py-2 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
                title="Exportar ficha técnica en PDF"
              >
                {downloading ? "Generando…" : "📄 Exportar ficha (PDF)"}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
              <div className="space-y-1">
                <div>
                  <span className="font-medium">Commodity:</span>{" "}
                  {mineral.commodity || "—"}
                </div>
                <div>
                  <span className="font-medium">Fracción teórica:</span>{" "}
                  {mineral.content_fraction ?? "—"}
                </div>
                <div>
                  <span className="font-medium">Densidad (g/cm³):</span>{" "}
                  {mineral.density_g_cm3 || "—"}
                </div>
                <div>
                  <span className="font-medium">Dureza Mohs:</span>{" "}
                  {mineral.hardness_mohs || "—"}
                </div>
              </div>
              <div className="space-y-1">
                <div>
                  <span className="font-medium">Color:</span>{" "}
                  {mineral.color || "—"}
                </div>
                <div>
                  <span className="font-medium">Brillo:</span>{" "}
                  {mineral.luster || "—"}
                </div>
                <div>
                  <span className="font-medium">Hábito:</span>{" "}
                  {mineral.habit || "—"}
                </div>
                <div>
                  <span className="font-medium">Sistema:</span>{" "}
                  {mineral.system || "—"}
                </div>
              </div>
            </div>

            <div className="mt-3 text-sm">
              <div>
                <span className="font-medium">Ocurrencia:</span>{" "}
                {mineral.occurrence || "—"}
              </div>
              <div>
                <span className="font-medium">Asociados:</span>{" "}
                {mineral.associated || "—"}
              </div>
              <div>
                <span className="font-medium">Notas:</span>{" "}
                {mineral.notes || "—"}
              </div>
            </div>

            <div className="mt-5 border-t pt-4">
              <h3 className="font-semibold">Valor económico estimado (opcional)</h3>
              <div className="text-xs text-gray-500">
                Precio del commodity en <strong>USD/kg</strong>:
              </div>
              <div className="flex items-center gap-2 mt-3">
                <input
                  className="border rounded px-2 py-1 text-sm w-28"
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) =>
                    setPrice(e.target.value === "" ? "" : Number(e.target.value))
                  }
                />
                <div className="text-sm text-gray-600">
                  % en la muestra:{" "}
                  <strong>{(samplePct ?? 0).toFixed(2)}%</strong>
                </div>
              </div>
              {estimate != null && (
                <div className="mt-2 p-3 bg-emerald-50 rounded-lg text-emerald-800 text-sm">
                  Valor estimado ≈{" "}
                  <strong>USD {estimate.toLocaleString()}</strong> por tonelada
                  (si price = USD/kg y usando la fracción teórica del mineral).
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
