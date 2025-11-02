// app/api/geocontext/route.ts
import { getProvider } from "@/lib/geo/registry";
import { reverseCountryCode } from "@/lib/geo/reverse";
import { getCountrySources } from "@/lib/geo/sources";

export const runtime = "nodejs";

function toNum(v: string | null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * GET /api/geocontext?lat=-9.12&lng=-78.52[&cc=PE]
 * - Detecta país por reverse-geocoding (o usa ?cc=…)
 * - Elige proveedor por país
 * - Devuelve GeoContext normalizado
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = toNum(searchParams.get("lat"));
    const lng = toNum(searchParams.get("lng"));
    const ccOverride = searchParams.get("cc"); // permite forzar país, ej "PE"

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return new Response("Bad Request: lat/lng inválidos", { status: 400 });
    }

    const cc = (ccOverride || await reverseCountryCode({ lat, lng })).toUpperCase();
    const prov = getProvider(cc);

    if (!prov) {
      // Sin provider: devolvemos país y nombre si existen en el catálogo
      const country = await getCountrySources(cc);
      return Response.json({
        countryCode: cc,
        countryName: country?.name || "Desconocido",
        layers: {},
        nearbyDeposits: [],
        notes: [`No hay proveedor registrado para ${cc}.`]
      });
    }

    const ctx = await prov.fetchContext({ lat, lng });
    return Response.json(ctx);
  } catch (e: any) {
    return new Response(`GeoContext error: ${e?.message || String(e)}`, { status: 500 });
  }
}
