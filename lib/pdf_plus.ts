// lib/pdf_plus.ts — PDF General con sección económica y encabezados legibles
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type MineralResult = { name: string; pct: number };
export type LatLng = { lat: number; lng: number; accuracy?: number; address?: string };

export type CommodityAdjustments = {
  Cobre?: { recovery: number; payable: number };
  Zinc?: { recovery: number; payable: number };
  Plomo?: { recovery: number; payable: number };
};

type BuildReportPlusArgs = {
  appName: string;
  sampleCode: string;
  results: MineralResult[];
  perImage: { fileName: string; results: MineralResult[] }[];
  imageDataUrls: string[];
  generatedAt: string;
  location?: LatLng;
  embedStaticMap?: boolean;
  recoveryPayables: CommodityAdjustments;
  interpretation?: { geology?: string; economics?: string; caveats?: string };
  excluded?: { fileName: string; reason: string }[];
};

// Referencias de precio muy simplificadas (USD/kg de metal pagable)
const PRICE_USD_PER_KG: Record<string, number> = {
  Cobre: 9,
  Zinc: 3,
  Plomo: 2.2,
  Oro: 80000,
  Plata: 900,
};

function round2(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return Math.round(v * 100) / 100;
}

// Normaliza string a clave canónica
function norm(s: string) {
  return String(s || "").trim().toLowerCase();
}

/**
 * Suma % de minerales por commodity considerando “payable”.
 * - 1 % en roca ≈ 10 kg/t (aprox.)
 * - Usa ajustes de payable si existen; si no, 96 % por defecto.
 * - Mapea minerales → commodity (insensible a mayúsculas).
 */
function commodityRows(results: MineralResult[], adj: CommodityAdjustments) {
  // mapa mineral -> commodity (en minúsculas para comparación)
  const mineralToComm: Record<string, string> = {
    // Cobre
    "malaquita": "Cobre",
    "azurita": "Cobre",
    "crisocola": "Cobre",
    "cuprita": "Cobre",
    "calcopirita": "Cobre",
    "bornita": "Cobre",
    // Zinc
    "esfalerita": "Zinc",
    // Plomo
    "galena": "Plomo",
    // Plata
    "plata": "Plata",
    "argentita": "Plata",
    "acantita": "Plata",
    // Oro
    "oro": "Oro",
    "oro nativo": "Oro",       // ✅ clave para tu caso
    "electrum": "Oro",
  };

  // Agrega por commodity
  const agg = new Map<string, number>();
  for (const r of results || []) {
    const comm = mineralToComm[norm(r.name)];
    if (!comm) continue;
    const pct = Number.isFinite(r.pct) ? r.pct : 0;
    agg.set(comm, (agg.get(comm) || 0) + pct);
  }

  // Construye filas
  const out: Array<[string, string, string, string, string]> = [];
  for (const [commodity, mixPct] of agg) {
    const payableDefault = 0.96;
    const payableCfg =
      commodity in (adj as any)
        ? (adj as any)[commodity]?.payable
        : undefined;
    const payable = Number.isFinite(payableCfg) ? payableCfg! : payableDefault;

    const payablePct = round2(mixPct * payable);
    const kgPerT = round2(payablePct * 10); // 1% ~ 10 kg/t
    const price = PRICE_USD_PER_KG[commodity] ?? 0;
    const revenue = round2(kgPerT * price);

    out.push([
      commodity,
      `${payablePct.toFixed(2)} %`,
      `${kgPerT.toFixed(2)}`,
      price ? price.toString() : "--",
      price ? revenue.toFixed(2) : "--",
    ]);
  }

  // Ordena por ingreso descendente para lectura
  out.sort((a, b) => {
    const revA = parseFloat(a[4].replace(/,/g, "")) || 0;
    const revB = parseFloat(b[4].replace(/,/g, "")) || 0;
    return revB - revA;
  });

  return out;
}

export async function buildReportPdfPlus(a: BuildReportPlusArgs) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.setFont("helvetica", "");
  const marginX = 40;
  let y = 40;

  // ===== Encabezado
  doc.setFontSize(16);
  doc.text(`${a.appName}`, marginX, y); y += 18;
  doc.setFontSize(12);
  doc.text(`Reporte de análisis — ${a.sampleCode}`, marginX, y); y += 16;
  doc.text(`Generado: ${new Date(a.generatedAt).toLocaleString()}`, marginX, y); y += 18;

  if (a.location) {
    const acc = a.location.accuracy ?? 0;
    doc.text(
      `Lat/Lng: ${a.location.lat.toFixed(6)}, ${a.location.lng.toFixed(6)}  (±${acc} m)`,
      marginX,
      y
    ); y += 14;
    if (a.location.address) {
      doc.text(`Dirección: ${a.location.address}`, marginX, y);
      y += 16;
    }
  }

  // ===== Mezcla global
  autoTable(doc, {
    startY: y + 6,
    styles: { font: "helvetica", fontSize: 10 },
    head: [["Mezcla promediada (global)", "%"]],
    body: (a.results || []).map(r => [r.name, `${(Number(r.pct) || 0).toFixed(2)}%`]),
    theme: "grid",
    headStyles: { fillColor: [230, 240, 255], textColor: [0, 0, 0] }, // ✅ texto negro
    columnStyles: { 1: { halign: "right" } },
    margin: { left: marginX, right: marginX },
  });
  y = (doc as any).lastAutoTable.finalY + 12;

  // ===== Por imagen
  const perImgRows: any[] = [];
  (a.perImage || []).forEach((img, i) => {
    perImgRows.push([{ content: `${i + 1}. ${img.fileName}`, colSpan: 2, styles: { fillColor: [245, 245, 245] } }]);
    (img.results || []).forEach(r =>
      perImgRows.push([`• ${r.name}`, `${(Number(r.pct) || 0).toFixed(2)}%`])
    );
  });
  autoTable(doc, {
    startY: y,
    styles: { font: "helvetica", fontSize: 9 },
    head: [["Resultados por imagen", "%"]],
    body: perImgRows,
    theme: "grid",
    headStyles: { fillColor: [230, 240, 255], textColor: [0, 0, 0] }, // ✅
    columnStyles: { 1: { halign: "right", cellWidth: 60 } },
    margin: { left: marginX, right: marginX },
  });
  y = (doc as any).lastAutoTable.finalY + 12;

  // ===== Interpretación preliminar
  const geology = a.interpretation?.geology || "-";
  const econ = a.interpretation?.economics || "-";
  const caveats = a.interpretation?.caveats || "-";

  autoTable(doc, {
    startY: y,
    styles: { font: "helvetica", fontSize: 10 },
    head: [["Interpretación preliminar", "Detalle"]],
    body: [
      ["Geología", geology],
      ["Economía", econ],
      ["Advertencias", caveats],
    ],
    theme: "grid",
    headStyles: { fillColor: [220, 240, 240], textColor: [0, 0, 0] }, // ✅
    columnStyles: { 0: { cellWidth: 110 }, 1: { cellWidth: 400 } },
    margin: { left: marginX, right: marginX },
  });
  y = (doc as any).lastAutoTable.finalY + 12;

  // ===== Sección económica
  const econRows = commodityRows(a.results || [], a.recoveryPayables || {});
  // Título de bloque
  autoTable(doc, {
    startY: y,
    styles: { font: "helvetica", fontSize: 10 },
    head: [["Minerales comerciales y análisis económico", "", "", "", ""]],
    body: [],
    theme: "grid",
    headStyles: { fillColor: [230, 230, 230], textColor: [0, 0, 0] }, // ✅
    margin: { left: marginX, right: marginX },
  });

  // Tabla de datos
  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY,
    styles: { font: "helvetica", fontSize: 10 },
    head: [["Commodity", "% pagable (metal)", "kg/t (pagable)", "Precio ref. (USD/kg)", "Ingreso ref. (USD/t)"]],
    body: econRows.length ? econRows : [["—", "—", "—", "—", "—"]],
    theme: "grid",
    headStyles: { fillColor: [240, 248, 255], textColor: [0, 0, 0] }, // ✅
    columnStyles: {
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
    },
    margin: { left: marginX, right: marginX },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // Nota aclaratoria
  doc.setFontSize(9);
  doc.text(
    "Notas: cálculo aproximado (2 decimales). 1% en roca ≈ 10 kg/t. Precios de referencia orientativos;",
    marginX,
    y
  ); y += 12;
  doc.text(
    "verificar con análisis de laboratorio y términos comerciales reales (payables, deducciones, penalidades).",
    marginX,
    y
  );
  y += 14;

  // ===== Imágenes excluidas
  if (a.excluded && a.excluded.length) {
    autoTable(doc, {
      startY: y,
      styles: { font: "helvetica", fontSize: 9 },
      head: [["Imágenes excluidas", "Motivo"]],
      body: a.excluded.map(e => [e.fileName, e.reason]),
      theme: "grid",
      headStyles: { fillColor: [255, 243, 205], textColor: [0, 0, 0] }, // ✅
      margin: { left: marginX, right: marginX },
    });
  }

  return doc;
}
