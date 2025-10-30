// lib/pdf_plus.ts — PDF General con economía, interpretación dinámica y encabezados legibles
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type MineralResult = { name: string; pct: number };
export type LatLng = { lat: number; lng: number; accuracy?: number; address?: string };

export type CommodityAdjustments = {
  Cobre?: { recovery: number; payable: number };
  Zinc?: { recovery: number; payable: number };
  Plomo?: { recovery: number; payable: number };
  // Si en el futuro quieres payables por Oro/Plata, se pueden añadir aquí.
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
  // Referenciales
  Cobre: 9,
  Zinc: 3,
  Plomo: 2.2,
  Oro: 80000,
  Plata: 900,
};

const HEAD_FILL = [230, 240, 255] as [number, number, number];
const HEAD_TEXT = [0, 0, 0] as [number, number, number];

function round2(n: number) { return Math.round(n * 100) / 100; }
function pct(v: number) { return `${v.toFixed(2)} %`; }

/** Normaliza nombre -> commodity (ES/EN y variantes) */
function mineralToCommodity(nameRaw: string): string | "" {
  const n = (nameRaw || "").toLowerCase().trim();

  // Cobre
  if (["calcopirita","chalcopyrite","bornita","bornite","cuprita","cuprite",
       "malaquita","malachite","azurita","azurite","crisocola","chrysocolla"].includes(n)) return "Cobre";

  // Zinc
  if (["esfalerita","sphalerite"].includes(n)) return "Zinc";

  // Plomo
  if (["galena","galena argentifera","argentiferous galena"].includes(n)) return "Plomo";

  // Plata (minerales de plata más comunes + nombre directo)
  if (["plata","silver","argentita","acanthite"].includes(n)) return "Plata";

  // Oro
  if (["oro","gold","oro nativo","native gold","electrum"].includes(n)) return "Oro";

  // Ignorar silicatos / óxidos comunes / piritas sin metal pagable directo
  // (cuarzo, hematita, magnetita, pirita, goethita, iron oxides, etc.)
  return "";
}

/** Suma % por commodity en base a resultados */
function commodityMix(results: MineralResult[]) {
  const agg = new Map<string, number>();
  for (const r of results) {
    const c = mineralToCommodity(r.name);
    if (!c) continue;
    agg.set(c, (agg.get(c) || 0) + (r.pct || 0));
  }
  return agg; // commodity -> % en mezcla
}

/** Construye filas económicas a partir de la mezcla por commodity */
function commodityRows(results: MineralResult[], adj: CommodityAdjustments) {
  const mix = commodityMix(results);
  const out: Array<[string, string, string, string, string]> = [];
  for (const [commodity, mixPct] of mix) {
    // Payables/recuperación: si no hay ajuste específico, usar 96% como fallback genérico
    const pay =
      (adj as any)[commodity]?.payable ??
      (commodity === "Cobre" ? 0.96 :
       commodity === "Zinc"  ? 0.85 :
       commodity === "Plomo" ? 0.90 : 0.96);

    const payablePct = round2(mixPct * pay);
    const kgPerT = round2(payablePct * 10); // 1% ≈ 10 kg/t
    const price = PRICE_USD_PER_KG[commodity] ?? 0;
    const revenue = round2(kgPerT * price);

    out.push([
      commodity,
      pct(payablePct),
      kgPerT.toFixed(2),
      price ? String(price) : "—",
      revenue ? revenue.toFixed(2) : "—",
    ]);
  }
  return out;
}

/** Interpretación simple si no viene desde el front */
function buildHeuristicInterpretation(results: MineralResult[]): { geology: string; economics: string; caveats: string } {
  const mix = commodityMix(results);
  const oro = mix.get("Oro") || 0;
  const cu  = mix.get("Cobre") || 0;
  const pb  = mix.get("Plomo") || 0;
  const zn  = mix.get("Zinc") || 0;
  const ag  = mix.get("Plata") || 0;

  let geology = "Asociación general; verificar paragénesis con microscopía.";
  let economics = "Sin metal dominante aparente; confirmar en laboratorio multi-elemento.";
  if (oro > cu && oro > pb && oro > zn) {
    geology   = "Textura compatible con vetas cuarzo-sulfuro con posible Au (oro visible o aurífero en sulfuros).";
    economics = "Potencial aurífero si la ley es pagable; confirmar con ensayo al fuego (Au/Ag).";
  } else if (cu > oro && cu >= pb && cu >= zn) {
    geology   = "Sulfos de cobre (calcopirita/bornita) con acompañantes Fe-oxidados.";
    economics = "Potencial cuprífero si % y tonelaje justifican; aplicar payables/penalidades de contrato.";
  } else if (pb + zn > oro && pb + zn > cu) {
    geology   = "Tendencia polimetálica Pb-Zn (galena/esfalerita) con sulfuros Fe.";
    economics = "Posible circuito Pb-Zn; evaluar penalidades/bonificaciones (Ag) y recuperaciones.";
  }

  const caveats =
    "Estimación visual asistida por IA. Confirmar Au/Ag con ensayo al fuego e ICP/AA para base metals. " +
    "Considerar heterogeneidad y representatividad de la muestra.";

  return { geology, economics, caveats };
}

/** Dibujar sección Mapa (texto + enlace) para que no “desaparezca” */
function drawMapBlock(doc: jsPDF, x: number, y: number, w: number, h: number, loc?: LatLng) {
  doc.setDrawColor(180);
  doc.rect(x, y, w, h);
  doc.setFontSize(10);
  doc.text("Mapa (previsualización)", x + 8, y + 16);
  if (loc) {
    const gmaps = `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;
    doc.setFontSize(9);
    doc.text(`Abrir en Google Maps: ${gmaps}`, x + 8, y + 32, { maxWidth: w - 16 });
  }
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
  doc.text(`Reporte de análisis — ${a.sampleCode}`, marginX, y); y += 16;
  doc.text(`Generado: ${new Date(a.generatedAt).toLocaleString()}`, marginX, y); y += 18;

  if (a.location) {
    doc.text(
      `Lat/Lng: ${a.location.lat.toFixed(6)}, ${a.location.lng.toFixed(6)}  (±${a.location.accuracy ?? 0} m)`,
      marginX, y
    ); y += 14;
    if (a.location.address) { doc.text(`Dirección: ${a.location.address}`, marginX, y); y += 16; }
  }

  // Pequeño bloque de “mapa”
  drawMapBlock(doc, marginX, y, 240, 90, a.location);
  y += 100;

  // Mezcla global
  autoTable(doc, {
    startY: y + 6,
    styles: { font: "helvetica", fontSize: 10 },
    head: [["Mezcla promediada (global)", "%"]],
    body: a.results.map(r => [r.name, `${r.pct.toFixed(2)}%`]),
    theme: "grid",
    headStyles: { fillColor: HEAD_FILL, textColor: HEAD_TEXT },
    columnStyles: { 1: { halign: "right" } },
    margin: { left: marginX, right: marginX },
  });
  y = (doc as any).lastAutoTable.finalY + 12;

  // Por imagen
  const perImgRows: any[] = [];
  a.perImage.forEach((img, i) => {
    perImgRows.push([{ content: `${i + 1}. ${img.fileName}`, colSpan: 2, styles: { fillColor: [245,245,245], textColor: [0,0,0] } }]);
    img.results.forEach(r => perImgRows.push([`• ${r.name}`, `${r.pct.toFixed(2)}%`]));
  });
  autoTable(doc, {
    startY: y,
    styles: { font: "helvetica", fontSize: 9 },
    head: [["Resultados por imagen", "%"]],
    body: perImgRows,
    theme: "grid",
    headStyles: { fillColor: HEAD_FILL, textColor: HEAD_TEXT },
    columnStyles: { 1: { halign: "right", cellWidth: 60 } },
    margin: { left: marginX, right: marginX },
  });
  y = (doc as any).lastAutoTable.finalY + 12;

  // Interpretación (dinámica si no llega desde el front)
  const interp = a.interpretation ?? buildHeuristicInterpretation(a.results);
  autoTable(doc, {
    startY: y,
    styles: { font: "helvetica", fontSize: 10 },
    head: [["Interpretación preliminar", "Detalle"]],
    body: [
      ["Geología",   interp.geology || "-"],
      ["Economía",   interp.economics || "-"],
      ["Advertencias", interp.caveats || "-"],
    ],
    theme: "grid",
    headStyles: { fillColor: [220, 240, 240], textColor: HEAD_TEXT },
    columnStyles: { 0: { cellWidth: 110 }, 1: { cellWidth: 420 } },
    margin: { left: marginX, right: marginX },
  });
  y = (doc as any).lastAutoTable.finalY + 12;

  // Sección económica (con encabezado claro + tabla)
  autoTable(doc, {
    startY: y,
    styles: { font: "helvetica", fontSize: 10 },
    head: [["Minerales comerciales y análisis económico", "", "", "", ""]],
    body: [],
    theme: "grid",
    headStyles: { fillColor: [230, 230, 230], textColor: HEAD_TEXT },
    margin: { left: marginX, right: marginX },
  });

  const econRows = commodityRows(a.results, a.recoveryPayables);
  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY,
    styles: { font: "helvetica", fontSize: 10 },
    head: [["Commodity", "% pagable (metal)", "kg/t (pagable)", "Precio ref. (USD/kg)", "Ingreso ref. (USD/t)"]],
    body: econRows.length ? econRows : [["—", "—", "—", "—", "—"]],
    theme: "grid",
    headStyles: { fillColor: [240, 248, 255], textColor: HEAD_TEXT },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
    margin: { left: marginX, right: marginX },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  // Nota
  doc.setFontSize(9);
  doc.text(
    "Notas: cálculo aproximado (2 decimales). 1% en roca ≈ 10 kg/t. Precios referenciales;",
    marginX, y
  ); y += 12;
  doc.text(
    "verificar con análisis de laboratorio y términos comerciales reales (payables, deducciones, penalidades).",
    marginX, y
  );
  y += 14;

  // Imágenes excluidas (si aplica)
  if (a.excluded && a.excluded.length) {
    autoTable(doc, {
      startY: y,
      styles: { font: "helvetica", fontSize: 9 },
      head: [["Imágenes excluidas", "Motivo"]],
      body: a.excluded.map(e => [e.fileName, e.reason]),
      theme: "grid",
      headStyles: { fillColor: [255, 243, 205], textColor: HEAD_TEXT },
      margin: { left: marginX, right: marginX },
    });
  }

  return doc;
}
