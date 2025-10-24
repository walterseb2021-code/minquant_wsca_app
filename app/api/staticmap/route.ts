// app/api/staticmap/route.ts
export const runtime = "nodejs";

function toNum(v: string | null, d: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function parseSize(sizeParam: string | null) {
  // Esperamos "900x380" -> width=900, height=380
  const m = (sizeParam || "").match(/^(\d+)\s*x\s*(\d+)$/i);
  let width = 900, height = 380;
  if (m) {
    width = Math.max(100, Math.min(2000, parseInt(m[1], 10)));
    height = Math.max(100, Math.min(2000, parseInt(m[2], 10)));
  }
  return { width, height };
}

type Provider = {
  name: string;
  makeUrl: (lat: number, lng: number, zoom: number, width: number, height: number) => string;
};

function buildProviders(geoKey?: string | null): Provider[] {
  const arr: Provider[] = [];
  // 1) Geoapify primero (si hay API key)
  if (geoKey) {
    arr.push({
      name: "geoapify",
      makeUrl: (lat, lng, zoom, width, height) =>
        // Doc: https://www.geoapify.com/static-maps-api
        `https://maps.geoapify.com/v1/staticmap?style=osm-carto` +
        `&width=${width}&height=${height}` +
        `&center=lonlat:${lng},${lat}` +
        `&zoom=${zoom}` +
        `&marker=lonlat:${lng},${lat};type:material;color:%233a86ff;size:medium` +
        `&apiKey=${encodeURIComponent(geoKey)}`
    });
  }
  // 2) Mirrors OSM (sin API key) como respaldo
  arr.push(
    {
      name: "osm-de",
      makeUrl: (lat, lng, zoom, width, height) =>
        `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=${zoom}&size=${width}x${height}&markers=${lat},${lng},lightblue1`
    },
    {
      name: "osm-fr",
      makeUrl: (lat, lng, zoom, width, height) =>
        `https://staticmap.openstreetmap.fr/staticmap.php?center=${lat},${lng}&zoom=${zoom}&size=${width}x${height}&markers=${lat},${lng},lightblue1`
    },
    {
      name: "osm-surround",
      makeUrl: (lat, lng, zoom, width, height) =>
        `https://staticmap.osmsurround.org/staticmap.php?center=${lat},${lng}&zoom=${zoom}&size=${width}x${height}&markers=${lat},${lng},lightblue1`
    }
  );
  return arr;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = toNum(searchParams.get("lat"), NaN);
    const lng = toNum(searchParams.get("lng"), NaN);
    const zoom = Math.max(2, Math.min(20, toNum(searchParams.get("zoom"), 14)));
    const { width, height } = parseSize(searchParams.get("size"));

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return new Response(`Bad Request: lat/lng inválidos`, { status: 400 });
    }

    const UA = "MinQuant_WSCA/1.0 (+https://vercel.app)";
    const headers = { "User-Agent": UA, "Cache-Control": "no-store" } as const;

    const geoKey = process.env.GEOAPIFY_API_KEY || process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY || null;
    const providers = buildProviders(geoKey);

    const errors: string[] = [];

    for (const p of providers) {
      const url = p.makeUrl(lat, lng, zoom, width, height);
      try {
        const r = await fetch(url, { headers, cache: "no-store" });
        const ct = (r.headers.get("content-type") || "").toLowerCase();

        // Aceptamos 200 con tipo imagen
        if (r.ok && /^image\/(png|jpe?g|webp)/.test(ct)) {
          const buf = await r.arrayBuffer();
          return new Response(buf, {
            status: 200,
            headers: {
              "Content-Type": ct || "image/png",
              "Cache-Control": "no-store",
              "X-Staticmap-Provider": p.name
            }
          });
        } else {
          const txt = await r.text().catch(() => "");
          errors.push(`[${p.name}] ${r.status} ${txt.slice(0, 240)}`);
        }
      } catch (e: any) {
        errors.push(`[${p.name}] fetch error: ${e?.message || String(e)}`);
      }
    }

    // Si ninguno funcionó
    return new Response(`Staticmap upstreams unavailable:\n${errors.join("\n")}`, { status: 502 });
  } catch (e: any) {
    return new Response(`Staticmap error: ${e?.message || String(e)}`, { status: 500 });
  }
}
