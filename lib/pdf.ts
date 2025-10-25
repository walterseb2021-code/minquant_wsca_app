// @ts-nocheck
// lib/pdf.ts — PDFs para MinQuant_WSCA (portada + mapa, tablas, ficha y análisis económico realista)

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getMineralInfo } from "./minerals";

export type MineralResult = { name: string; pct: number; confidence?: number };
export type CurrencyCode = "USD" | "PEN" | "EUR";

/* =========================================================================
   CONFIG ECONÓMICA (puedes ajustar estos números)
   ========================================================================= */
// Recuperación metalúrgica global (ej. 85%)
const RECOVERY_DEFAULT = 0.85;
// Payable (porcentaje pagable; ej. 96%)
const PAYABLE_DEFAULT = 0.96;

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
    if (!res.ok) return FALLBACK_DATAURL;
    const blob = await res.blob();
    return await new Promise<string>((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => resolve(FALLBACK_DATAURL);
      fr.readAsDataURL(blob);
    });
  } catch {
    return FALLBACK_DATAURL;
  }
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

function titleCase(s: string) {
  if (!s) return s;
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
}

/* =========================================================================
   MAPEO A COMMODITY + FACTORES ESTEQUIOMÉTRICOS (metal en mineral)
   ========================================================================= */
function _norm(s: string) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeCommodityName(raw?: string | null): string | null {
  if (!raw) return null;
  const s = _norm(raw);
  if (/\b(oro|gold)\b/.test(s)) return "Oro";
  if (/\b(plata|silver)\b/.test(s)) return "Plata";
  if (/\b(cobre|copper|cupr(o|ic)|cu)\b/.test(s)) return "Cobre";
  if (/\b(zinc|zinco|zn)\b/.test(s)) return "Zinc";
  if (/\b(alumin(io|ium)|bauxita|al)\b/.test(s)) return "Aluminio";
  if (/\b(plomo|lead|pb)\b/.test(s)) return "Plomo";
  if (/\b(esta(n|ñ)o|tin|sn|casiterita)\b/.test(s)) return "Estaño";
  if (/\b(niquel|nickel|ni|pentlandita)\b/.test(s)) return "Níquel";
  if (/\b(hierro|iron|fe|hematita|magnetita|goethita|limonita)\b/.test(s)) return "Hierro";
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

// FACTORES (fracción en masa del metal pagable en el mineral)
const METAL_FACTOR: Record<string, { commodity: string; factor: number }> = {
  // Cobre
  Malaquita: { commodity: "Cobre", factor: 0.574 },
  Malachite: { commodity: "Cobre", factor: 0.574 },
  Azurita: { commodity: "Cobre", factor: 0.551 },
  Azurite: { commodity: "Cobre", factor: 0.551 },
  Calcopirita: { commodity: "Cobre", factor: 0.346 },
  Chalcopyrite: { commodity: "Cobre", factor: 0.346 },
  Calcocita: { commodity: "Cobre", factor: 0.798 },
  Chalcocite: { commodity: "Cobre", factor: 0.798 },
  Bornita: { commodity: "Cobre", factor: 0.633 },

  // Zinc
  Esfalerita: { commodity: "Zinc", factor: 0.671 },
  Sphalerite: { commodity: "Zinc", factor: 0.671 },

  // Plomo
  Galena: { commodity: "Plomo", factor: 0.866 },

  // Estaño
  Casiterita: { commodity: "Estaño", factor: 0.788 },
  Cassiterite: { commodity: "Estaño", factor: 0.788 },

  // Níquel
  Pentlandita: { commodity: "Níquel", factor: 0.33 },
  Pentlandite: { commodity: "Níquel", factor: 0.33 },

  // Aluminio (alúmina/bauxita)
  Bauxita: { commodity: "Aluminio", factor: 0.53 },
  Bauxite: { commodity: "Aluminio", factor: 0.53 },
  Alúmina: { commodity: "Aluminio", factor: 0.53 },
  Alumina: { commodity: "Aluminio", factor: 0.53 },

  // Hierro
  Hematita: { commodity: "Hierro", factor: 0.699 },
  Hematite: { commodity: "Hierro", factor: 0.699 },
  Magnetita: { commodity: "Hierro", factor: 0.724 },
  Magnetite: { commodity: "Hierro", factor: 0.724 },
  Goethita: { commodity: "Hierro", factor: 0.629 },
  Goethite: { commodity: "Hierro", factor: 0.629 },

  // Limonita (variable): aproximamos 0.50
  Limonita: { commodity: "Hierro", factor: 0.5 },
  Limonite: { commodity: "Hierro", factor: 0.5 },
};

// Devuelve commodity + factor para un mineral; si no hay factor, intenta fallback a commodity
function commodityAndFactorFor(mineralName: string): { commodity: string | null; factor: number } {
  const nice = titleCase(mineralName.trim());
  if (METAL_FACTOR[nice]) return METAL_FACTOR[nice];
  const fb =
    FALLBACK_MINERAL_TO_COMMODITY[nice] || FALLBACK_MINERAL_TO_COMMODITY[mineralName] || null;
  return { commodity: fb, factor: fb ? 1.0 : 0 };
}

/* =========================================================================
   PRECIOS (dinámico con fallback)
   ========================================================================= */
const TITLE_COLOR = "#0ea5e9";
const ACCENT = "#10b981";
const LIGHT = "#f3f4f6";
const DARK = "#111827";

/** Respaldo interno (USD/t de metal fino) */
const FALLBACK_COMMODITY_PRICE_USD: Record<string, number> = {
  Oro: 70000000, // oro a USD/t (aprox 70M, ~70k USD/kg)
  Plata: 800000, // plata a USD/t (~800 USD/kg)
  Cobre: 9000,
  Aluminio: 2300,
  Zinc: 2600,
  Plomo: 2200,
  Estaño: 25000,
  Níquel: 17000,
};

const COMMERCIAL_ORDER = ["Oro", "Plata", "Cobre", "Aluminio", "Zinc", "Plomo", "Estaño", "Níquel"];

type CommodityPrices = {
  prices: Record<string, number>;
  currency: CurrencyCode;
  updatedAt?: string;
};

async function getCommodityPrices(): Promise<CommodityPrices> {
  try {
    // Puedes pedir por commodities específicos: /api/commodity-prices?commodities=Cobre,Zinc,Plomo
    const r = await fetch(`/api/commodity-prices?currency=USD`, { cache: "no-store" });
    if (!r.ok) throw new Error(`status ${r.status}`);
    const ct = r.headers.get("content-type") || "";
    const isJson = ct.toLowerCase().includes("application/json");
    if (!isJson) throw new Error(`non-json content-type: ${ct}`);
    const j = (await r.json()) as CommodityPrices;
    if (!j || typeof j !== "object" || typeof j.prices !== "object") {
      throw new Error("bad schema");
    }
    return j;
  } catch {
    return { prices: FALLBACK_COMMODITY_PRICE_USD, currency: "USD", updatedAt: undefined };
  }
}

/* =========================================================================
   AGREGACIÓN POR COMMODITY (sumando % DE METAL, no de mineral)
   ========================================================================= */
async function aggregateByCommodity(results: MineralResult[]) {
  const map = new Map<string, number>(); // commodity -> % METAL en la mezcla
  for (const r of results) {
    const { commodity, factor } = commodityAndFactorFor(r.name);
    if (!commodity || !factor) continue;
    const mineralPct = r.pct || 0; // % mineral
    const metalPct = mineralPct * factor; // % metal equivalente
    map.set(commodity, (map.get(commodity) || 0) + metalPct);
  }
  return Array.from(map.entries())
    .map(([mineral, gradePct]) => ({ mineral, gradePct: +gradePct.toFixed(2) }))
    .sort((a, b) => b.gradePct - a.gradePct);
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
  currency?: CurrencyCode;
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

  // ===== Mapa estático (opcional) =====
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

  // ===== Global (normalizado a 100%) =====
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
    } catch {}
  }
  // Avanza 'y' según filas de miniaturas (cierra sección con consistencia)
  const rowsUsed = Math.ceil(imageDataUrls.length / thumbsPerRow);
  if (rowsUsed > 0) {
    y = y + rowsUsed * (thumbH + 24) + 10;
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

  // ===== Página económica: Top commodities (con LEY DE METAL) =====
  try {
    const globalNorm = normalizeTo100(results).map((r) => ({ ...r, name: r.name.trim() }));
    const commodityArr = await aggregateByCommodity(globalNorm); // gradePct = % METAL

    const market = await getCommodityPrices();

    // Solo los que tienen precio; limita a 5
    const econRows = commodityArr
      .filter((r) => market.prices[r.mineral] != null && r.gradePct > 0)
      .slice(0, 5)
      .map((r) => {
        const price = market.prices[r.mineral];
        // Valor neto = LeyMetal * Precio * Recovery * Payable
        const net = (r.gradePct / 100) * price * RECOVERY_DEFAULT * PAYABLE_DEFAULT;
        return {
          mineral: r.mineral,
          gradePct: r.gradePct, // % metal
          price,
          estValue: +net.toFixed(2),
        };
      });

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
        ? `Fuente precios: /api/commodity-prices (actualizado: ${new Date(
            market.updatedAt
          ).toLocaleString()})`
        : "Precios referenciales internos (fallback).";
      const factors = `Supuestos: Recuperación ${Math.round(RECOVERY_DEFAULT * 100)}% • Payable ${Math.round(
        PAYABLE_DEFAULT * 100
      )}%`;
      doc.text(`${srcNote} — Valor = Precio × (Ley metal/100) × Recuperación × Payable. ${factors}.`, marginX, yE);
      yE += 8;

      const econBody = econRows.map((r) => [
        r.mineral,
        r.gradePct.toFixed(2), // % de METAL
        fmtMoney(r.price, market.currency),
        fmtMoney(r.estValue, market.currency),
      ]);

      autoTable(doc, {
        startY: yE + 6,
        margin: { left: marginX, right: marginX },
        head: [
          [
            "Commodity",
            "Ley metal (%)",
            `Precio (${market.currency}/t metal)`,
            `Valor neto (${market.currency}/t mineral)`,
          ],
        ],
        body: econBody,
        headStyles: { fillColor: LIGHT as any, textColor: DARK as any, halign: "left" as any },
        styles: { fontSize: 11, cellPadding: 6 },
      });

      yE = ((doc as any).lastAutoTable?.finalY || yE) + 14;
      const totalUSDPerTonne = econRows.reduce((a, r) => a + (r.estValue || 0), 0);

      doc.setFont("helvetica", "bold");
      doc.setTextColor(ACCENT);
      doc.setFontSize(12);
      doc.text(
        `Total estimado (${market.currency}/t): ${fmtMoney(totalUSDPerTonne, market.currency)}`,
        marginX,
        yE
      );
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
      doc.text(`Conclusión y recomendaciones: ${texto}`, marginX, yE, {
        maxWidth: pageW - marginX * 2,
      });
    }
  } catch {}

  return doc;
}

/* =========================================================================
   PDF FICHA TÉCNICA POR MINERAL
   ========================================================================= */
type BuildMineralPdfOptions = {
  mineralName: string;
  samplePct?: number; // % en la mezcla mineral
  price?: number; // precio por tonelada (misma moneda)
  currency?: CurrencyCode;
  notes?: string;
  infoOverride?: any;
};

export async function buildMineralPdf(
  opts: BuildMineralPdfOptions,
): Promise<Uint8Array> {
  const { mineralName, samplePct, price = 0, currency = "USD", notes, infoOverride } = opts;

  const info = infoOverride || (await getMineralInfo(mineralName)) || { nombre: mineralName };

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const marginX = 48;
  const pageW = doc.internal.pageSize.getWidth();
  let y = 64;

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

  // % en la muestra + valor estimado si llega price (asume factor 1 para ficha puntual)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(ACCENT);

  let line = "";
  if (typeof samplePct === "number") {
    line += `% en la mezcla: ${samplePct.toFixed(2)} %`;
  }
  if (price > 0 && typeof samplePct === "number") {
    const value = price * (samplePct / 100);
    line += (line ? "  —  " : "") + `Valor estimado/t (sin ajuste): ${fmtMoney(value, currency)}`;
  }
  if (line) {
    doc.text(line, marginX, yAfter);
    yAfter += 18;
  }

  doc.setDrawColor(ACCENT);
  doc.setLineWidth(0.8);
  doc.line(marginX, yAfter, pageW - marginX, yAfter); // ancho dinámico
  yAfter += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor("#6b7280");
  doc.text(
    "Documento informativo. La confirmación mineralógica requiere prueba de laboratorio.",
    marginX,
    yAfter
  );

  const arr = doc.output("arraybuffer");
  return new Uint8Array(arr);
}

/* =========================================================================
   Descarga utilitaria
   ========================================================================= */
function fmtMoney(v: number, currency: CurrencyCode = "USD") {
  try {
    return new Intl.NumberFormat("es-PE", { style: "currency", currency }).format(v);
  } catch {
    return `${currency} ${v.toLocaleString()}`;
  }
}

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
