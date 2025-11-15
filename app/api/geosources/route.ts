// app/api/geosources/route.ts
import { NextResponse } from "next/server";
// IMPORT CORREGIDO: path sensible a mayúsculas — debe coincidir exactamente con el nombre del fichero en lib/geo
import { findNearby } from "../../../lib/geo/nearby";

export const runtime = "nodejs";

function toNum(v: string | null) {
  if (!v) return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    // Aceptamos lat/lon con varias keys posibles (lat/lon, latitude/longitude, lng)
    const latParam = url.searchParams.get("lat") ?? url.searchParams.get("latitude");
    const lonParam =
      url.searchParams.get("lon") ?? url.searchParams.get("lng") ?? url.searchParams.get("longitude");

    if (!latParam || !lonParam) {
      return NextResponse.json({ error: "Se requieren los parámetros lat y lon en la query." }, { status: 400 });
    }

    const lat = toNum(latParam);
    const lon = toNum(lonParam);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return NextResponse.json({ error: "lat y lon deben ser números válidos." }, { status: 400 });
    }

    // Llamada a la función que busca y devuelve items (asegúrate que lib/geo/nearby.ts exporta findNearby)
    const items = await findNearby(lat, lon, { maxResults: 20, timeoutMs: 6000 });

    return NextResponse.json({ items });
  } catch (err: any) {
    console.error("Error en /api/geosources:", err);
    return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
  }
}
