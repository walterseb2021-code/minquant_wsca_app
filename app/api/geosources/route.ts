import { NextResponse } from "next/server";
import { SOURCES } from "@/lib/geo/sources";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const raw = (searchParams.get("country") || "").trim();

    // Normalizamos a minúsculas sin acentos
    const country = raw
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    // === PERÚ ===
    if (country === "peru" || country === "pe") {
      const peru = SOURCES.filter(
        (s) =>
          s.country
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase() === "peru"
      );

      return new NextResponse(JSON.stringify({ sources: peru }), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
      });
    }

    // === GLOBAL ===
    if (country === "global" || country === "worldwide") {
      const globalList = SOURCES.filter(
        (s) => s.country.toLowerCase() === "global"
      );

      return new NextResponse(JSON.stringify({ sources: globalList }), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
      });
    }

    // === OTRO país -> enviar solo globales (fallback) ===
    const fallback = SOURCES.filter(
      (s) => s.country.toLowerCase() === "global"
    );

    return new NextResponse(JSON.stringify({ sources: fallback }), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  } catch (err: any) {
    return new NextResponse(
      JSON.stringify({
        error: err?.message || "Error inesperado en geosources",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
      }
    );
  }
}
