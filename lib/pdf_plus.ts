// lib/pdf_plus.ts — PDF General con sección económica y encabezados claros
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

const PRICE_USD_PER_KG: Record<string, number> = {
  Cobre: 9, Zinc: 3, Plomo: 2.2, Oro: 80000, Plata: 900,
};

function round2(n: number) { return Math.round(n * 100) / 100; }

function commodityRows(results: MineralResult[], adj: CommodityAdjustments) {
  // mapa mineral -> commodity
  const map: Record<string, string> = {
    "Malaquita": "Cobre", "Azurita": "Cobre", "Crisocola": "Cobre", "Cuprita": "Cobre",
    "Calcopirita": "Cobre", "Bornita": "Cobre",
    "Esfalerita": "Zinc",
    "Galena": "Plomo",
    "Oro": "Oro", "Electrum": "Oro", "Plata": "Plata", "Argentita": "Plata",
  };

  const agg = new Map<string, number>();
  for (const r of results) {
    const comm = map[r.name] || "";
    if (!comm) continue;
    agg.set(comm, (agg.get(comm) || 0) + r.pct);
  }
  const out: Array<[string, string, string, string, string]> = [];
  for (const [commodity, mixPct] of agg) {
    const pay = (adj as any)[commodity]?.payable ?? 0.96; // % metal pagable
    const payablePct = round2(mixPct * pay);
    const kgPerT = round2(payablePct * 10); // 1% en roca ~ 10 kg/t
    const price = PRICE_USD_PER_KG[commodity] ?? 0;
    const revenue = round2(kgPerT * price);
    out.push([
      commodity,
      `${payablePct.toFixed(2)} %`,
      `${kgPerT.toFixed(2)}`,
      price ? price.toString() : "--",
      revenue ? revenue.toFixed(2) : "--",
    ]);
  }
  return out;
}

export async function buildReportPdfPlus(a: BuildReportPlusArgs) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.setFont("helvetica", "");
  const marginX = 40;
  let y = 40;

  // Encabezado
  doc.setFontSize(16);
  doc.text(`${a.appName}`, marginX, y); y += 18;
  doc.setFontSize(12);
  doc.text(`Reporte de analisis — ${a.sampleCode}`, marginX, y); y += 16;
  doc.text(`Generado: ${new Date(a.generatedAt).toLocaleString()}`, marginX, y); y += 18;

  if (a.location) {
    doc.text(`Lat/Lng: ${a.location.lat.toFixed(6)}, ${a.location.lng.toFixed(6)}  (±${a.location.accuracy ?? 0} m)`, marginX, y); y += 14;
    if (a.location.address) { doc.text(`Direccion: ${a.location.address}`, marginX, y); y += 16; }
  }

  // Mezcla global
  autoTable(doc, {
    startY: y + 6,
    styles: { font: "helvetica", fontSize: 10 },
    head: [["Mezcla promediada (global)", " % "]],
    body: a.results.map(r => [r.name, `${r.pct.toFixed(2)}%`]),
    theme: "grid",
    headStyles: { fillColor: [230, 240, 255] },
    columnStyles: { 1: { halign: "right" } },
    margin: { left: marginX, right: marginX },
  });
  y = (doc as any).lastAutoTable.finalY + 12;

  // Por imagen
  const perImgRows: any[] = [];
  a.perImage.forEach((img, i) => {
    perImgRows.push([{ content: `${i + 1}. ${img.fileName}`, colSpan: 2, styles: { fillColor: [245,245,245] } }]);
    img.results.forEach(r => perImgRows.push([`• ${r.name}`, `${r.pct.toFixed(2)}%`]));
  });
  autoTable(doc, {
    startY: y,
    styles: { font: "helvetica", fontSize: 9 },
    head: [["Resultados por imagen", " % "]],
    body: perImgRows,
    theme: "grid",
    headStyles: { fillColor: [230, 240, 255] },
    columnStyles: { 1: { halign: "right", cellWidth: 60 } },
    margin: { left: marginX, right: marginX },
  });
  y = (doc as any).lastAutoTable.finalY + 12;

  // Interpretación preliminar
  const geology = a.interpretation?.geology || "-";
  const econ = a.interpretation?.economics || "-";
  const caveats = a.interpretation?.caveats || "-";

  autoTable(doc, {
    startY: y,
    styles: { font: "helvetica", fontSize: 10 },
    head: [["Interpretacion preliminar", "Detalle"]],
    body: [
      ["Geologia", geology],
      ["Economia", econ],
      ["Advertencias", caveats],
    ],
    theme: "grid",
    headStyles: { fillColor: [220, 240, 240] },
    columnStyles: { 0: { cellWidth: 100 }, 1: { cellWidth: 400 } },
    margin: { left: marginX, right: marginX },
  });
  y = (doc as any).lastAutoTable.finalY + 12;

  // Seccion economica
  const econRows = commodityRows(a.results, a.recoveryPayables);
  autoTable(doc, {
    startY: y,
    styles: { font: "helvetica", fontSize: 10 },
    head: [["Minerales comerciales y analisis economico", "", "", "", ""]],
    body: [],
    theme: "grid",
    headStyles: { fillColor: [230, 230, 230] },
    margin: { left: marginX, right: marginX },
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY,
    styles: { font: "helvetica", fontSize: 10 },
    head: [["Commodity", "% pagable (metal)", "kg/t (pagable)", "Precio ref. (USD/kg)", "Ingreso ref. (USD/t)"]],
    body: econRows.length ? econRows : [["—", "—", "—", "—", "—"]],
    theme: "grid",
    headStyles: { fillColor: [240, 248, 255] },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
    margin: { left: marginX, right: marginX },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // Nota (ASCII limpio)
  doc.setFontSize(9);
  doc.text(
    "Notas: calculo aproximado (2 decimales). 1% en roca ~ 10 kg/t. Precios de referencia orientativos;",
    marginX, y
  ); y += 12;
  doc.text(
    "verificar con analisis de laboratorio y terminos comerciales reales (payables, deducciones, penalidades).",
    marginX, y
  );
  y += 14;

  // Excluidas (si hay espacio)
  if (a.excluded && a.excluded.length) {
    autoTable(doc, {
      startY: y,
      styles: { font: "helvetica", fontSize: 9 },
      head: [["Imagenes excluidas", "Motivo"]],
      body: a.excluded.map(e => [e.fileName, e.reason]),
      theme: "grid",
      headStyles: { fillColor: [255, 243, 205] },
      margin: { left: marginX, right: marginX },
    });
  }

  return doc;
}
