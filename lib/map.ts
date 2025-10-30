// lib/map.ts — Utilidad para obtener una miniatura estática de mapa como dataURL
export type MapProvider = "osm" | "wikimaps";

const osmStatic = (lat: number, lng: number, zoom = 14, w = 400, h = 220) =>
  `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=${zoom}&size=${w}x${h}&markers=${lat},${lng},lightblue1`;

const wikiStatic = (lat: number, lng: number, zoom = 14, w = 400, h = 220) =>
  `https://maps.wikimedia.org/img/osm-intl,${zoom},${lng},${lat},${w}x${h}.png`;

async function fetchAsDataURL(url: string): Promise<string> {
  const res = await fetch(url, { mode: "cors" }).catch(() => null as any);
  if (!res || !res.ok) throw new Error("map_fetch_error");
  const blob = await res.blob();
  const reader = new FileReader();
  return await new Promise((resolve, reject) => {
    reader.onerror = () => reject(new Error("map_read_error"));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

/**
 * Devuelve un dataURL listo para jsPDF.addImage. Si falla todo, retorna null.
 */
export async function getStaticMapDataURL(
  lat?: number,
  lng?: number,
  opts?: { zoom?: number; width?: number; height?: number }
): Promise<string | null> {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  const { zoom = 14, width = 400, height = 220 } = opts || {};
  const candidates = [
    osmStatic(lat, lng, zoom, width, height),
    wikiStatic(lat, lng, zoom, width, height),
  ];
  for (const url of candidates) {
    try {
      const durl = await fetchAsDataURL(url);
      if (durl) return durl;
    } catch {}
  }
  return null;
}
