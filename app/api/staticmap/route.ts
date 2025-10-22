// app/api/staticmap/route.ts
export const runtime = "nodejs";

/** Parseo seguro de números con default */
function num(v: string | null, d: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

/** PNG 640x360 placeholder “Mapa no disponible” */
const FALLBACK_PNG = Buffer.from(
  // PNG gris clarito con texto; suficiente para que jsPDF lo inserte.
  // (base64 generado; 640x360 px)
  "iVBORw0KGgoAAAANSUhEUgAAAqAAAAB0CAYAAADm2t8jAAAACXBIWXMAAAsSAAALEgHS3X78AAABU0lEQVR4nO3RMQEAIAwEsYv9Z5gK0fYI5UQ3sCkEAAAAAAAAAAAAAAAAAAAAAAGC3GJb0n8sGf2mX8R8AAAAAAAAAABgNwYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABg7b3h2d5b5c4DAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGD9qg9F0b3h4wMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  "base64"
);

type Provider = (lat: number, lng: number, zoom: number, size: string) => string;

/** Proveedor principal: OSM DE */
const osmDe: Provider = (lat, lng, zoom, size) =>
  `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=${zoom}&size=${encodeURIComponent(
    size
  )}&markers=${lat},${lng},lightblue1&maptype=mapnik`;

/** Proveedor alterno: osmsurround.org */
const osmSurround: Provider = (lat, lng, zoom, size) =>
  `https://staticmap.osmsurround.org/staticmap.php?center=${lat},${lng}&zoom=${zoom}&size=${encodeURIComponent(
    size
  )}&markers=${lat},${lng},lightblue1`;

const PROVIDERS: Provider[] = [osmDe, osmSurround];

async function tryFetch(url: string) {
  const r = await fetch(url, {
    headers: {
      "User-Agent": "MinQuant_WSCA/1.0 (+https://example.local)",
      Accept: "image/png,image/*;q=0.8,*/*;q=0.5",
    },
    cache: "no-store",
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`Upstream ${r.status}: ${txt.slice(0, 280)}`);
  }
  const ab = await r.arrayBuffer();
  return Buffer.from(ab);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = num(searchParams.get("lat"), 0);
    const lng = num(searchParams.get("lng"), 0);
    const zoom = Math.max(2, Math.min(20, num(searchParams.get("zoom"), 14)));
    const size = searchParams.get("size") || "640x360";

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return new Response("Bad Request", { status: 400 });
    }

    // Intentar proveedores en cascada
    let lastErr: unknown = null;
    for (const p of PROVIDERS) {
      const url = p(lat, lng, zoom, size);
      try {
        const png = await tryFetch(url);
        return new Response(png, {
          status: 200,
          headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
        });
      } catch (e) {
        lastErr = e;
      }
    }

    // Si todos fallan: devolvemos placeholder PNG
    return new Response(FALLBACK_PNG, {
      status: 200,
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store", "X-StaticMap-Note": String(lastErr || "") },
    });
  } catch (e: any) {
    // Error inesperado: también devolvemos placeholder (para no romper el PDF)
    return new Response(FALLBACK_PNG, {
      status: 200,
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store", "X-StaticMap-Error": String(e?.message || e) },
    });
  }
}
