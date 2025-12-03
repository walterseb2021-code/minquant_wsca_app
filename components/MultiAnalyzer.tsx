// mineral-app/components/MultiAnalyzer.tsx
// -------------------------------------------------------------
// MultiAnalyzer (completo)
// - Genera PDF individual (ficha) y PDF general (tabla) usando lib/pdf.ts.
// - Validación básica de datos (precio >= 0, ley 0..100).
// - Edición de filas para el reporte general: agregar, modificar, eliminar.
// -------------------------------------------------------------

"use client";

import React, { useMemo, useState } from "react";
import {
  buildMineralPdf,
  buildGeneralReportPdf,
  downloadPdf,
  type CurrencyCode,
} from "../lib/pdf";

// -------------- Tipos --------------
type MineralRow = {
  name: string;
  gradePct?: number | null;
  pricePerUnit?: number | null;
};

// -------------- Utils locales --------------
function parseNumberOrNull(v: string): number | null {
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

// -------------- Componente principal --------------
export default function MultiAnalyzer() {
  // --------- Estados para la FICHA individual ---------
  const [mineralName, setMineralName] = useState<string>("Calcita");
  const [price, setPrice] = useState<string>("38.40");
  const [samplePct, setSamplePct] = useState<string>("12.50");
  const [currency, setCurrency] = useState<CurrencyCode>("USD");

  const [busyOne, setBusyOne] = useState(false);

  // --------- Lista para el REPORTE GENERAL ----------
  const [rows, setRows] = useState<MineralRow[]>([
    { name: "Calcita", gradePct: 12.5, pricePerUnit: 38.4 },
    { name: "Cuarzo", gradePct: 8.1, pricePerUnit: 22.0 },
    { name: "Feldespato", gradePct: 6.0, pricePerUnit: 30.2 },
  ]);

  const [busyGeneral, setBusyGeneral] = useState(false);

  // --------- Validación ficha individual ----------
  const priceNum = useMemo(() => parseNumberOrNull(price), [price]);
  const pctNum = useMemo(() => parseNumberOrNull(samplePct), [samplePct]);

  const priceValid = priceNum != null && priceNum >= 0;
  const pctValid = pctNum != null && pctNum >= 0 && pctNum <= 100;
  const canExportOne = !!mineralName && priceValid && pctValid;

  // --------- Acciones ficha individual ----------
  async function handleExportFicha() {
    if (!canExportOne) return;
    try {
      setBusyOne(true);
      const bytes = await buildMineralPdf({
        mineralName,
        price: priceNum!,
        samplePct: pctNum!,
        currency,
        notes:
          "Observaciones de ejemplo. Sustituye por tus notas reales.",
      });
      downloadPdf(bytes, `Ficha_${mineralName}.pdf`);
    } finally {
      setBusyOne(false);
    }
  }

  // --------- Edición de filas (reporte general) ----------
  function updateRow(index: number, patch: Partial<MineralRow>) {
    setRows((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...patch };
      return copy;
    });
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      { name: "", gradePct: null, pricePerUnit: null },
    ]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function clearRows() {
    setRows([]);
  }

  // --------- Validación general (reporte general) ----------
  const rowsValid = useMemo(() => {
    if (!rows.length) return false;
    // Requiere que cada fila tenga nombre y %/precio en rango o null
    return rows.every((r) => {
      const nameOk = typeof r.name === "string";
      const gradeOk =
        r.gradePct == null ||
        (typeof r.gradePct === "number" &&
          r.gradePct >= 0 &&
          r.gradePct <= 100);
      const priceOk =
        r.pricePerUnit == null ||
        (typeof r.pricePerUnit === "number" && r.pricePerUnit >= 0);
      return nameOk && gradeOk && priceOk;
    });
  }, [rows]);

  // --------- Exportar reporte general ----------
  async function handleExportGeneral() {
    if (!rowsValid) {
      alert(
        "Revisa los datos del reporte general (nombres y límites de %/precio)."
      );
      return;
    }
    try {
      setBusyGeneral(true);
      const bytes = await buildGeneralReportPdf({
        title: "Reporte General de Minerales",
        currency,
        rows,
      });
      downloadPdf(bytes, `Reporte_General_${currency}.pdf`);
    } finally {
      setBusyGeneral(false);
    }
  }

  // --------- Render helpers ----------
  function renderRow(r: MineralRow, i: number) {
    const gradeStr = r.gradePct != null ? String(r.gradePct) : "";
    const priceStr = r.pricePerUnit != null ? String(r.pricePerUnit) : "";

    const gradeInvalid =
      r.gradePct != null &&
      !(r.gradePct >= 0 && r.gradePct <= 100);
    const priceInvalid =
      r.pricePerUnit != null && !(r.pricePerUnit >= 0);

    return (
      <tr key={i} className="border-b">
        <td className="px-3 py-2 align-top">
          <input
            type="text"
            value={r.name}
            onChange={(e) => updateRow(i, { name: e.target.value })}
            className="border rounded px-2 py-1 w-full"
            placeholder="Nombre del mineral"
          />
        </td>
        <td className="px-3 py-2 align-top">
          <input
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={gradeStr}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") return updateRow(i, { gradePct: null });
              const num = parseNumberOrNull(v);
              updateRow(i, {
                gradePct: num == null ? null : clamp(num, 0, 100),
              });
            }}
            className={`border rounded px-2 py-1 w-full text-right ${
              gradeInvalid ? "border-red-500" : ""
            }`}
            placeholder="0.00"
          />
          {gradeInvalid && (
            <div className="text-xs text-red-600 mt-1">
              Debe estar entre 0 y 100.
            </div>
          )}
        </td>
        <td className="px-3 py-2 align-top">
          <input
            type="number"
            min={0}
            step="0.01"
            value={priceStr}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "")
                return updateRow(i, { pricePerUnit: null });
              const num = parseNumberOrNull(v);
              updateRow(i, {
                pricePerUnit: num == null ? null : Math.max(0, num),
              });
            }}
            className={`border rounded px-2 py-1 w-full text-right ${
              priceInvalid ? "border-red-500" : ""
            }`}
            placeholder="0.00"
          />
          {priceInvalid && (
            <div className="text-xs text-red-600 mt-1">
              Debe ser un número ≥ 0.
            </div>
          )}
        </td>
        <td className="px-3 py-2 align-top">
          <button
            onClick={() => removeRow(i)}
            className="text-sm px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
            title="Eliminar fila"
          >
            Eliminar
          </button>
        </td>
      </tr>
    );
  }

  // --------- UI ----------
  return (
    <div className="p-5 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">
        MultiAnalyzer – PDFs
      </h1>
      <p className="text-sm text-gray-600">
        Pantalla para probar el PDF individual (ficha) y el PDF general
        (lista).
      </p>

      {/* BLOQUE: Ficha individual */}
      <section className="mt-6 p-4 border rounded-xl">
        <h2 className="text-lg font-semibold mb-3">
          Ficha individual
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-600">
              Nombre del mineral
            </span>
            <input
              type="text"
              value={mineralName}
              onChange={(e) => setMineralName(e.target.value)}
              className="border rounded px-3 py-2"
              placeholder="Ej. Calcita"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-600">Moneda</span>
            <select
              value={currency}
              onChange={(e) =>
                setCurrency(e.target.value as CurrencyCode)
              }
              className="border rounded px-3 py-2"
            >
              <option value="USD">USD (US$)</option>
              <option value="PEN">PEN (S/.)</option>
              <option value="EUR">EUR (€)</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-600">
              Precio por unidad
            </span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className={`border rounded px-3 py-2 ${
                !priceValid && price !== ""
                  ? "border-red-500"
                  : ""
              }`}
              placeholder="0.00"
            />
            {!priceValid && price !== "" && (
              <span className="text-xs text-red-600">
                Debe ser un número ≥ 0.
              </span>
            )}
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-gray-600">
              Ley de muestra (%)
            </span>
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={samplePct}
              onChange={(e) => setSamplePct(e.target.value)}
              className={`border rounded px-3 py-2 ${
                !pctValid && samplePct !== ""
                  ? "border-red-500"
                  : ""
              }`}
              placeholder="0.00"
            />
            {!pctValid && samplePct !== "" && (
              <span className="text-xs text-red-600">
                Debe estar entre 0 y 100.
              </span>
            )}
          </label>
        </div>

        <div className="mt-4">
          <button
            onClick={handleExportFicha}
            disabled={!canExportOne || busyOne}
            className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busyOne ? "Generando…" : "Descargar PDF (mineral)"}
          </button>
        </div>
      </section>

      {/* BLOQUE: Reporte general */}
      <section className="mt-6 p-4 border rounded-xl">
        <h2 className="text-lg font-semibold mb-3">
          Reporte general
        </h2>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="text-left px-3 py-2 w-[40%]">
                  Mineral
                </th>
                <th className="text-right px-3 py-2 w-[20%]">
                  % Ley
                </th>
                <th className="text-right px-3 py-2 w-[25%]">
                  Precio
                </th>
                <th className="text-right px-3 py-2 w-[15%]">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => renderRow(r, i))}
              {rows.length === 0 && (
                <tr>
                  <td
                    className="px-3 py-3 text-gray-500"
                    colSpan={4}
                  >
                    No hay filas. Agrega al menos una para
                    exportar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={addRow}
            className="px-3 py-2 rounded bg-gray-800 text-white hover:bg-gray-900"
          >
            Agregar fila
          </button>
          <button
            onClick={clearRows}
            className="px-3 py-2 rounded bg-gray-200 hover:bg-gray-300"
          >
            Limpiar tabla
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">
              Moneda
            </label>
            <select
              value={currency}
              onChange={(e) =>
                setCurrency(e.target.value as CurrencyCode)
              }
              className="border rounded px-3 py-2"
            >
              <option value="USD">USD (US$)</option>
              <option value="PEN">PEN (S/.)</option>
              <option value="EUR">EUR (€)</option>
            </select>
            <button
              onClick={handleExportGeneral}
              disabled={busyGeneral || !rowsValid}
              className="px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {busyGeneral ? "Generando…" : "Exportar PDF general"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
