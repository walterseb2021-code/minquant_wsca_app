// lib/pdf.ts — PDFs para MinQuant_WSCA (portada + mapa OSM + tablas + ficha + análisis económico)
import jsPDF from "jspdf";
import autoTable, { RowInput } from "jspdf-autotable";
import { getMineralInfo } from "./minerals";

export type MineralResult = { name: string; pct: number; confidence?: number };
export type CurrencyCode = "USD" | "PEN" | "EUR";

/* =========================================================================
   HELPERS GENERALES
   ========================================================================= */

// Imagen Blob -> dataURL (compatible con jsPDF.addImage)
async function blobToDataURL(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = reject;
    fr.readAsDataURL(b);
  });
}

// Proxy a nuestro endpoint de mapa estático OSM -> dataURL (PNG)
async function fetchStaticMapDataUrl(lat: number, lng: number, zoom = 14, size = "900x380") {
  const url = `/api/staticmap?lat=${lat}&lng=${lng}&zoom=${zoom}&size=${size}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`staticmap ${res.status}`);
  const blob = await res.blob();
  return blobToDataURL(blob);
}

function normalizeTo100(results: MineralResult[]): MineralResult[] {
  const sum = results.reduce((a, b) => a + (b.pct || 0), 0);
  if (sum <= 0) return results.map((r) => ({ ...r, pct: 0 }));
  const scaled = results.map((r) => ({ ...r, pct: (r.pct / sum) * 100 }));
  const rounded = scaled.map((r) => ({ ...r, pct: Math.round(r.pct * 100) / 100 }));
  let tot = +(rounded.reduce((a, b) => a + b.pct, 0).toFixed(2));
  const diff = +(100 - tot).toFixed(2);
  if (diff !== 0 && rounded.length) {
    const iMax = rounded.reduce((idx, r, i, arr) => (r.pct > arr[idx].pct ? i : idx), 0);
    rounded[iMax] = { ...rounded[iMax], pct: +(rounded[iMax].pct + diff).toFixed(2) };
  }
  return rounded;
}

function safeTxt(v: unknown): string {
  return v == null ? "" : String(v);
}

function titleCase(s: string) {
  if (!s) return s;
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
}

/* =========================================================================
   COLORES / ESTILO
   ========================================================================= */
const TITLE_COLOR = "#0ea5e9"; // cyan-500
const ACCENT = "#10b981";      // emerald-500
const LIGHT = "#f3f4f6";       // gray-100
const DARK = "#111827";        // gray-900

/* =========================================================================
   PRECIOS DE COMMODITIES (DINÁMICO + RESPALDO)
   ========================================================================= */

/** Respaldo interno (USD/t de metal fino) — se usa si falla la fuente remota */
const FALLBACK_COMMODITY_PRICE_USD: Record<string, number> = {
  Oro: 70000000,     // aprox. 70k USD/oz * 32150 oz/t (ajusta a tu criterio)
  Plata: 800000,     // 25 USD/oz * 32150 oz/t
  Cobre: 9000,
  Aluminio: 2300,
  Zinc: 2600,
  Plomo: 2200,
  Estaño: 25000,
  Níquel: 17000,
};

/** Orden de prioridad para elegir hasta 5 minerales comerciales */
const COMMERCIAL_ORDER = [
  "Oro", "Plata", "Cobre", "Aluminio", "Zinc", "Plomo", "Estaño", "Níquel",
];

type CommodityPrices = { prices: Record<string, number>; currency: CurrencyCode; updatedAt?: string };

/** 
 * Intenta obtener precios desde /api/commodity-prices (dinámico),
 * si falla retorna el respaldo interno (USD).
 */
async function getCommodityPrices(): Promise<CommodityPrices> {
  try {
    const r = await fetch("/api/commodity-prices?currency=USD", { cache: "no-store" });
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as CommodityPrices;
    if (!j?.prices || typeof j.prices !== "object") throw new Error("bad schema");
    return j;
  } catch {
    return { prices: FALLBACK_COMMODITY_PRICE_USD, currency: "USD", updatedAt: undefined };
  }
}

function fmtMoney(v: number, currency: CurrencyCode = "USD") {
  try {
    return new Intl.NumberFormat("es-PE", { style: "currency", currency }).format(v);
  } catch {
    return `${currency} ${v.toLocaleString()}`;
  }
}

type CommodityRow = { mineral: string; gradePct: number; price: number; estValue: number };

/** Selecciona hasta 5 minerales comerciales presentes en los resultados globales */
function pickTopCommercial(global: MineralResult[], market: Record<string, number>): CommodityRow[] {
  const byName = new Map<string, number>();
  for (const g of global) byName.set(titleCase(g.name), g.pct || 0);

  const rows: CommodityRow[] = [];
  for (const name of COMMERCIAL_ORDER) {
    const pct = byName.get(name);
    if (typeof pct === "number" && pct > 0) {
      const price = market[name] ?? 0;
      rows.push({ mineral: name, gradePct: pct, price, estValue: 0 });
    }
    if (rows.length >= 5) break;
  }
  return rows;
}

/** Valor estimado por tonelada de mineral: (ley%/100) * precio(USD/t metal) */
function estimateCommodityValue(rows: CommodityRow[]): CommodityRow[] {
  return rows.map((r) => ({
    ...r,
    estValue: Math.max(0, Math.round(((r.gradePct / 100) * (r.price || 0)) * 100) / 100),
  }));
}

function viabilityFromTotalUSDPerTonne(v: number): "Baja" | "Media" | "Alta" {
  if (v >= 100) return "Alta";
  if (v >= 30) return "Media";
  return "Baja";
}

function autoRecommendation(totalUSDPerTonne: number) {
  const nivel = viabilityFromTotalUSDPerTonne(totalUSDPerTonne);
  if (nivel === "Alta") {
    return {
      nivel,
      texto:
        "Recomendado avanzar a muestreo representativo, QA/QC y pruebas metalúrgicas; evaluar logística y permisos para la siguiente fase.",
    };
  }
  if (nivel === "Media") {
    return {
      nivel,
      texto:
        "Continuar con exploración dirigida; levantar leyes con mayor densidad de muestreo y validar recuperación metalúrgica antes de escalar.",
    };
  }
  return {
    nivel,
    texto:
      "Por ahora no recomendable; priorizar prospección adicional, revisar costos operativos y buscar indicios de zonas con mayor ley.",
  };
}

/* =========================================================================
   PDF GENERAL
   ========================================================================= */
type BuildReportOptions = {
  appName: string;
  sampleCode: string;
  results: MineralResult[];
  perImage: { fileName: string; results: MineralResult[] }[];
  imageDataUrls: string[];
  generatedAt: string; // ISO
  location?: { lat: number; lng: number; accuracy?: number; address?: string };
  embedStaticMap?: boolean;
  currency?: CurrencyCode; // opcional; por ahora los precios vienen en USD
};

export async function buildReportPdf(opts: BuildReportOptions) {
  const {
    appName,
    sampleCode,
    results,
    perImage,
    imageDataUrls,
    generatedAt,
    location,
    embedStaticMap,
    currency = "USD",
  } = opts;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 40;
  let y = 56;

  // ===== Portada =====
  doc.setFont("helvetica", "bold");
  doc.setTextColor(TITLE_COLOR);
  doc.setFontSize(20);
  doc.text(appName, marginX, y);
  y += 28;

  doc.setFontSize(16);
  doc.setTextColor(DARK);
  doc.text(`Reporte de análisis — Muestra ${sampleCode}`, marginX, y);
  y += 22;

  const dt = new Date(generatedAt || Date.now());
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor("#374151");
  doc.text(`Generado: ${dt.toLocaleString()}`, marginX, y);
  y += 18;

  if (location) {
    const locLines = [
      location.address ? `Dirección: ${location.address}` : "",
      `Lat/Lng: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}${
        location.accuracy ? `  — Precisión: ±${Math.round(location.accuracy)} m` : ""
      }`,
    ].filter(Boolean);
    for (const line of locLines) {
      doc.text(line, marginX, y);
      y += 16;
    }
  }

  // ===== Mapa estático (opcional) en la portada =====
  if (embedStaticMap && location) {
    try {
      const map = await fetchStaticMapDataUrl(location.lat, location.lng, 14, "900x380");
      const imgW = pageW - marginX * 2;
      const imgH = (imgW * 380) / 900;
      y += 8;
      doc.addImage(map, "PNG", marginX, y, imgW, imgH);
      y += imgH + 14;
    } catch {
      y += 8;
      doc.text("Mapa no disponible (proxy OSM).", marginX, y);
      y += 16;
    }
  } else {
    y += 8;
  }

  // ===== Global =====
  doc.setFont("helvetica", "bold");
  doc.setTextColor(ACCENT);
  doc.setFontSize(12);
  doc.text("Mezcla promediada (global)", marginX, y);
  y += 10;

  const global = normalizeTo100(results).map((r) => [titleCase(r.name), r.pct.toFixed(2)]) as RowInput[];

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    headStyles: { fillColor: LIGHT as any, textColor: DARK as any, halign: "left" as any },
    styles: { fontSize: 11 },
    head: [["Mineral", "%"]],
    body: global,
  });

  y = ((doc as any).lastAutoTable?.finalY || y) + 18;

  // ===== Miniaturas =====
  const thumbsPerRow = 4;
  const thumbGap = 10;
  const thumbW = (pageW - marginX * 2 - thumbGap * (thumbsPerRow - 1)) / thumbsPerRow;
  const thumbH = thumbW * 0.6;

  if (y + thumbH + 40 > pageH) {
    doc.addPage();
    y = 56;
  }

  doc.setFont("helvetica", "bold");
  doc.setTextColor(ACCENT);
  doc.setFontSize(12);
  doc.text("Miniaturas de la muestra", marginX, y);
  y += 12;

  for (let i = 0; i < imageDataUrls.length; i++) {
    const row = Math.floor(i / thumbsPerRow);
    const col = i % thumbsPerRow;
    const x = marginX + col * (thumbW + thumbGap);
    const yy = y + row * (thumbH + 24);
    try {
      doc.addImage(imageDataUrls[i], "JPEG", x, yy, thumbW, thumbH);
    } catch {
      // ignoramos errores de formato
    }
  }

  // ===== Resultados por imagen =====
  doc.addPage();
  let y2 = 56;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(TITLE_COLOR);
  doc.setFontSize(16);
  doc.text("Resultados por imagen", marginX, y2);
  y2 += 16;

  perImage.forEach((img, idx) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(DARK);
    doc.setFontSize(12);
    doc.text(`${idx + 1}. ${img.fileName}`, marginX, y2);
    y2 += 10;

    const body = normalizeTo100(img.results).map((r) => [titleCase(r.name), r.pct.toFixed(2)]) as RowInput[];

    autoTable(doc, {
      startY: y2,
      margin: { left: marginX, right: marginX },
      head: [["Mineral", "%"]],
      body,
      headStyles: { fillColor: LIGHT as any, textColor: DARK as any, halign: "left" as any },
      styles: { fontSize: 11 },
    });

    y2 = ((doc as any).lastAutoTable?.finalY || y2) + 14;
    if (y2 + 120 > pageH && idx < perImage.length - 1) {
      doc.addPage();
      y2 = 56;
    }
  });

  // ===== Página económica: Top 5 minerales comerciales =====
  try {
    const globalNorm = normalizeTo100(results).map((r) => ({ ...r, name: titleCase(r.name) }));

    // 1) Precios dinámicos (o respaldo)
    const market = await getCommodityPrices(); // { prices: {...}, currency: 'USD' }
    let econRows = pickTopCommercial(globalNorm, market.prices);
    econRows = estimateCommodityValue(econRows);

    if (econRows.length > 0) {
      doc.addPage();
      let yE = 56;

      doc.setFont("helvetica", "bold");
      doc.setTextColor(TITLE_COLOR);
      doc.setFontSize(16);
      doc.text("Minerales comerciales y análisis económico", marginX, yE);
      yE += 14;

      doc.setFont("helvetica", "normal");
      doc.setTextColor("#374151");
      doc.setFontSize(10);
      const srcNote = market.updatedAt
        ? `Fuente de precios: /api/commodity-prices (actualizado: ${new Date(market.updatedAt).toLocaleString()})`
        : "Precios referenciales internos. Si deseas, configura /api/commodity-prices para actualización automática.";
      doc.text(
        `${srcNote} — Cálculo aproximado del valor estimado por tonelada de mineral.`,
        marginX,
        yE
      );
      yE += 8;

      const econBody: RowInput[] = econRows.map((r) => [
        r.mineral,
        r.gradePct.toFixed(2),
        fmtMoney(r.price, market.currency),
        fmtMoney(r.estValue, market.currency),
      ]);

      autoTable(doc, {
        startY: yE + 6,
        margin: { left: marginX, right: marginX },
        head: [["Mineral", "Ley (%)", `Precio (${market.currency}/t metal)`, `Valor estimado (${market.currency}/t mineral)`]],
        body: econBody,
        headStyles: { fillColor: LIGHT as any, textColor: DARK as any, halign: "left" as any },
        styles: { fontSize: 11, cellPadding: 6 },
      });

      yE = ((doc as any).lastAutoTable?.finalY || yE) + 14;

      const totalUSDPerTonne = Math.round(econRows.reduce((a, r) => a + (r.estValue || 0), 0) * 100) / 100;

      doc.setFont("helvetica", "bold");
      doc.setTextColor(ACCENT);
      doc.setFontSize(12);
      doc.text(`Total estimado (${market.currency}/t): ${fmtMoney(totalUSDPerTonne, market.currency)}`, marginX, yE);
      yE += 16;

      const rec = autoRecommendation(totalUSDPerTonne);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(DARK);
      doc.setFontSize(12);
      doc.text(`Viabilidad: ${rec.nivel}`, marginX, yE);
      yE += 14;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Conclusión y recomendaciones: ${rec.texto}`, marginX, yE, { maxWidth: pageW - marginX * 2 });
    }
  } catch {
    // no rompemos el PDF si falla esta sección
  }

  return doc;
}

/* =========================================================================
   PDF FICHA TÉCNICA POR MINERAL
   ========================================================================= */
type BuildMineralPdfOptions = {
  mineralName: string;
  samplePct?: number;   // % en la muestra
  price?: number;       // precio por tonelada (misma moneda)
  currency?: CurrencyCode;
  notes?: string;
  infoOverride?: any;
};

export async function buildMineralPdf(opts: BuildMineralPdfOptions): Promise<Uint8Array> {
  const { mineralName, samplePct, price = 0, currency = "USD", notes, infoOverride } = opts;

  // Info técnica
  const info = infoOverride || (await getMineralInfo(mineralName)) || { nombre: mineralName };

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const marginX = 48;
  let y = 64;

  // Encabezado
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(TITLE_COLOR);
  doc.text("MinQuant_WSCA — Ficha técnica", marginX, y);
  y += 26;

  doc.setFontSize(16);
  doc.setTextColor(DARK);
  doc.text(info.nombre || mineralName, marginX, y);
  y += 12;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor("#374151");
  doc.text(`Generado: ${new Date().toLocaleString()}`, marginX, y);
  y += 20;

  const rows: string[][] = [
    ["Fórmula", info.formula || "—"],
    ["Densidad (g/cm³)", info.densidad || "—"],
    ["Color", info.color || "—"],
    ["Hábito", info.habito || "—"],
    ["Ocurrencia", info.ocurrencia || "—"],
    ["Asociados", info.asociados || "—"],
    ["Dureza Mohs", info.mohs || "—"],
    ["Brillo", info.brillo || "—"],
    ["Sistema", info.sistema || "—"],
    ["Commodity", info.commodity || "—"],
    ["Notas", info.notas || (notes || "—")],
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [["Propiedad", "Valor"]],
    body: rows,
    headStyles: { fillColor: LIGHT as any, textColor: DARK as any, halign: "left" as any },
    styles: { fontSize: 11, cellPadding: 6 },
  });

  let yAfter = ((doc as any).lastAutoTable?.finalY || y) + 18;

  // % en la muestra + valor estimado (si llega price)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(ACCENT);

  let line = "";
  if (typeof samplePct === "number") {
    line += `% en la muestra: ${samplePct.toFixed(2)} %`;
  }
  if (price > 0 && typeof samplePct === "number") {
    const value = price * (samplePct / 100);
    line += (line ? "  —  " : "") + `Valor estimado/t: ${fmtMoney(value, currency)}`;
  }
  if (line) {
    doc.text(line, marginX, yAfter);
    yAfter += 18;
  }

  // Pie
  doc.setDrawColor(ACCENT);
  doc.setLineWidth(0.8);
  doc.line(marginX, yAfter, 550, yAfter);
  yAfter += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor("#6b7280");
  doc.text(
    "Este documento es informativo. La confirmación mineralógica requiere prueba de laboratorio.",
    marginX,
    yAfter
  );

  const arr = doc.output("arraybuffer");
  return new Uint8Array(arr);
}

/* =========================================================================
   Descarga utilitaria
   ========================================================================= */
export function downloadPdf(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
