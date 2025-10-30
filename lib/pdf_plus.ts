// lib/pdf_plus.ts — Reporte general (mezcla, imágenes, interpretación y economía + mapa)
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getStaticMapDataURL } from "./map";

export type CurrencyCode = "USD" | "PEN";
export type MineralPct = { name: string; pct: number };
export type ImageResult = {
  filename?: string;
  minerals: MineralPct[];
  excluded?: { reason?: string } | null;
};
export type GlobalMix = MineralPct[];

export type Commodity = {
  code: "Cu" | "Zn" | "Pb" | "Au" | "Ag" | "Fe" | "Mn" | "Ni";
  display: string;
  unit: "kg/t" | "g/t";
  payableDefault: number; // 0..1
  priceDefault: number;   // en currency/unit
  enabled?: boolean;
};

/** Catálogo base (puedes extender luego Fe/Mn/Ni) */
const BASE_COMMODITIES: Commodity[] = [
  { code: "Cu", display: "Cobre (Cu)", unit: "kg/t", payableDefault: 0.85, priceDefault: 9.0, enabled: true },
  { code: "Zn", display: "Zinc (Zn)", unit: "kg/t", payableDefault: 0.85, priceDefault: 2.7, enabled: true },
  { code: "Pb", display: "Plomo (Pb)", unit: "kg/t", payableDefault: 0.85, priceDefault: 2.1, enabled: true },
  { code: "Au", display: "Oro (Au)",  unit: "g/t",  payableDefault: 0.92, priceDefault: 75.0, enabled: true },
  { code: "Ag", display: "Plata (Ag)",unit: "g/t",  payableDefault: 0.90, priceDefault: 0.90, enabled: true },
  // Gancho para ampliar:
  { code: "Fe", display: "Hierro (Fe)",unit: "kg/t", payableDefault: 0.90, priceDefault: 0.11, enabled: false },
  { code: "Mn", display: "Manganeso (Mn)", unit: "kg/t", payableDefault: 0.90, priceDefault: 2.0, enabled: false },
  { code: "Ni", display: "Níquel (Ni)", unit: "kg/t", payableDefault: 0.85, priceDefault: 18.0, enabled: false },
];

export type EconOverrides = {
  currency?: CurrencyCode;
  prices?: Partial<Record<Commodity["code"], number>>;
  payables?: Partial<Record<Commodity["code"], number>>;
};

export type BuildReportOptions = {
  title?: string;
  note?: string;
  lat?: number;
  lng?: number;
  dateISO?: string;
  econ?: EconOverrides;
};

/** Utilidades */
const round2 = (n: number) => Math.round(n * 100) / 100;
const toPct = (n: number, digits = 2) => `${n.toFixed(digits)} %`;

/** Mapeo rápido mineral→metal (heurístico) */
function mineralToMetals(name: string): Commodity["code"][] {
  const s = name.toLowerCase();
  if (/(malaquita|azurita|crisocola|cuprita|tenorita|bornita|calcopirita)/.test(s)) return ["Cu"];
  if (/(pirita|marcasita|arsenopirita)/.test(s)) return ["Fe", "Au"]; // Fe fuerte, Au potencial
  if (/(galena)/.test(s)) return ["Pb"];
  if (/(esfalerita|blenda)/.test(s)) return ["Zn"];
  if (/(electrum|oro nativo|oro)/.test(s)) return ["Au"];
  if (/(plata nativa|argentita|acantita|clorargirita)/.test(s)) return ["Ag"];
  if (/(hematita|goethita|magnetita|limonita|siderita)/.test(s)) return ["Fe"];
  if (/(pirolusita|hausmannita|psilomelana|manganita)/.test(s)) return ["Mn"];
  if (/(pentlandita|niccolita|garnierita)/.test(s)) return ["Ni"];
  return [];
}

/** Interpretación dinámica: devuelve un bloque de texto breve y específico */
function interpretMix(mix: GlobalMix): string {
  const by = (rx: RegExp) => mix.some(m => rx.test(m.name.toLowerCase()));
  const weight = (rx: RegExp) =>
    mix.filter(m => rx.test(m.name.toLowerCase())).reduce((a, b) => a + b.pct, 0);

  const hasCu = by(/malaquita|azurita|crisocola|bornita|calcopirita|cuprita|tenorita/);
  const hasFe = by(/pirita|hematita|goethita|magnetita|limonita|marcasita/);
  const hasAu = by(/oro|arsenopirita|pirita/);
  const hasAg = by(/plata|argentita|acantita|clorargirita/);
  const hasQuartz = by(/cuarzo/);
  const hasCalcite = by(/calcita|dolomita/);

  const wCu = weight(/malaquita|azurita|crisocola|bornita|calcopirita|cuprita|tenorita/);
  const wFe = weight(/pirita|hematita|goethita|magnetita|limonita|marcasita/);
  const wAu = weight(/oro|arsenopirita|pirita/);
  const wAg = weight(/plata|argentita|acantita|clorargirita/);

  const lines: string[] = [];

  if (hasCu) {
    lines.push(`• **Dominio cuprífero** (≈ ${round2(wCu)} % de especies asociadas a Cu): potencial para lixiviación/beneficio oxidado si prevalecen carbonatos/hidróxidos (malaquita/azurita/crisocola).`);
  }
  if (hasFe) {
    lines.push(`• **Fuerte impronta férrica** (≈ ${round2(wFe)} %): puede indicar zonas oxidadas o supergénesis; pirita sugiere ambiente hidrotermal y puede correlacionar con Au fino.`);
  }
  if (hasAu) {
    lines.push(`• **Potencial aurífero** (≈ ${round2(wAu)} %): revisar finos y sulfuros (pirita/arsenopirita); recomendable panning o fire assay para confirmación.`);
  }
  if (hasAg) {
    lines.push(`• **Plata presente** (≈ ${round2(wAg)} %): verificar mena argentífera secundaria (clorargirita) en zonas de oxidación.`);
  }
  if (hasQuartz) {
    lines.push(`• **Cuarzo**: sugiere evento hidrotermal; observar vetillas, bandeamiento y texturas para vectorización.`);
  }
  if (hasCalcite) {
    lines.push(`• **Calcita/Dolomita (ganga)**: material no pagable que puede diluir leyes; ajustar blend o preconcentrar.`);
  }
  if (!lines.length) {
    lines.push(`• Ensamble sin indicadores metálicos fuertes. Sugerido: muestreo adicional y ensayo químico para confirmación.`);
  }
  return lines.join("\n");
}

/** Construye tabla económica a partir de la mezcla global */
function buildEconomics(
  mix: GlobalMix,
  overrides?: EconOverrides
) {
  const currency: CurrencyCode = overrides?.currency || "USD";
  const prices = overrides?.prices || {};
  const payables = overrides?.payables || {};

  // Derivar señales metalíferas desde los minerales
  const present = new Set<Commodity["code"]>();
  mix.forEach(m => mineralToMetals(m.name).forEach(code => present.add(code)));

  // Si el usuario reportó Au/Ag en mezcla (por nombre), no dependas solo del mapeo:
  if (mix.some(m => /oro/i.test(m.name))) present.add("Au");
  if (mix.some(m => /plata/i.test(m.name))) present.add("Ag");

  // Selección de commodities activados/presentes
  const commodities = BASE_COMMODITIES.filter(c =>
    (c.enabled || present.has(c.code))
  );

  // Estimaciones super simplificadas de tenor equivalente por especie (heurístico):
  // Cu from carbonates/oxides → derivamos a kg/t asumiendo fracción metálica aproximada.
  function estimateTenor(code: Commodity["code"]): number {
    // Suma pcts de especies que alimentan ese metal:
    const rel = mix
      .filter(m => mineralToMetals(m.name).includes(code))
      .reduce((a, b) => a + b.pct, 0);

    // Heurísticas rápidas (mejorables con tu modelo):
    switch (code) {
      case "Cu":
        // Ponderación simple: 1 % de “minerales de Cu” ≈ 0.5 kg/t Cu pagable (placeholder conservador)
        return round2(rel * 0.5);
      case "Zn":
      case "Pb":
      case "Fe":
      case "Mn":
      case "Ni":
        return round2(rel * 0.3);
      case "Au":
        // Oro en g/t (muy sensible): 1 % “indicadores Au” ≈ 0.2 g/t (placeholder)
        return round2(rel * 0.2);
      case "Ag":
        // Plata en g/t: 1 % “indicadores Ag” ≈ 1.5 g/t (placeholder)
        return round2(rel * 1.5);
      default:
        return 0;
    }
  }

  const rows = commodities.map(c => {
    const tenor = estimateTenor(c.code); // kg/t o g/t
    const payable = typeof payables[c.code] === "number" ? payables[c.code]! : c.payableDefault;
    const price = typeof prices[c.code] === "number" ? prices[c.code]! : c.priceDefault;
    const payQty = round2(tenor * payable);
    const value = round2(payQty * price);
    return {
      code: c.code,
      item: c.display,
      unit: c.unit,
      tenor,
      payable: payable,
      payQty,
      price,
      value,
      currency,
    };
  });

  return { currency, rows };
}

export async function buildReportPdfPlus(args: {
  mixGlobal: GlobalMix;
  byImage: ImageResult[];
  opts?: BuildReportOptions;
}): Promise<jsPDF> {
  const { mixGlobal, byImage, opts } = args;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 42;
  const pageW = doc.internal.pageSize.getWidth();
  let y = margin;

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(opts?.title || "Reporte de Análisis Mineral – MinQuant_WSCA", margin, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const when = opts?.dateISO ? new Date(opts.dateISO).toLocaleString() : new Date().toLocaleString();
  doc.text(`Fecha: ${when}`, margin, y);
  y += 14;

  // Map (intenta imagen estática; fallback a marcador + coords + URL)
  if (typeof opts?.lat === "number" && typeof opts?.lng === "number") {
    const mapW = 220;
    const mapH = 120;
    const x = pageW - margin - mapW;
    const topY = margin;

    try {
      const durl = await getStaticMapDataURL(opts.lat, opts.lng, { width: mapW, height: mapH, zoom: 14 });
      if (durl) {
        doc.addImage(durl, "PNG", x, topY, mapW, mapH);
      } else {
        // Fallback: caja con marcador
        doc.setDrawColor(180);
        doc.rect(x, topY, mapW, mapH);
        doc.setFontSize(9);
        doc.text("Mapa no disponible (CORS).", x + 8, topY + 16);
      }
    } catch {
      doc.setDrawColor(180);
      doc.rect(x, topY, mapW, mapH);
      doc.setFontSize(9);
      doc.text("Mapa no disponible.", x + 8, topY + 16);
    }

    // Coordenadas y enlace
    const coordY = margin + 140;
    doc.setFontSize(10);
    doc.text(`Lat: ${opts.lat?.toFixed(6)}  Lng: ${opts.lng?.toFixed(6)}`, pageW - margin - 220, coordY);
    const osmLink = `https://www.openstreetmap.org/?mlat=${opts.lat}&mlon=${opts.lng}#map=15/${opts.lat}/${opts.lng}`;
    doc.textWithLink("Ver en mapa", pageW - margin - 220, coordY + 14, { url: osmLink });
  }

  // Nota / advertencia
  if (opts?.note) {
    doc.setFontSize(9);
    const text = doc.splitTextToSize(opts.note, pageW - margin * 2 - 240);
    doc.text(text, margin, y);
    y += 14 * text.length + 6;
  }

  // Mezcla Global
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Mezcla Global (normalizada a 100 %)", margin, y);
  y += 8;

  autoTable(doc, {
    startY: y + 6,
    head: [["Mineral", "%"]],
    body: mixGlobal.map(m => [m.name, toPct(m.pct)]),
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [230, 230, 230] },
    margin: { left: margin, right: margin },
    theme: "grid",
  });
  y = (doc as any).lastAutoTable.finalY + 12;

  // Interpretación dinámica
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Interpretación preliminar (automática)", margin, y);
  y += 10;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const inter = interpretMix(mixGlobal);
  const interLines = doc.splitTextToSize(inter, pageW - margin * 2);
  doc.text(interLines, margin, y);
  y += 14 * interLines.length + 8;

  // Resultados por imagen (resumen)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Resultados por imagen", margin, y);
  y += 8;

  autoTable(doc, {
    startY: y + 6,
    head: [["Imagen", "Top minerales (%)", "Exclusiones"]],
    body: byImage.map((img, idx) => [
      img.filename || `Imagen ${idx + 1}`,
      img.minerals.slice(0, 3).map(m => `${m.name} (${m.pct.toFixed(2)}%)`).join(", "),
      img.excluded?.reason || "",
    ]),
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [230, 230, 230] },
    margin: { left: margin, right: margin },
    theme: "grid",
  });
  y = (doc as any).lastAutoTable.finalY + 12;

  // Tabla económica
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Estimación económica (referencial)", margin, y);
  y += 8;

  const econ = buildEconomics(mixGlobal, opts?.econ);
  autoTable(doc, {
    startY: y + 6,
    head: [["Commodity", "Tenor", "Unidad", "Payable", "Cantidad Pagable", "Precio", "Valor", "Moneda"]],
    body: econ.rows.map(r => [
      r.code,
      r.tenor.toFixed(2),
      r.unit,
      `${(r.payable * 100).toFixed(0)} %`,
      r.payQty.toFixed(2),
      r.price.toFixed(2),
      r.value.toFixed(2),
      r.currency,
    ]),
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [220, 235, 255] },
    margin: { left: margin, right: margin },
    theme: "grid",
    didDrawPage: (data) => {},
  });

  // Pie
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const footerY = doc.internal.pageSize.getHeight() - 26;
  doc.text(
    "Nota: Valores referenciales basados en señales minerales; requiere confirmación con ensayo químico. © MinQuant_WSCA",
    margin,
    footerY
  );

  return doc;
}
