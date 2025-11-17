// app/api/geosources/route.ts
import { NextResponse } from "next/server";
import { SOURCES } from "@/lib/geo/sources";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const country = searchParams.get("country") || "";

    // --- NUEVA LÓGICA ---
    // 1) SI ES PERÚ → SOLO INGEMMET
    if (country === "Perú") {
      const peru = SOURCES.filter((s) => s.country === "Perú");
      return NextResponse.json({ sources: peru });
    }

    // 2) SI ES GLOBAL → SOLO FUENTES GLOBALES
    if (country === "Global") {
      const globalSources = SOURCES.filter((s) => s.country === "Global");
      return NextResponse.json({ sources: globalSources });
    }

    // 3) SI ES OTRO PAÍS → usar SOLO fuentes globales
    const fallbackGlobal = SOURCES.filter((s) => s.country === "Global");
    return NextResponse.json({ sources: fallbackGlobal });

  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Unknown error" },
      { status: 500 }
    );
  }
}
