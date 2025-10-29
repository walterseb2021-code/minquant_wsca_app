// lib/pdf_plus.ts
import type { jsPDF } from "jspdf";
import { buildReportPdf } from "./pdf";

export type Interpretation = {
  geology: string;
  economics: string;
  caveats: string;
};

type CommodityAdjustments = Record<string, { recovery: number; payable: number }>;

type BuildArgs = {
  appName: string;
  sampleCode: string;
  results: { name: string; pct: number }[];
  perImage: { fileName: string; results: { name: string; pct: number }[] }[];
  imageDataUrls: string[];
  generatedAt: string;
  location?: { lat: number; lng: number; accuracy?: number; address?: string };
  embedStaticMap?: boolean;
  recoveryPayables?: CommodityAdjustments;
  interpretation?: Interpretation; // ← NUEVO
  excluded?: { fileName: string; reason: string }[];
};

/** Añade una sección con 3 bloques de interpretación en una nueva página */
function appendInterpretationPage(doc: jsPDF, args: BuildArgs) {
  const inter = args.interpretation;
  if (!inter) return;

  doc.addPage();
  const left = 18;
  let y = 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Interpretación geológica y económica (preliminar)", left, y); y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);

  const drawBlock = (title: string, text: string) => {
    doc.setFont("helvetica", "bold");
    doc.text(title, left, y); y += 6;
    doc.setFont("helvetica", "normal");
    const split = doc.splitTextToSize(text || "—", 175);
    doc.text(split, left, y);
    y += split.length * 5 + 6;
  };

  drawBlock("• Geología", inter.geology);
  drawBlock("• Economía", inter.economics);
  drawBlock("• Advertencias", inter.caveats);

  // Si hay excluidas, listarlas brevemente
  if (Array.isArray(args.excluded) && args.excluded.length) {
    doc.setFont("helvetica", "bold");
    doc.text("Imágenes excluidas (baja confianza/consenso/timeout)", left, y); y += 6;
    doc.setFont("helvetica", "normal");
    const lines = args.excluded.map(e => `- ${e.fileName}: ${e.reason}`);
    const split = doc.splitTextToSize(lines.join("\n"), 175);
    doc.text(split, left, y);
  }
}

/** Wrapper: construye tu PDF normal y añade la página de interpretación */
export async function buildReportPdfPlus(args: BuildArgs) {
  const doc = await buildReportPdf({
    appName: args.appName,
    sampleCode: args.sampleCode,
    results: args.results,
    perImage: args.perImage,
    imageDataUrls: args.imageDataUrls,
    generatedAt: args.generatedAt,
    location: args.location,
    embedStaticMap: args.embedStaticMap,
    recoveryPayables: args.recoveryPayables,
  } as any);

  appendInterpretationPage(doc, args);
  return doc;
}
