// app/api/geocontext/route.ts
// Servicio de contexto geográfico compatible con Vercel y Next 15
// Corrige los imports relativos y mantiene la funcionalidad original

import { getProvider } from "../../../lib/geo/registry";
import { reverseCountryCode } from "../../../lib/geo/reverse";
import { getCountrySources } from "../../../lib/geo/sources";

export const runtime = "nodejs";

// Conversión segura de string a número
function toNum(v: string | null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Endpoint principal:
 * GET /api/geocontext?lat=-9.12&lng=-78.52[&cc=PE]
 *
 * - Detecta el país usando reverse-geocoding (o el parámetro ?cc=…)
 * - Elige proveedor de datos geoespaciales según el país
 * - Devuelve un objeto normalizado GeoContext con capas, depósitos, etc.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = toNum(searchParams.get("lat"));
    const lng = toNum(searchParams.get("lng"));
    const ccOverride = searchParams.get("cc"); // ejemplo: "PE"

    // Validación de coordenadas
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return new Response("Bad Request: lat/lng inválidos", { status: 400 });
    }

    // Obtener código de país (override o por geocodificación inversa)
    const cc = (ccOverride || (await reverseCountryCode({ lat, lng }))).toUpperCase();

    // Buscar proveedor según el país
    const prov = getProvider(cc);

    // Si no hay proveedor registrado
    if (!prov) {
      const country = await getCountrySources(cc);
      return Response.json({
        countryCode: cc,
        countryName: country?.name || "Desconocido",
        layers: {},
        nearbyDeposits: [],
        notes: [`No hay proveedor registrado para el país ${cc}.`],
      });
    }

    // Obtener contexto geográfico del proveedor
    const ctx = await prov.fetchContext({ lat, lng });
    return Response.json(ctx);

  } catch (e: any) {
    console.error("[GeoContext] Error:", e);
    return new Response(`GeoContext error: ${e?.message || String(e)}`, { status: 500 });
  }
}
