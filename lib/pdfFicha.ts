// lib/pdfFicha.ts
// Genera una ficha técnica PDF individual por mineral
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface MineralFicha {
  name: string;
  formula?: string;
  commodity?: string;
  color?: string;
  brillo?: string;
  habito?: string;
  sistema?: string;
  densidad?: string;
  dureza?: string;
  ocurrencia?: string;
  asociados?: string;
  notas?: string;
  porcentaje?: number;
  valorUsdKg?: number;
  imagen?: string; // dataURL de la foto del mineral
}

export async function buildFichaPdf(mineral: MineralFicha) {
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const margin = 40;
  const lineHeight = 16;
  const A4w = 595.28;
  let y = margin;

  // ----- Título -----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(`Ficha Técnica — ${mineral.name}`, margin, y);
  y += 30;

  // ----- Imagen -----
  if (mineral.imagen) {
    try {
      doc.addImage(mineral.imagen, "JPEG", margin, y, 160, 160, "", "FAST");
    } catch {
      try {
        doc.addImage(mineral.imagen, "PNG", margin, y, 160, 160, "", "FAST");
      } catch {}
    }
  }

  // ----- Datos básicos -----
  const xData = margin + 180;
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  const rows = [
    ["Fórmula", mineral.formula || "-"],
    ["Commodity", mineral.commodity || "-"],
    ["Color", mineral.color || "-"],
    ["Brillo", mineral.brillo || "-"],
    ["Hábito", mineral.habito || "-"],
    ["Sistema", mineral.sistema || "-"],
    ["Densidad (g/cm³)", mineral.densidad || "-"],
    ["Dureza (Mohs)", mineral.dureza || "-"],
    ["Ocurrencia", mineral.ocurrencia || "-"],
    ["Minerales asociados", mineral.asociados || "-"],
    ["Notas", mineral.notas || "-"],
  ];

  autoTable(doc, {
    body: rows,
    startY: y,
    startX: xData,
    theme: "plain",
    styles: { fontSize: 10, textColor: 30, cellPadding: 2 },
  });

  y += 190;

  // ----- Porcentaje y valor -----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Datos económicos (estimados)", margin, y);
  y += lineHeight;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);

  const pct = mineral.porcentaje
    ? `${mineral.porcentaje.toFixed(1)} %`
    : "—";

  doc.text(`Presencia en la muestra: ${pct}`, margin, y);
  y += lineHeight;

  const valor = mineral.valorUsdKg
    ? `$${mineral.valorUsdKg.toFixed(2)} /kg`
    : "No disponible";
  doc.text(`Valor de referencia (USD/kg): ${valor}`, margin, y);
  y += lineHeight * 2;

  // ----- Comentario -----
  doc.setFontSize(10);
  doc.setTextColor(80);
  const comentario =
    "Esta ficha técnica es generada automáticamente con fines informativos. " +
    "Los valores aquí mostrados son de referencia y pueden variar según pureza, mercado y condiciones de extracción.";
  const split = doc.splitTextToSize(comentario, A4w - margin * 2);
  doc.text(split, margin, y);

  // ----- Pie -----
  doc.setFontSize(9);
  doc.setTextColor(120);
  const fecha = new Date().toLocaleString();
  doc.text(`Generado por MinQuant_WSCA — ${fecha}`, margin, 810, {
    align: "left",
  });
  doc.text("Ficha individual del mineral", A4w - margin, 810, {
    align: "right",
  });

  return doc;
}
