// app/api/nearby/route.ts 
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/* ===============================================================
   1. HELPERS BÁSICOS
   =============================================================== */
function toRad(v: number) {
  return (v * Math.PI) / 180;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000; // metros
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function clean(s: any): string {
  if (s == null) return "";
  let str = String(s);
  try {
    if ((str as any).normalize) str = str.normalize("NFC");
  } catch {}
  return str.replace(/[\x00-\x1F\x7F]/g, "").trim();
}

function isCoord(n: any) {
  return typeof n === "number" && !Number.isNaN(n);
}

/* ===============================================================
   2. CENTROIDE UNIVERSAL (POINT / POLYGON / POLYLINE)
   =============================================================== */
function centroidOfGeometry(geom: any) {
  if (!geom) return null;

  // Caso 1: Point
  if (typeof geom.x === "number" && typeof geom.y === "number") {
    return { lat: geom.y, lon: geom.x };
  }

  // Caso 2: Polygon (rings)
  if (Array.isArray(geom.rings)) {
    try {
      const ring = geom.rings[0];
      if (!Array.isArray(ring) || ring.length === 0) return null;

      let x = 0;
      let y = 0;
      for (const p of ring) {
        x += p[0];
        y += p[1];
      }
      const lon = x / ring.length;
      const lat = y / ring.length;
      return { lat, lon };
    } catch {
      return null;
    }
  }

  // Caso 3: Polyline (paths)
  if (Array.isArray(geom.paths)) {
    try {
      const path = geom.paths[0];
      if (!Array.isArray(path) || path.length === 0) return null;

      let x = 0;
      let y = 0;
      for (const p of path) {
        x += p[0];
        y += p[1];
      }
      const lon = x / path.length;
      const lat = y / path.length;
      return { lat, lon };
    } catch {
      return null;
    }
  }

  return null;
}

/* ===============================================================
   3. ENDPOINTS INGEMMET (Concesiones / Metalogenético / Fallas)
   =============================================================== */
const ENDPOINTS = {
  concesiones:
    "https://geocatmin.ingemmet.gob.pe/arcgis/rest/services/SERV_CONCESIONES/MapServer/0/query",
  concesiones2:
    "https://geocatmin.ingemmet.gob.pe/arcgis/rest/services/SERV_CONCESIONES/MapServer/1/query",
  beneficios:
    "https://geocatmin.ingemmet.gob.pe/arcgis/rest/services/SERV_CONCESIONES/MapServer/2/query",
  metalog0:
    "https://geocatmin.ingemmet.gob.pe/arcgis/rest/services/SERV_METALOGENETICO/MapServer/0/query",
  metalog1:
    "https://geocatmin.ingemmet.gob.pe/arcgis/rest/services/SERV_METALOGENETICO/MapServer/1/query",
  fallas:
    "https://geocatmin.ingemmet.gob.pe/arcgis/rest/services/SERV_GEOLOGIA_FALLAS/MapServer/0/query",
};

/* ===============================================================
   4. QUERY ARC-GIS UNIVERSAL (USANDO BOUNDING BOX)
   =============================================================== */
async function queryArcGIS(
  baseUrl: string,
  lat: number,
  lon: number,
  radiusKm: number
) {
  // 1° ≈ 111 km → convertimos radio (km) a delta de grados
  const delta = radiusKm / 111;

  const minLon = lon - delta;
  const maxLon = lon + delta;
  const minLat = lat - delta;
  const maxLat = lat + delta;

  // Envelope: xmin, ymin, xmax, ymax
  const envelope = `${minLon},${minLat},${maxLon},${maxLat}`;

  const params = new URLSearchParams({
    f: "json",
    where: "1=1",
    outFields: "*",
    geometry: envelope,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    returnGeometry: "true",
  });

  const url = `${baseUrl}?${params.toString()}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    // si falla el servicio, devolvemos vacío para no romper el flujo
    return [];
  }

  const json = await res.json();
  return Array.isArray(json.features) ? json.features : [];
}

/* ===============================================================
   5. NORMALIZADORES (Concesiones / Yacim / Fallas)
   =============================================================== */

function normalizeConcesion(f: any, lat: number, lon: number) {
  const a = f.attributes ?? {};
  const center = centroidOfGeometry(f.geometry);

  const lat0 = center?.lat;
  const lon0 = center?.lon;

  const distance =
    isCoord(lat0) && isCoord(lon0)
      ? haversine(lat, lon, lat0 as number, lon0 as number)
      : undefined;

  const name =
    clean(a.NOM_CONCES) ||
    clean(a.NOMBRE) ||
    clean(a.DM) ||
    "Concesión sin nombre";

  const sustancia = clean(a.SUSTANCIA);
  const modalidad = clean(a.MODALIDAD);
  const estado = clean(a.ESTADO);

  let subtype = modalidad || sustancia || estado;
  if (!subtype && estado) subtype = estado;

  const commodities: string[] = [];
  if (sustancia) commodities.push(sustancia);

  return {
    id: String(a.OBJECTID ?? crypto.randomUUID()),
    name,
    type: "concesion minera",
    subtype,
    commodity: commodities,
    latitude: lat0,
    longitude: lon0,
    distance_m: distance,
    source: "INGEMMET – Concesiones",
    source_url: "https://geocatmin.ingemmet.gob.pe/geocatmin/main",
    raw: a,
  };
}

function normalizeYacimiento(f: any, lat: number, lon: number, capa: string) {
  const a = f.attributes ?? {};
  const center = centroidOfGeometry(f.geometry);

  const lat0 = center?.lat;
  const lon0 = center?.lon;

  const distance =
    isCoord(lat0) && isCoord(lon0)
      ? haversine(lat, lon, lat0 as number, lon0 as number)
      : undefined;

  const comm = [a.ELE_PRINC, a.ELE_ACOMP]
    .filter(Boolean)
    .map((x: any) => clean(x));

  const name =
    clean(a.UNIDAD) ||
    clean(a.NOMBRE) ||
    clean(a.T_YACIM) ||
    "Yacimiento sin nombre";

  return {
    id: String(a.OBJECTID ?? crypto.randomUUID()),
    name,
    type: "yacimiento",
    subtype: capa, // "Proyectos" / "Yacimientos"
    commodity: comm,
    latitude: lat0,
    longitude: lon0,
    distance_m: distance,
    source: "INGEMMET – Metalogenético",
    source_url: "https://geocatmin.ingemmet.gob.pe/geocatmin/main",
    raw: a,
  };
}

function normalizeFalla(f: any, lat: number, lon: number) {
  const a = f.attributes ?? {};
  const center = centroidOfGeometry(f.geometry);

  const lat0 = center?.lat;
  const lon0 = center?.lon;

  const distance =
    isCoord(lat0) && isCoord(lon0)
      ? haversine(lat, lon, lat0 as number, lon0 as number)
      : undefined;

  return {
    id: String(a.OBJECTID ?? crypto.randomUUID()),
    name: clean(a.NOMBRE ?? "Falla sin nombre"),
    type: "falla geológica",
    subtype: clean(a.TIPO ?? ""),
    commodity: [] as string[],
    latitude: lat0,
    longitude: lon0,
    distance_m: distance,
    source: "INGEMMET – Fallas",
    source_url: "https://geocatmin.ingemmet.gob.pe/geocatmin/main",
    raw: a,
  };
}

/* ===============================================================
   5.5. DEDUPLICACIÓN INTELIGENTE
   (nombre + tipo + conjunto de commodities)
   =============================================================== */
function dedupeNearby(items: any[]) {
  const seen = new Set<string>();
  const cleaned: any[] = [];

  for (const it of items) {
    const nameKey = clean(it.name).toUpperCase();
    const typeKey = clean(it.type).toUpperCase();

    let commKey = "";
    if (Array.isArray(it.commodity)) {
      const arr = it.commodity
        .map((c: any) => clean(c).toUpperCase())
        .filter(Boolean)
        .sort();
      commKey = arr.join("|");
    } else {
      commKey = clean(it.commodity).toUpperCase();
    }

    const key = `${nameKey}||${typeKey}||${commKey}`;

    if (!seen.has(key)) {
      seen.add(key);
      cleaned.push(it);
    }
  }

  return cleaned;
}

/* ===============================================================
   6. HANDLER PRINCIPAL
   =============================================================== */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = Number(searchParams.get("lat"));
    const lon = Number(searchParams.get("lon"));
    const radiusKmRaw = Number(searchParams.get("radius_km") || "12");

    if (!isCoord(lat) || !isCoord(lon)) {
      return NextResponse.json(
        { items: [], error: "Parámetros de coordenadas inválidos" },
        { status: 400 }
      );
    }

    // Limitar radio a un rango razonable (5–50 km)
    const radiusKm = Math.min(Math.max(radiusKmRaw || 12, 5), 50);

    // ---- Concesiones ----
    const c0 = await queryArcGIS(ENDPOINTS.concesiones, lat, lon, radiusKm);
    const c1 = await queryArcGIS(ENDPOINTS.concesiones2, lat, lon, radiusKm);
    const c2 = await queryArcGIS(ENDPOINTS.beneficios, lat, lon, radiusKm);

    const concesiones = [
      ...c0.map((f) => normalizeConcesion(f, lat, lon)),
      ...c1.map((f) => normalizeConcesion(f, lat, lon)),
      ...c2.map((f) => normalizeConcesion(f, lat, lon)),
    ];

    // ---- Yacimientos (metalogenético) ----
    const y0 = await queryArcGIS(ENDPOINTS.metalog0, lat, lon, radiusKm);
    const y1 = await queryArcGIS(ENDPOINTS.metalog1, lat, lon, radiusKm);

    const yacims = [
      ...y0.map((f) => normalizeYacimiento(f, lat, lon, "Proyectos")),
      ...y1.map((f) => normalizeYacimiento(f, lat, lon, "Yacimientos")),
    ];

    // ---- Fallas ----
    const fal = await queryArcGIS(ENDPOINTS.fallas, lat, lon, radiusKm);
    const fallas = fal.map((f) => normalizeFalla(f, lat, lon));

    // -----------------------------------------------------------
    // COMBINAR, DEDUPLICAR Y ORDENAR POR DISTANCIA
    // -----------------------------------------------------------
    const combined = [...concesiones, ...yacims, ...fallas].filter(
      (it) => isCoord(it.latitude) && isCoord(it.longitude)
    );

    const items = dedupeNearby(combined);

    items.sort(
      (a, b) => (a.distance_m ?? 1e12) - (b.distance_m ?? 1e12)
    );

    return NextResponse.json({
      count: items.length,
      items,
    });
  } catch (e: any) {
    console.error("Error en /api/nearby:", e);
    return NextResponse.json(
      { error: e?.message ?? "internal error", items: [] },
      { status: 500 }
    );
  }
}
