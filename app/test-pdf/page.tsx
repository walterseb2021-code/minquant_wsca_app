// mineral-app/app/test-pdf/page.tsx
"use client";

import React, { useState } from "react";
// Importa desde lib/pdf.ts con el nombre correcto: buildReportPdf
import {
  buildMineralPdf,
  buildReportPdf,
  downloadPdf,
  type CurrencyCode,
} from "../../lib/pdf";

export default function TestPdfPage() {
  const [busyOne, setBusyOne] = useState(false);
  const [busyGeneral, setBusyGeneral] = useState(false);

  // DEMO: datos de ejemplo
  const mineralName = "Calcita";
  const price = 38.4;      // Ejemplo: 38.40 USD/t
  const leyPct = 12.5;     // Ejemplo: 12.50 %
  const currency: CurrencyCode = "USD";

  const rows = [
    { name: "Calcita", gradePct: 12.5, pricePerUnit: 38.4 },
    { name: "Cuarzo",  gradePct:  8.1, pricePerUnit: 22.0 },
    { name: "Feldespato", gradePct: 6.0, pricePerUnit: 30.2 },
  ];

  async function handleMineralPdf() {
    try {
      setBusyOne(true);
      const bytes = await buildMineralPdf({
        mineralName,
        price,
        samplePct: leyPct,
        currency,
        notes: "Ejemplo de observaciones de la ficha.",
      });
      downloadPdf(bytes, `Ficha_${mineralName}.pdf`);
    } finally {
      setBusyOne(false);
    }
  }

  async function handleGeneralPdf() {
    try {
      setBusyGeneral(true);
      const bytes = await buildReportPdf({
        title: "Reporte General de Minerales (DEMO)",
        currency,
        rows,
      });
      downloadPdf(bytes, `Reporte_General_${currency}.pdf`);
    } finally {
      setBusyGeneral(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 700, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 12 }}>
        Prueba de PDFs — MinQuant_WSCA
      </h1>

      <p style={{ marginBottom: 8 }}>
        Esta página genera PDFs <b>de prueba</b> usando las funciones nuevas de <code>lib/pdf.ts</code>.
      </p>

      <div style={{ marginTop: 16, padding: 12, border: "1px solid #e5e7eb", borderRadius: 8 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>PDF individual (ficha)</h2>
        <div style={{ fontSize: 14, marginBottom: 8 }}>
          <div><b>Mineral:</b> {mineralName}</div>
          <div><b>Precio:</b> {price} {currency}</div>
          <div><b>Ley (%):</b> {leyPct}</div>
        </div>
        <button
          onClick={handleMineralPdf}
          disabled={busyOne}
          style={{
            background: "#2563eb",
            color: "#fff",
            padding: "8px 14px",
            borderRadius: 8,
            border: "none",
            cursor: busyOne ? "not-allowed" : "pointer"
          }}
        >
          {busyOne ? "Generando…" : "Descargar PDF (mineral)"}
        </button>
      </div>

      <div style={{ marginTop: 16, padding: 12, border: "1px solid #e5e7eb", borderRadius: 8 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>PDF general (lista)</h2>
        <ul style={{ marginTop: 4, marginBottom: 8, paddingLeft: 18 }}>
          {rows.map((r) => (
            <li key={r.name}>
              <b>{r.name}</b> — Ley: {r.gradePct ?? "-"}% — Precio: {r.pricePerUnit ?? "-"} {currency}
            </li>
          ))}
        </ul>
        <button
          onClick={handleGeneralPdf}
          disabled={busyGeneral}
          style={{
            background: "#059669",
            color: "#fff",
            padding: "8px 14px",
            borderRadius: 8,
            border: "none",
            cursor: busyGeneral ? "not-allowed" : "pointer"
          }}
        >
          {busyGeneral ? "Generando…" : "Exportar PDF general"}
        </button>
      </div>

      <p style={{ marginTop: 16, fontSize: 12, color: "#6b7280" }}>
        * Si descarga, las funciones de <code>lib/pdf.ts</code> están integradas correctamente.
      </p>
    </div>
  );
}
