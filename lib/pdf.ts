// @ts-nocheck
// lib/pdf.ts — PDFs para MinQuant_WSCA (portada + mapa OSM + tablas + ficha + análisis económico)
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
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

// Proxy a nuestro endpoint de mapa estático OSM -> dataURL (PNG) con fallback local
async function fetchStaticMapDataUrl(lat: number, lng: number, zoom = 14, size = "900x380") {
  const url = `/api/staticmap?lat=${lat}&lng=${lng}&zoom=${zoom}&size=${size}`;

  // PNG de respaldo (1x1 px) para NO fallar nunca; el PDF lo escala
  const FALLBACK_DATAURL =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==";

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      // si el proxy falla, devolvemos imagen de respaldo
      return FALLBACK_DATAURL;
    }
    const blob = await res.blob();

    // Convertir a dataURL sin lanzar error
    return await new Promise<string>((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => resolve(FALLBACK_DATAURL);
      fr.readAsDataURL(blob);
    });
  } catch {
    // Cualquier excepción -> devolvemos fallback para que el PDF NUNCA se rompa
    return FALLBACK_DATAURL;
  }
}

// --- Helpers para inferir COMMODITY dinámicamente ---
function _norm(s: string) {  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// Normaliza el nombre de commodity a etiquetas estándar
function normalizeCommodityName(raw?: string | null): string | null {
  if (!raw) return null;
  const s = _norm(raw);
  // Palabras clave frecuentes en 'commodity' de la ficha
  if (/\b(oro|gold)\b/.test(s)) return "Oro";
  if (/\b(plata|silver)\b/.test(s)) return "Plata";
  if (/\b(cobre|copper|cupr(o|ic)|cu)\b/.test(s)) return "Cobre";
  if (/\b(zinc|zinco|zn)\b/.test(s)) return "Zinc";
  if (/\b(alumin(io|ium)|bauxita|al)\b/.test(s)) return "Aluminio";
  if (/\b(plomo|lead|pb)\b/.test(s)) return "Plomo";
  if (/\b(esta(n|ñ)o|tin|sn|casiterita)\b/.test(s)) return "Estaño";
  if (/\b(niquel|nickel|ni|pentlandita)\b/.test(s)) return "Níquel";
  if (/\b(litio|lithium|li|espodumena|spodumene)\b/.test(s)) return "Litio";
  if (/\b(platino|platinum|pt)\b/.test(s)) return "Platino";
  if (/\b(paladio|palladium|pd)\b/.test(s)) return "Paladio";
  if (/\b(hierro|iron|fe|hematita|magnetita|goethita|limonita)\b/.test(s)) return "Hierro";
  if (/\b(cobalto|cobalt|co)\b/.test(s)) return "Cobalto";
  if (/\b(molibden(o|um)|molybdenum|mo)\b/.test(s)) return "Molibdeno";
  if (/\b(tungsten(o|um)|wolframio|w|scheelita)\b/.test(s)) return "Wolframio";
  if (/\b(uranio|uranium|u)\b/.test(s)) return "Uranio";
  return null;
}

// Respaldo por mineral si la ficha no tuviera 'commodity'
const FALLBACK_MINERAL_TO_COMMODITY: Record<string, string> = {
  Malaquita: "Cobre",
  Malachite: "Cobre",
  Azurita: "Cobre",
  Azurite: "Cobre",
  Cuprita: "Cobre",
  Chalcocita: "Cobre",
  Bornita: "Cobre",
  Esfalerita: "Zinc",
  Sphalerite: "Zinc",
  Galena: "Plomo",
  Casiterita: "Estaño",
  Pentlandita: "Níquel",
  Bauxita: "Aluminio",
  Hematita: "Hierro",
  Magnetita: "Hierro",
  Goethita: "Hierro",
  Limonita: "Hierro",
  Oro: "Oro",
  Gold: "Oro",
  Plata: "Plata",
  Silver: "Plata",
};

// Consulta dinámica a tu ficha para obtener el commodity y normalizarlo
async function mineralToCommodity(mineralName: string): Promise<string | null> {
  try {
    const info = await getMineralInfo(mineralName);
    const fromInfo = normalizeCommodityName(info?.commodity || info?.nombre || mineralName);
    if (fromInfo) return fromInfo;
  } catch {}
  // Fallback por mineral
  const fb = FALLBACK_MINERAL_TO_COMMODITY[mineralName] || FALLBACK_MINERAL_TO_COMMODITY[mineralName.trim()];
  return fb || null;
}

// Suma % por commodity (llamando dinámicamente a la ficha)
async function aggregateByCommodity(results: MineralResult[]) {
  const map = new Map<string, number>();
  // Resolver commodities en paralelo (minimiza latencia)
  const uniq = Array.from(new Set(results.map(r => r.name)));
  const resolved = await Promise.all(
    uniq.map(async (n) => ({ n, c: await mineralToCommodity(n) }))
  );
  const nameToComm = new Map(resolved.map(x => [x.n, x.c]));

  for (const r of results) {
    const c = nameToComm.get(r.name);
    if (!c) continue;
    map.set(c, (map.get(c) || 0) + (r.pct || 0));
  }
  // Normaliza por redondeos
  const tot = Array.from(map.values()).reduce((a, b) => a + b, 0) || 1;
  return Array.from(map.entries())
    .map(([mineral, pct]) => ({ mineral, gradePct: +(pct / tot * 100).toFixed(2) }))
    .sort((a, b) => b.gradePct - a.gradePct);
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
  Oro: 70000000,     // aprox. 70k USD/oz * 32150 oz/t (ajústalo si deseas)
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

/** Obtiene precios desde /api/commodity-prices (dinámico) o usa respaldo */
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

  const global = normalizeTo100(results).map((r) => [titleCase(r.name), r.pct.toFixed(2)]) as any[];

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

    const body = normalizeTo100(img.results).map((r) => [titleCase(r.name), r.pct.toFixed(2)]) as any[];

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

  // ===== Página económica: Top 5 por commodity (dinámico) =====
try {
  const globalNorm = normalizeTo100(results).map(r => ({ ...r, name: r.name.trim() }));

  // 1) Agregar resultados por commodity, usando la ficha dinámica
  const commodityArr = await aggregateByCommodity(globalNorm);

  // 2) Precios (dinámicos, con fallback interno)
  const market = await getCommodityPrices(); // { prices, currency, updatedAt? }

  // 3) Mantener solo commodities con precio disponible y limitar a 5
  const econRows = commodityArr
    .filter(r => market.prices[r.mineral] != null && r.gradePct > 0)
    .slice(0, 5)
    .map(r => ({
      mineral: r.mineral,
      gradePct: r.gradePct,
      price: market.prices[r.mineral],
      estValue: +(((r.gradePct / 100) * (market.prices[r.mineral] || 0)).toFixed(2)),
    }));

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
      ? `Fuente precios: /api/commodity-prices (actualizado: ${new Date(market.updatedAt).toLocaleString()})`
      : "Precios referenciales internos (fallback).";
    doc.text(`${srcNote} — Valor estimado = Precio × (Ley/100).`, marginX, yE);
    yE += 8;

    const econBody = econRows.map(r => [
      r.mineral,
      r.gradePct.toFixed(2),
      fmtMoney(r.price, market.currency),
      fmtMoney(r.estValue, market.currency),
    ]);

    autoTable(doc, {
      startY: yE + 6,
      margin: { left: marginX, right: marginX },
      head: [["Commodity", "Ley (%)", `Precio (${market.currency}/t metal)`, `Valor estimado (${market.currency}/t mineral)`]],
      body: econBody,
      headStyles: { fillColor: LIGHT as any, textColor: DARK as any, halign: "left" as any },
      styles: { fontSize: 11, cellPadding: 6 },
    });

    yE = ((doc as any).lastAutoTable?.finalY || yE) + 14;

    const totalUSDPerTonne = econRows.reduce((a, r) => a + (r.estValue || 0), 0);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(ACCENT);
    doc.setFontSize(12);
    doc.text(`Total estimado (${market.currency}/t): ${fmtMoney(totalUSDPerTonne, market.currency)}`, marginX, yE);
    yE += 16;

    const v = totalUSDPerTonne;
    const nivel = v >= 100 ? "Alta" : v >= 30 ? "Media" : "Baja";
    const texto =
      nivel === "Alta"
        ? "Recomendado avanzar a muestreo representativo, QA/QC y pruebas metalúrgicas."
        : nivel === "Media"
        ? "Continuar con exploración dirigida y validar recuperación metalúrgica."
        : "No recomendable por ahora; priorizar prospección adicional y revisar costos.";
    doc.setFont("helvetica", "bold");
    doc.setTextColor(DARK);
    doc.setFontSize(12);
    doc.text(`Viabilidad: ${nivel}`, marginX, yE);
    yE += 14;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Conclusión y recomendaciones: ${texto}`, marginX, yE, { maxWidth: pageW - marginX * 2 });
  }
} catch {
  /* no romper si falla */
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
    body: rows as any[],
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
