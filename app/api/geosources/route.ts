// app/api/geosources/route.ts
import { NextResponse } from "next/server";
import { findNearby } from "../../../lib/Geo/Nearby";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    // Aceptamos lat/lon con varias keys posibles (lat/lon, latitude/longitude, lng)
    const latParam = url.searchParams.get("lat") ?? url.searchParams.get("latitude");
    const lonParam = url.searchParams.get("lon") ?? url.searchParams.get("lng") ?? url.searchParams.get("longitude");

    if (!latParam || !lonParam) {
      return NextResponse.json({ error: "Se requieren los parámetros lat y lon en la query." }, { status: 400 });
    }

    const lat = parseFloat(latParam);
    const lon = parseFloat(lonParam);

    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return NextResponse.json({ error: "lat y lon deben ser números válidos." }, { status: 400 });
    }

    // Opciones opcionales: puedes ajustar maxResults o timeoutMs aquí
    const items = await findNearby(lat, lon, { maxResults: 20, timeoutMs: 6000 });

    return NextResponse.json({ items });
  } catch (err) {
    console.error("Error en /api/geosources:", err);
    return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
  }
}
