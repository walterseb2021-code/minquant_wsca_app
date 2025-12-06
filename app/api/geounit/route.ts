import { NextResponse } from "next/server";

/**
 * API /api/geounit?lat=...&lng=...
 * Opción C: intenta primero mapa geológico 1:100 000, si falla usa 1:1M.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { ok: false, error: "Lat/Lng inválidos" },
      { status: 400 }
    );
  }

  // TODO: ajusta estas URLs según los servicios que ya estés usando.
  // 1) Servicio detallado 1:100 000 (ejemplo, pon aquí el tuyo real)
  const GEO_100K = "https://geocatmin.ingemmet.gob.pe/arcgis/rest/services/SERV_GEOLOGIA_100K/MapServer";

  // 2) Servicio general 1:1M (este sí lo tienes en geo-sources.json)
  const GEO_1M = "https://geocatmin.ingemmet.gob.pe/arcgis/rest/services/SERV_GEOLOGIA/MapServer";

  async function queryService(baseUrl: string) {
    if (!baseUrl) return null;

    const params = new URLSearchParams({
      f: "json",
      geometry: `${lng},${lat}`,       // ArcGIS usa X,Y = lng,lat
      geometryType: "esriGeometryPoint",
      sr: "4326",
      layers: "all",                   // todas las capas, tomamos la primera que devuelva
      tolerance: "5",
      mapExtent: `${lng - 0.1},${lat - 0.1},${lng + 0.1},${lat + 0.1}`,
      imageDisplay: "800,600,96",
      returnGeometry: "false",
    });

    try {
      const res = await fetch(`${baseUrl}/identify?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) return null;

      const json = await res.json() as any;
      const feat = json.results?.[0];
      const attrs = feat?.attributes;
      if (!attrs) return null;

      // Aquí probamos varios nombres de campos típicos
      const unit =
        attrs.UNIDAD ||
        attrs.UNIT_NAME ||
        attrs.NOMBRE_UNID ||
        attrs.NOMBRE ||
        null;

      const lithology =
        attrs.LITOLOGIA ||
        attrs.LITOL ||
        attrs.LITOLGIA ||
        attrs.LITOLOGY ||
        null;

      const age =
        attrs.EDAD ||
        attrs.EDAD_GEO ||
        attrs.ERA ||
        attrs.PER_GEO ||
        null;

      const code =
        attrs.CODUNI ||
        attrs.COD_UNID ||
        attrs.CODIGO ||
        null;

      if (!unit && !lithology && !age && !code) {
        return null;
      }

      return {
        unit,
        lithology,
        age,
        code,
        source: json?.serviceName
          ? `INGEMMET – ${json.serviceName}`
          : "INGEMMET – Mapa geológico",
      };
    } catch (err) {
      console.error("Error consultando servicio geológico:", err);
      return null;
    }
  }

  // 1) Intento con 1:100 000
  let geology = await queryService(GEO_100K);

  // 2) Si no hay resultado, usamos 1:1M
  if (!geology) {
    geology = await queryService(GEO_1M);
  }

  if (!geology) {
    return NextResponse.json(
      { ok: false, geology: null, message: "Sin datos geológicos para este punto." },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, geology });
}
