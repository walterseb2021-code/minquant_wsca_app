// lib/Geo/Provider_Geoapify.ts
import type { GeoSourceItem } from "./Types";

const GEOAPIFY_URL = "https://api.geoapify.com/v2/places";
const API_KEY = process.env.GEOAPIFY_KEY;

/**
 * Categorías válidas en Geoapify relacionadas a minería, cantera o geología.
 * (Seleccionadas de la lista oficial de categorías soportadas)
 */
const VALID_MINING_CATEGORIES = [
  // Rasgos naturales rocosos / geológicos
  "natural.mountain.rock",
  "natural.mountain.cave_entrance",

  // Áreas industriales que a veces representan plantas / operaciones
  "building.industrial",
  "production.factory",
];


/**
 * getNearbyFromGeoapify
 * Llama a Geoapify Places y mapea la respuesta a GeoSourceItem[]
 */
export async function getNearbyFromGeoapify(
  lat: number,
  lon: number,
  opts?: { radius?: number; limit?: number; categories?: string[] }
): Promise<GeoSourceItem[]> {
  if (!API_KEY) {
    console.warn("GEOAPIFY_KEY no encontrada en .env.local — Geoapify devolverá []");
    return [];
  }

  const radius = opts?.radius ?? 50000; // 50 km
  const limit = opts?.limit ?? 50;
  const categories =
    opts?.categories?.length ? opts.categories : VALID_MINING_CATEGORIES;

  try {
    const params = new URLSearchParams();
    params.set("filter", `circle:${lon},${lat},${radius}`);
    params.set("limit", String(limit));
    params.set("apiKey", API_KEY);
    params.set("categories", categories.join(","));

    const url = `${GEOAPIFY_URL}?${params.toString()}`;

    console.log("Geoapify URL:", url.replace(API_KEY, "GEOAPIFY_KEY_REMOVED"));

       const res = await fetch(url);
    if (!res.ok) {
      let msg = `Geoapify responded ${res.status}`;
      try {
        const body = await res.json();
        if (body?.message) msg += `: ${body.message}`;
      } catch {
        // ignoramos parseos fallidos
      }
      throw new Error(msg);
    }


    const json = await res.json();

    const features = Array.isArray(json.features) ? json.features : [];
    console.log(`Geoapify returned ${features.length} features`);

    const items: GeoSourceItem[] = features.map((f: any) => {
      const props = f.properties || {};
      const coords = f.geometry?.coordinates || [0, 0];

      let commodity: string[] = [];
      if (Array.isArray(props.categories)) {
        commodity = props.categories
          .map((c: any) => (typeof c === "string" ? c : c?.name ?? ""))
          .slice(0, 5);
      }

      return {
        id: props.place_id ? String(props.place_id) : undefined,
        name: props.name || props.address_line1 || props.formatted || "Sin nombre",
        commodity,
        latitude: coords[1],
        longitude: coords[0],
        distance_m: typeof props.distance === "number" ? props.distance : undefined,
        source: "Geoapify",
        source_url: props.url || props.website || undefined,
        raw: props
      };
    });

    return items;
  } catch (err: any) {
    console.error("Error en getNearbyFromGeoapify:", err?.message ?? err);
    return [];
  }
}
