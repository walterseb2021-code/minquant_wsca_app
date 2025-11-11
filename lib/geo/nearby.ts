// lib/Geo/Nearby.ts
import type { GeoSourceItem } from "./Types";
import { getNearbyFromGeoapify } from "./Provider_Geoapify";
import { getNearbyFromOverpass } from "./Provider_Overpass";

/**
 * Utilidades internas
 */
function toRad(v: number) { return v * Math.PI / 180; }
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000; // metros
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * withTimeout
 * Ejecuta una promesa con timeout. Si se supera, rechaza.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`timeout ${ms}ms`)), ms);
    promise.then((v) => { clearTimeout(id); resolve(v); }).catch((err) => { clearTimeout(id); reject(err); });
  });
}

/**
 * mergeItems
 * Si hay duplicados aproximados (mismo nombre y cercanía), los fusiona:
 * - concatena commodities sin duplicados
 * - conserva la menor distance_m si existe
 * - conserva source/source_url concatenados (opcional)
 */
function mergeItems(a: GeoSourceItem, b: GeoSourceItem): GeoSourceItem {
  const commodities = Array.from(new Set([...(a.commodity || []), ...(b.commodity || [])]));
  const distance_m = (typeof a.distance_m === "number" && typeof b.distance_m === "number")
    ? Math.min(a.distance_m, b.distance_m)
    : a.distance_m ?? b.distance_m;
  const source = a.source === b.source ? a.source : `${a.source} / ${b.source}`;
  const source_url = a.source_url ?? b.source_url;
  return {
    id: a.id ?? b.id,
    name: a.name || b.name,
    commodity: commodities,
    latitude: a.latitude ?? b.latitude,
    longitude: a.longitude ?? b.longitude,
    distance_m,
    source,
    source_url,
    raw: a.raw ?? b.raw,
  };
}

/**
 * findNearby
 * Orquesta providers, calcula distancias, deduplica y ordena por cercanía.
 *
 * Opciones:
 *  - maxResults (default 20)
 *  - timeoutMs (timeout por provider, default 6000)
 */
export async function findNearby(
  lat: number,
  lon: number,
  options?: { maxResults?: number; timeoutMs?: number }
): Promise<GeoSourceItem[]> {
  if (typeof lat !== "number" || typeof lon !== "number" || Number.isNaN(lat) || Number.isNaN(lon)) {
    throw new Error("findNearby: lat and lon must be valid numbers");
  }

  const maxResults = options?.maxResults ?? 20;
  const timeoutMs = options?.timeoutMs ?? 6000;

  // Lista de providers — añadimos Geoapify y Overpass (OSM)
  const providerCalls: Array<Promise<GeoSourceItem[]>> = [
    withTimeout(getNearbyFromGeoapify(lat, lon), timeoutMs).catch((err) => {
      // No queremos que un provider caído rompa todo; devolvemos lista vacía
      console.warn("Provider Geoapify failed:", err.message || err);
      return [] as GeoSourceItem[];
    }),
    withTimeout(getNearbyFromOverpass(lat, lon), timeoutMs).catch((err) => {
      console.warn("Provider Overpass failed:", err.message || err);
      return [] as GeoSourceItem[];
    }),
  ];

  // Ejecutar todos los providers en paralelo
  const settled = await Promise.all(providerCalls);
  // aplanar
  let items: GeoSourceItem[] = settled.flat();

  // Calcular distancia si no está presente
  items = items.map((it) => {
    const distance = haversineDistance(lat, lon, it.latitude, it.longitude);
    return { ...it, distance_m: distance };
  });

  // Deduplicación aproximada: clave por nombre (minusculas) + coordenadas redondeadas
  // Redondeo a 4 decimales (~11 m) para agrupar muy cercanos; puedes ajustar a 3 si prefieres ~111 m
  const keyMap = new Map<string, GeoSourceItem>();
  for (const it of items) {
    const nameKey = (it.name || "").trim().toLowerCase();
    const latKey = Number(it.latitude).toFixed(4);
    const lonKey = Number(it.longitude).toFixed(4);
    const key = `${nameKey}|${latKey}|${lonKey}`;

    if (!keyMap.has(key)) {
      keyMap.set(key, it);
    } else {
      const existing = keyMap.get(key)!;
      keyMap.set(key, mergeItems(existing, it));
    }
  }

  let uniqueItems = Array.from(keyMap.values());

  // Ordenar por distancia ascendente
  uniqueItems.sort((a, b) => {
    const da = a.distance_m ?? Number.POSITIVE_INFINITY;
    const db = b.distance_m ?? Number.POSITIVE_INFINITY;
    return da - db;
  });

  // Limitar resultados
  uniqueItems = uniqueItems.slice(0, maxResults);

  return uniqueItems;
}
