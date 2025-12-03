// @ts-nocheck
// lib/pdf.ts — PDFs para MinQuant_WSCA (portada + mapa, tablas, ficha y análisis económico realista)
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getMineralInfo } from "./minerals";

export type MineralResult = { name: string; pct: number; confidence?: number };
export type CurrencyCode = "USD" | "PEN" | "EUR";

/* =========================================================================
   NUEVO: overrides de recuperación/payable por commodity
   ========================================================================= */
export type CommodityAdjustments = Record<
  string,
  { recovery: number; payable: number } // fracciones (0..1)
>;

/* =========================================================================
   CONFIG ECONÓMICA (defaults globales/fallback)
   ========================================================================= */
// Recuperación y Payable por defecto (si no hay override)
const DEFAULT_REC = 0.85;
const DEFAULT_PAY = 0.96;

// Defaults específicos por commodity si no vienen overrides desde UI
const DEFAULTS_BY_COMMODITY: Record<string, { recovery: number; payable: number }> = {
  Cobre: { recovery: 0.88, payable: 0.96 },
  Zinc: { recovery: 0.85, payable: 0.85 },
  Plomo: { recovery: 0.90, payable: 0.90 },
  Oro: { recovery: 0.90, payable: 0.99 },
  Plata: { recovery: 0.85, payable: 0.98 },
};

/* =========================================================================
   HELPERS GENERALES
   ========================================================================= */
const round2 = (n: number) => Math.round(n * 100) / 100;

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
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\s+/g, " ").trim();
}

/* =========================================================================
   MAPEO A COMMODITY + FACTORES ESTEQUIOMÉTRICOS (metal en mineral)
   ========================================================================= */
function _norm(s: string) {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
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
  // Aluminio
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
  Limonita: { commodity: "Hierro", factor: 0.5 },
  Limonite: { commodity: "Hierro", factor: 0.5 },
};

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

const FALLBACK_COMMODITY_PRICE_USD: Record<string, number> = {
  // USD / tonelada de metal fino (aprox)
  Oro: 70000000,    // ~70k USD/kg * 1000
  Plata: 800000,    // ~800 USD/kg * 1000
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
  source?: string;
};

async function getCommodityPrices(): Promise<CommodityPrices> {
  try {
    const r = await fetch("/api/commodity-prices?currency=USD", { cache: "no-store" });
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

function fmtMoney(v: number, currency: CurrencyCode = "USD") {
  try {
    return new Intl.NumberFormat("es-PE", { style: "currency", currency }).format(v);
  } catch {
    return `${currency} ${v.toLocaleString()}`;
  }
}

/* =========================================================================
   AGREGACIÓN POR COMMODITY (sumando % DE METAL, no de mineral)
   ========================================================================= */
async function aggregateByCommodity(results: MineralResult[]) {
  const map = new Map<string, number>(); // commodity -> % METAL
  for (const r of results) {
    const { commodity, factor } = commodityAndFactorFor(r.name);
    if (!commodity || !factor) continue;
    const mineralPct = r.pct || 0;
    const metalPct = mineralPct * factor;
    map.set(commodity, (map.get(commodity) || 0) + metalPct);
  }
  return Array.from(map.entries())
    .map(([mineral, gradePct]) => ({ mineral, gradePct: +gradePct.toFixed(2) }))
    .sort((a, b) => b.gradePct - a.gradePct);
}
// Clasifica el nombre del feature para evitar confusiones:
// Quebradas, fallas, ríos, minas, canteras, concesiones, etc.
function buildTypedName(rawName: string, s: any): string {
  if (!rawName) return "Sin nombre";
  const name = rawName.trim();
  const lower = name.toLowerCase();

  const raw: any = s?.raw || {};
  const tags: any = raw.tags || {};
  const kind = String(raw.kind || raw.properties?.kind || s?.type || "").toLowerCase();
  const featureType = String(raw.type || raw.featureType || "").toLowerCase();

  // Helpers
  const withPrefix = (prefix: string) =>
    name.toLowerCase().startsWith(prefix.toLowerCase())
      ? name
      : `${prefix} ${name}`;

  // --- Hidrografía: ríos / quebradas ---
  if (
    lower.startsWith("quebrada ") ||
    tags.waterway === "stream" ||
    /quebrada/.test(kind)
  ) {
    return withPrefix("Quebrada");
  }

  if (
    lower.startsWith("rio ") ||
    lower.startsWith("río ") ||
    tags.waterway === "river"
  ) {
    return withPrefix("Río");
  }

  // --- Fallas geológicas ---
  if (
    /falla/.test(lower) ||
    /fault/.test(kind) ||
    /falla/.test(featureType)
  ) {
    return withPrefix("Falla");
  }

  // --- Minas / canteras ---
  if (
    /mina/.test(lower) ||
    kind === "mine" ||
    tags.landuse === "quarry" ||
    kind === "quarry"
  ) {
    // no diferenciamos mucho aquí, pero dejamos claro que es explotación
    return withPrefix("Mina/Cantera");
  }

  // --- Concesiones ---
  if (/concesion/.test(lower) || /concesión/.test(lower)) {
    return withPrefix("Concesión");
  }

  // --- Yacimientos / proyectos / prospectos (si ya vienen claros, los dejamos) ---
  if (
    /yacimiento/.test(lower) ||
    /prospecto/.test(lower) ||
    /proyecto/.test(lower) ||
    /operaci[oó]n/.test(lower)
  ) {
    return name;
  }

  // Si el provider trae un tipo interesante, podemos usarlo como prefijo genérico
  if (kind && !["", "point"].includes(kind)) {
    return withPrefix(kind[0].toUpperCase() + kind.slice(1));
  }

  // Fallback: se deja tal cual
  return name;
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
  recoveryPayables?: CommodityAdjustments; // NUEVO
  // nearbySources (opcional). Estructura libre esperada: array de objetos con { id, name, commodity?, latitude?, longitude?, distance_m?, source?, source_url?, raw? }
  nearbySources?: any[];
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
    recoveryPayables = {},
    nearbySources = [],
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

    // Orden comercial útil y filtro por precio
    const sorted = commodityArr.sort((a, b) => {
      const ia = COMMERCIAL_ORDER.indexOf(a.mineral);
      const ib = COMMERCIAL_ORDER.indexOf(b.mineral);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });

    const econRows = sorted
      .filter((r) => market.prices[r.mineral] != null && r.gradePct > 0)
      .map((r) => {
        const price = market.prices[r.mineral]; // USD/t de metal
        // Obtener rec/pay por commodity (override UI > default por commodity > default global)
        const fromUI = recoveryPayables[r.mineral];
        const defByCom = DEFAULTS_BY_COMMODITY[r.mineral];
        const rec = Math.max(
          0,
          Math.min(1, fromUI?.recovery ?? defByCom?.recovery ?? DEFAULT_REC)
        );
        const pay = Math.max(
          0,
          Math.min(1, fromUI?.payable ?? defByCom?.payable ?? DEFAULT_PAY)
        );

        const net = (r.gradePct / 100) * price * rec * pay; // Valor por tonelada de mineral
        return {
          mineral: r.mineral,
          gradePct: r.gradePct, // % METAL
          rec,
          pay,
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

      const srcLabel = market.source
        ? `Fuente precios: ${market.source}`
        : "Fuente precios: /api/commodity-prices";

      const srcNote = market.updatedAt
        ? `${srcLabel} (actualizado: ${new Date(market.updatedAt).toLocaleString()})`
        : `${srcLabel} (precios referenciales / fallback).`;

      doc.text(
        `${srcNote} — Valor = Precio × (Ley metal/100) × Recuperación × Payable (por commodity).`,
        marginX,
        yE
      );
      yE += 8;

      const econBody = econRows.map((r) => [
        r.mineral,
        r.gradePct.toFixed(2), // Ley de METAL %
        `${Math.round(r.rec * 100)}%`,
        `${Math.round(r.pay * 100)}%`,
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
            "Rec. %",
            "Pay. %",
            `Precio (${market.currency}/t metal)`,
            `Valor neto (${market.currency}/t mineral)`,
          ],
        ],
        body: econBody,
        headStyles: { fillColor: LIGHT as any, textColor: DARK as any, halign: "left" as any },
        styles: { fontSize: 11, cellPadding: 6 },
      });

      yE = ((doc as any).lastAutoTable?.finalY || yE) + 14;
      const totalPerTonne = econRows.reduce((a, r) => a + (r.estValue || 0), 0);

      doc.setFont("helvetica", "bold");
      doc.setTextColor(ACCENT);
      doc.setFontSize(12);
      doc.text(
        `Total estimado (${market.currency}/t): ${fmtMoney(totalPerTonne, market.currency)}`,
        marginX,
        yE
      );
      yE += 16;

      const v = totalPerTonne;
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

  // ===== NUEVA SECCIÓN: Yacimientos / Canteras cercanas =====
  try {
    doc.addPage();
    let yN = 56;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(TITLE_COLOR);
    doc.setFontSize(16);
    doc.text("Yacimientos / Canteras cercanas", marginX, yN);
    yN += 14;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor("#374151");
    doc.text(
      "Listado de features geoespaciales detectados alrededor de la ubicación (origen: OpenStreetMap / Geoapify u otros).",
      marginX,
      yN
    );
    yN += 12;

    // Preparar cuerpo de la tabla
    const nearby = Array.isArray(nearbySources) ? nearbySources : [];
const body = nearby.map((s: any) => {
  const rawName = s.name || s.address || "Sin nombre";
  // NUEVO: nombre tipado (Quebrada X, Falla Y, Mina/Cantera Z, Concesión W…)
  const name = buildTypedName(rawName, s);

  const type = s.raw?.tags
    ? Object.values(s.raw.tags).join(", ")
    : s.type || "";

  const comm = Array.isArray(s.commodity)
    ? s.commodity.slice(0, 3).join(", ")
    : s.commodity || "";

  const distKm =
    typeof s.distance_m === "number"
      ? round2(s.distance_m / 1000)
      : s.distance_km
      ? round2(s.distance_km)
      : "";
  const distStr = distKm === "" ? "" : `${distKm} km`;

  const lat =
    typeof s.latitude === "number"
      ? s.latitude.toFixed(6)
      : s.lat
      ? Number(s.lat).toFixed(6)
      : "";
  const lon =
    typeof s.longitude === "number"
      ? s.longitude.toFixed(6)
      : s.lon
      ? Number(s.lon).toFixed(6)
      : "";
  const src =
    s.source || (s.raw && (s.raw.provider || s.raw.source)) || s.source_url || "";
  const shortSrc =
    typeof src === "string" && src.length > 48 ? src.slice(0, 45) + "..." : src || "";

  return [name, type, comm, distStr, lat, lon, shortSrc];
});

    // Si no hay items, añadimos fila vacía (para que la tabla aparezca con cabeceras)
    if (body.length === 0) {
      body.push(["—", "—", "—", "—", "—", "—", "—"]);
    }

    autoTable(doc, {
      startY: yN + 6,
      head: [["Nombre", "Tipo / Tags", "Commodities", "Dist", "Lat", "Lon", "Fuente / URL"]],
      body,
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: LIGHT as any, textColor: DARK as any },
      margin: { left: marginX, right: marginX },
      columnStyles: {
        0: { cellWidth: 120 },
        1: { cellWidth: 90 },
        2: { cellWidth: 80 },
        3: { cellWidth: 48 },
        4: { cellWidth: 64 },
        5: { cellWidth: 64 },
        6: { cellWidth: 120 },
      },
      theme: "grid",
    });
  } catch (e) {
    // No bloquear el PDF por esta tabla; mostramos nota
    console.warn("Error generando tabla de yacimientos:", e);
    try {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(
        "Nota: No fue posible renderizar la tabla de yacimientos.",
        marginX,
        ((doc as any).lastAutoTable?.finalY || 56) + 12
      );
    } catch {}
  }

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

export async function buildMineralPdf(opts: BuildMineralPdfOptions): Promise<Uint8Array> {
  const { mineralName, samplePct, price = 0, currency = "USD", notes, infoOverride } = opts;

  const info = infoOverride || (await getMineralInfo(mineralName)) || { nombre: mineralName };

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const marginX = 48;
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
  doc.line(marginX, yAfter, 550, yAfter);
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
