// lib/Geo/Provider_Overpass.ts
import type { GeoSourceItem } from "./Types";

/**
 * getNearbyFromOverpass
 * Consulta Overpass API (OpenStreetMap) para buscar features relacionadas con minería/canteras.
 * - Usa query 'around' con radio (metros).
 * - Devuelve GeoSourceItem[] normalizado.
 */
export async function getNearbyFromOverpass(
  lat: number,
  lon: number,
  opts?: { radius?: number; limit?: number }
): Promise<GeoSourceItem[]> {
  const radius = opts?.radius ?? 50000; // 50 km por defecto
  const limit = opts?.limit ?? 50;
  const endpoint = "https://overpass-api.de/api/interpreter";

  // Overpass QL — buscamos nodos/ways/relations con etiquetas típicas de minas/canteras
  const q = `
    [out:json][timeout:25];
    (
      node["mine"](around:${radius},${lat},${lon});
      way["mine"](around:${radius},${lat},${lon});
      relation["mine"](around:${radius},${lat},${lon});
      node["landuse"="quarry"](around:${radius},${lat},${lon});
      way["landuse"="quarry"](around:${radius},${lat},${lon});
      relation["landuse"="quarry"](around:${radius},${lat},${lon});
      node["natural"="rock"](around:${radius},${lat},${lon});
      way["natural"="rock"](around:${radius},${lat},${lon});
      relation["natural"="rock"](around:${radius},${lat},${lon});
    );
    out center ${limit};
  `;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(q)}`,
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error("Overpass API error:", res.status, res.statusText, txt);
      return [];
    }

    const json = await res.json();
    const elements = json.elements || [];

    // Mapear elementos Overpass a GeoSourceItem[]
    const items: GeoSourceItem[] = elements.map((el: any) => {
      const tags = el.tags || {};
      // Coordenadas: node->lat/lon; way/relation->center
      const latitude = el.lat ?? (el.center && el.center.lat) ?? (el.bounds && (el.bounds.minlat + el.bounds.maxlat) / 2) ?? 0;
      const longitude = el.lon ?? (el.center && el.center.lon) ?? (el.bounds && (el.bounds.minlon + el.bounds.maxlon) / 2) ?? 0;

      // Intentar inferir commodity desde tags (ej. "mineral", "rock:composition", "quarry" describer)
      const commodityCandidates: string[] = [];
      if (tags["mineral"]) commodityCandidates.push(tags["mineral"]);
      if (tags["rock:composition"]) commodityCandidates.push(tags["rock:composition"]);
      if (tags["natural"]) commodityCandidates.push(tags["natural"]);
      if (tags["landuse"]) commodityCandidates.push(tags["landuse"]);
      // fallback: name/tag keys that can hint
      if (tags["name"] && /mina|mineral|quarry|cantera|pit|mine/i.test(tags["name"])) commodityCandidates.push(tags["name"]);

      const commodity = Array.from(new Set(commodityCandidates)).slice(0, 3);

      const name = tags["name"] || tags["operator"] || tags["description"] || (tags["site"] ? tags["site"] : "Sin nombre");

      // Fuente: OSM element URL (no requiere key)
      const osmType = el.type; // node/way/relation
      const osmId = el.id;
      const source_url = `https://www.openstreetmap.org/${osmType}/${osmId}`;

      return {
        id: `${osmType}/${osmId}`,
        name,
        commodity,
        latitude: Number(latitude),
        longitude: Number(longitude),
        // distance_m se calculará en Nearby.ts
        source: "OpenStreetMap/Overpass",
        source_url,
        raw: { tags, osmType, osmId },
      } as GeoSourceItem;
    });

    return items.slice(0, limit);
  } catch (err) {
    console.error("Error in getNearbyFromOverpass:", err);
    return [];
  }
}
