// lib/pdf_plus.ts — Reporte general (mezcla, imágenes, interpretación y economía + mapa mejorado)
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/** Tipos principales */
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
  payableDefault: number;
  priceDefault: number;
  enabled?: boolean;
};

/** Catálogo base */
const BASE_COMMODITIES: Commodity[] = [
  { code: "Cu", display: "Cobre (Cu)", unit: "kg/t", payableDefault: 0.85, priceDefault: 9.0, enabled: true },
  { code: "Zn", display: "Zinc (Zn)", unit: "kg/t", payableDefault: 0.85, priceDefault: 2.7, enabled: true },
  { code: "Pb", display: "Plomo (Pb)", unit: "kg/t", payableDefault: 0.85, priceDefault: 2.1, enabled: true },
  { code: "Au", display: "Oro (Au)",  unit: "g/t",  payableDefault: 0.92, priceDefault: 75.0, enabled: true },
  { code: "Ag", display: "Plata (Ag)",unit: "g/t",  payableDefault: 0.90, priceDefault: 0.90, enabled: true },
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

/** Limpia caracteres problemáticos (• y saltos) */
function sanitizeText(s: string): string {
  return s
    .replace(/\u2022/g, "-")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

/** Obtiene imagen de mapa desde tu API interna (sin CORS) */
async function fetchStaticMap(lat: number, lng: number, width = 900, height = 380): Promise<string | null> {
  try {
    const url = `/api/staticmap?lat=${lat}&lng=${lng}&zoom=14&size=${width}x${height}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** === Heurísticas metalíferas (bilingüe ES/EN, case-insensitive) === */
const RX = {
  cu: /(malaquita|malachite|azurita|azurite|crisocola|chrysocolla|cuprita|cuprite|tenorita|tenorite|bornita|bornite|calcopirita|chalcopyrite)/i,
  fe: /(pirita|pyrite|hematita|hematite|goethita|goethite|magnetita|magnetite|limonita|limonite|marcasita|marcasite)/i,
  au: /(oro nativo|oro|gold|aurífer|auriferous|arsenopirita|arsenopyrite)/i,
  ag: /(plata nativa|plata|silver|argentita|argentite|acantita|acanthite|clorargirita|cerargyrite)/i,
  zn: /(esfalerita|sphalerite|blenda)/i,
  pb: /(galena)/i,
  gangas: /(calcita|calcite|dolomita|dolomite|barita|barite|cuarzo|quartz)/i,
};

/** Mapeo rápido mineral→metal usando RX */
function mineralToMetals(name: string): Commodity["code"][] {
  if (RX.cu.test(name)) return ["Cu"];
  if (RX.pb.test(name)) return ["Pb"];
  if (RX.zn.test(name)) return ["Zn"];
  if (RX.au.test(name)) return ["Au"];
  if (RX.ag.test(name)) return ["Ag"];
  if (RX.fe.test(name)) return ["Fe"];
  return [];
}

/** === Interpretación dinámica (bilingüe, ponderada por % del mix) === */
function interpretMix(mix: GlobalMix): string {
  // Peso acumulado por “familia”
  const w = {
    Cu: mix.filter(m => RX.cu.test(m.name)).reduce((a, b) => a + b.pct, 0),
    Fe: mix.filter(m => RX.fe.test(m.name)).reduce((a, b) => a + b.pct, 0),
    Au: mix.filter(m => RX.au.test(m.name)).reduce((a, b) => a + b.pct, 0),
    Ag: mix.filter(m => RX.ag.test(m.name)).reduce((a, b) => a + b.pct, 0),
    Zn: mix.filter(m => RX.zn.test(m.name)).reduce((a, b) => a + b.pct, 0),
    Pb: mix.filter(m => RX.pb.test(m.name)).reduce((a, b) => a + b.pct, 0),
    G:  mix.filter(m => RX.gangas.test(m.name)).reduce((a, b) => a + b.pct, 0),
  };

  const lines: string[] = [];

  // Dominancias (umbrales suaves)
  if (w.Cu >= 15) {
    const dominio = w.Cu >= 40 ? "Dominio cuprífero" : "Signo cuprífero";
    lines.push(`• ${dominio} (≈ ${round2(w.Cu)} % del ensamblaje): especies carbonato/óxido (malaquita/azurita/crisocola) sugieren zona oxidada; evaluar lixiviación o beneficio oxidado.`);
  }
  if (w.Fe >= 10) {
    lines.push(`• Impronta férrica (≈ ${round2(w.Fe)} %): gossan/meteorización o ambiente hidrotermal; la pirita puede correlacionar con Au fino.`);
  }
  if (w.Au >= 3) {
    lines.push(`• Potencial aurífero (≈ ${round2(w.Au)} %): revisar sulfuros finos (pirita/arsenopirita). Recomendado ensayo al fuego o metal screen.`);
  }
  if (w.Ag >= 5) {
    lines.push(`• Plata presente (≈ ${round2(w.Ag)} %): verificar mena argentífera secundaria (clorargirita) en zona oxidada.`);
  }
  if (w.Zn >= 5 || w.Pb >= 5) {
    const tags: string[] = [];
    if (w.Pb >= 5) tags.push(`Pb≈${round2(w.Pb)}%`);
    if (w.Zn >= 5) tags.push(`Zn≈${round2(w.Zn)}%`);
    lines.push(`• Firma polimetálica acompañante (${tags.join(" / ")}): puede adicionar valor en concentrado o blend.`);
  }
  if (w.G >= 10) {
    lines.push(`• Ganga significativa (≈ ${round2(w.G)} %: calcita/dolomita/cuarzo): posible dilución de leyes; considerar preconcentración o selección manual.`);
  }

  if (!lines.length) {
    lines.push("• Ensamble sin indicadores metálicos dominantes. Sugerido muestreo adicional y verificación analítica.");
  }

  // Advertencia fija (sanitizada)
  lines.push("• Estimación visual asistida por IA. Confirmar con ensayo químico (Au/Ag: fuego/AA; Cu/Pb/Zn: ICP/AA).");
  return sanitizeText(lines.join("\n"));
}

/** Construye tabla económica */
function buildEconomics(mix: GlobalMix, overrides?: EconOverrides) {
  const currency: CurrencyCode = overrides?.currency || "USD";
  const prices = overrides?.prices || {};
  const payables = overrides?.payables || {};

  const present = new Set<Commodity["code"]>();
  mix.forEach(m => mineralToMetals(m.name).forEach(code => present.add(code)));
  if (mix.some(m => /oro/i.test(m.name))) present.add("Au");
  if (mix.some(m => /plata/i.test(m.name))) present.add("Ag");

  const commodities = BASE_COMMODITIES.filter(c => (c.enabled || present.has(c.code)));

  // Tenores heurísticos (idénticos a versión previa)
  function estimateTenor(code: Commodity["code"]): number {
    const rel = mix.filter(m => mineralToMetals(m.name).includes(code)).reduce((a, b) => a + b.pct, 0);
    switch (code) {
      case "Cu": return round2(rel * 0.5);
      case "Zn":
      case "Pb": return round2(rel * 0.3);
      case "Au": return round2(rel * 0.2);
      case "Ag": return round2(rel * 1.5);
      case "Fe": return round2(rel * 0.4);
      default: return 0;
    }
  }

  const rows = commodities.map(c => {
    const tenor = estimateTenor(c.code);
    const payable = typeof payables[c.code] === "number" ? payables[c.code]! : c.payableDefault;
    const price = typeof prices[c.code] === "number" ? prices[c.code]! : c.priceDefault;
    const payQty = round2(tenor * payable);
    const value = round2(payQty * price);
    return { ...c, tenor, payable, payQty, price, value, currency };
  });

  return { currency, rows };
}

/** Genera el PDF principal */
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

  // Estilos consistentes
  const headFill = [230, 240, 255];
  const headText = [30, 30, 30];
  const cellText = [20, 20, 20];
  doc.setTextColor(...cellText);

  // Título
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(opts?.title || "Reporte de Análisis Mineral – MinQuant_WSCA", margin, y);
  y += 18;

  // Fecha
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const when = opts?.dateISO ? new Date(opts.dateISO).toLocaleString() : new Date().toLocaleString();
  doc.text(`Fecha: ${when}`, margin, y);
  y += 14;

  // Mapa
  if (typeof opts?.lat === "number" && typeof opts?.lng === "number") {
    const mapW = 220, mapH = 120, x = pageW - margin - mapW, topY = margin;
    try {
      const durl = await fetchStaticMap(opts.lat, opts.lng, 900, 380);
      if (durl) {
        doc.addImage(durl, "PNG", x, topY, mapW, mapH);
      } else {
        doc.setDrawColor(180); doc.rect(x, topY, mapW, mapH);
        doc.text("Mapa no disponible", x + 8, topY + 16);
      }
    } catch {
      doc.setDrawColor(180); doc.rect(x, topY, mapW, mapH);
      doc.text("Error al cargar mapa", x + 8, topY + 16);
    }
    doc.setFontSize(9);
    const coordY = margin + 140;
    doc.text(`Lat: ${opts.lat.toFixed(6)}  Lng: ${opts.lng.toFixed(6)}`, x, coordY);
  }

  // Nota
  if (opts?.note) {
    doc.setFontSize(9);
    const text = doc.splitTextToSize(sanitizeText(opts.note), pageW - margin * 2 - 240);
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
    styles: { fontSize: 9, cellPadding: 4, textColor: cellText },
    headStyles: { fillColor: headFill, textColor: headText },
    margin: { left: margin, right: margin },
    theme: "grid",
  });
  y = (doc as any).lastAutoTable.finalY + 12;

  // Interpretación (dinámica real)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Interpretación preliminar (automática)", margin, y);
  y += 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const interLines = doc.splitTextToSize(interpretMix(mixGlobal), pageW - margin * 2);
  doc.text(interLines, margin, y);
  y += 14 * interLines.length + 8;

  // Resultados por imagen
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
    styles: { fontSize: 9, cellPadding: 4, textColor: cellText },
    headStyles: { fillColor: headFill, textColor: headText },
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
    head: [["Commodity", "Tenor", "Unidad", "Payable", "Cant. Pagable", "Precio", "Valor", "Moneda"]],
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
    styles: { fontSize: 9, cellPadding: 4, textColor: cellText },
    headStyles: { fillColor: headFill, textColor: headText },
    margin: { left: margin, right: margin },
    theme: "grid",
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
