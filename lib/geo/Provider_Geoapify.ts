// lib/Geo/Provider_Geoapify.ts
import type { GeoSourceItem } from "./Types";

const GEOAPIFY_URL = "https://api.geoapify.com/v2/places";
const API_KEY = process.env.GEOAPIFY_KEY;

/**
 * getNearbyFromGeoapify
 * Llama a Geoapify Places y mapea la respuesta a GeoSourceItem[]
 * Default: incluye categorías orientadas a minería/cantera/geología (pero si Geoapify cambia su catálogo, la función
 * permite pasar categorías personalizadas en opts).
 */
export async function getNearbyFromGeoapify(
  lat: number,
  lon: number,
  opts?: { radius?: number; limit?: number; categories?: string[] }
): Promise<GeoSourceItem[]> {
  if (!API_KEY) {
    console.warn("GEOAPIFY_KEY no encontrada en .env.local — getNearbyFromGeoapify devolverá []");
    return [];
  }

  // Defaults
  const radius = opts?.radius ?? 50000; // 50 km
  const limit = opts?.limit ?? 50;
  const categories = (opts?.categories && opts.categories.length)
    ? opts.categories
    : ["industrial.mining", "landuse.quarry", "natural.geological"];

  try {
    const params = new URLSearchParams();
    // Geoapify espera filter=circle:lon,lat,radius
    params.set("filter", `circle:${lon},${lat},${radius}`);
    params.set("limit", String(limit));
    params.set("apiKey", API_KEY);
    // Aseguramos enviar categories (la API requiere que contenga algo válido)
    params.set("categories", categories.join(","));

    const url = `${GEOAPIFY_URL}?${params.toString()}`;

    // Log de debug (sustituimos la key por marcador)
    console.log("Geoapify URL:", url.replace(API_KEY, "GEOAPIFY_KEY_REMOVED"));

    const res = await fetch(url);
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      throw new Error(`Geoapify responded ${res.status} ${res.statusText} - ${bodyText}`);
    }

    const json = await res.json();

    // debug: cuántas features llegaron
    const count = Array.isArray(json.features) ? json.features.length : 0;
    console.log(`Geoapify returned ${count} features`);

    const items: GeoSourceItem[] = (json.features || []).map((f: any) => {
      const props = f.properties || {};
      const coords = f.geometry?.coordinates || [null, null];

      // intentar inferir commodities desde categories
      let commodity: string[] = [];
      if (Array.isArray(props.categories) && props.categories.length) {
        commodity = props.categories.map((c: any) => {
          if (typeof c === "string") return c;
          if (typeof c === "object" && c.name) return c.name;
          return String(c);
        }).slice(0, 3);
      }

      return {
        id: props.place_id ? String(props.place_id) : (props.osm_id ? String(props.osm_id) : undefined),
        name: props.name || props.address_line1 || props.formatted || "Sin nombre",
        commodity,
        latitude: coords[1] ?? 0,
        longitude: coords[0] ?? 0,
        distance_m: typeof props.distance === "number" ? props.distance : undefined,
        source: "Geoapify",
        source_url: props.url || props.website || undefined,
        raw: props,
      } as GeoSourceItem;
    });

    return items;
  } catch (err: any) {
    console.error("Error en getNearbyFromGeoapify:", err?.message ?? err);
    return [];
  }
}
