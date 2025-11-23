// app/api/nearby/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Tipo que espera tu front (GeoSourceItem compatible)
type NearbyItem = {
  id: string;
  name: string;
  commodity?: string;
  latitude?: number;
  longitude?: number;
  distance_m?: number;
  source: string;
  source_url?: string;
  raw?: any;
};

// Servicio de INGEMMET: YACIMIENTOS MINEROS
const YACIMIENTOS_URL =
  "https://geocatmin.ingemmet.gob.pe/arcgis/rest/services/SERV_METALOGENETICO/MapServer/1/query";

// Caja aproximada de Perú para decidir cuándo usar INGEMMET
function isInPeru(lat: number, lon: number): boolean {
  // Muy simple pero suficiente para este uso
  return lat <= 0 && lat >= -20 && lon <= -68 && lon >= -83;
}

// Limpieza mínima de textos (sin depender de otras libs)
function clean(s: any): string {
  if (s == null) return "";
  let str = String(s);
  try {
    if ((str as any).normalize) str = str.normalize("NFC");
  } catch {}
  // quitar caracteres de control
  str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  return str.trim();
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = Number(searchParams.get("lat"));
    const lon = Number(searchParams.get("lon"));
    const radiusKm = Number(searchParams.get("radius_km") || "15"); // por defecto 15 km

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return NextResponse.json(
        { error: "Parámetros 'lat' y 'lon' inválidos", items: [] },
        { status: 400 }
      );
    }

    // Si no está en el rango de Perú aún no consultamos nada (luego se puede ampliar)
    if (!isInPeru(lat, lon)) {
      return NextResponse.json({
        items: [],
        note:
          "El punto está fuera del rango aproximado de Perú. " +
          "Por ahora sólo se consulta INGEMMET para coordenadas dentro de Perú.",
      });
    }

    const safeRadius = Number.isFinite(radiusKm) && radiusKm > 0 ? radiusKm : 15;

    // Armamos la URL de consulta al servicio de YACIMIENTOS MINEROS
    const qs = new URLSearchParams({
      f: "json",
      where: "1=1",
      outFields:
        "OBJECTID,UNIDAD,T_YACIM,ST_YACIM,ELE_PRINC,ELE_ACOMP,DEPART,PROV,DM,LATITUD,LONGITUD,REF_WEB,URL_BOLETIN",
      geometry: `${lon},${lat}`, // ArcGIS espera X,Y = lon,lat
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      distance: String(safeRadius),
      units: "esriSRUnit_Kilometer",
      returnGeometry: "false",
    });

    const url = `${YACIMIENTOS_URL}?${qs.toString()}`;

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        {
          error: `Error al consultar INGEMMET (${res.status})`,
          detail: text.slice(0, 300),
          items: [],
        },
        { status: 502 }
      );
    }

    const data: any = await res.json();
    const features: any[] = Array.isArray(data?.features) ? data.features : [];

    const items: NearbyItem[] = features.map((f, idx) => {
      const a = f.attributes ?? {};
      const latVal = Number(a.LATITUD ?? lat);
      const lonVal = Number(a.LONGITUD ?? lon);

      const nameParts = [a.UNIDAD, a.T_YACIM, a.ST_YACIM].filter(Boolean).map(clean);
      const name =
        nameParts.join(" – ") || `Yacimiento ${a.OBJECTID ?? idx + 1}`;

      const commParts = [a.ELE_PRINC, a.ELE_ACOMP].filter(Boolean).map(clean);
      const commodity = commParts.join(", ");

      return {
        id: String(a.OBJECTID ?? idx),
        name,
        commodity,
        latitude: Number.isFinite(latVal) ? latVal : undefined,
        longitude: Number.isFinite(lonVal) ? lonVal : undefined,
        // Por ahora no tenemos campo de distancia real del servicio
        distance_m: undefined,
        source: "INGEMMET – Yacimientos Mineros (SERV_METALOGENETICO)",
        source_url: "https://geocatmin.ingemmet.gob.pe/geocatmin/main",
        raw: a,
      };
    });

    return NextResponse.json({ items });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: err?.message || "Error interno en /api/nearby",
        items: [],
      },
      { status: 500 }
    );
  }
}
