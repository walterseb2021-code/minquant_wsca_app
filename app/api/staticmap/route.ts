// app/api/staticmap/route.ts
export const runtime = "nodejs";

function num(v: string | null, d: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

type Provider = {
  name: string;
  makeUrl: (lat: number, lng: number, zoom: number, size: string) => string;
};

// Lista de mirrors / servicios públicos sin API key.
// Iremos probando en este orden hasta que uno responda 200 OK (image/png).
const PROVIDERS: Provider[] = [
  {
    name: "osm-de",
    makeUrl: (lat, lng, zoom, size) =>
      `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=${zoom}&size=${encodeURIComponent(
        size
      )}&markers=${lat},${lng},lightblue1`,
  },
  {
    name: "osm-fr",
    makeUrl: (lat, lng, zoom, size) =>
      `https://staticmap.openstreetmap.fr/staticmap.php?center=${lat},${lng}&zoom=${zoom}&size=${encodeURIComponent(
        size
      )}&markers=${lat},${lng},lightblue1`,
  },
  {
    name: "osm-surround",
    makeUrl: (lat, lng, zoom, size) =>
      `https://staticmap.osmsurround.org/staticmap.php?center=${lat},${lng}&zoom=${zoom}&size=${encodeURIComponent(
        size
      )}&markers=${lat},${lng},lightblue1`,
  },
];

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = num(searchParams.get("lat"), NaN);
    const lng = num(searchParams.get("lng"), NaN);
    const zoom = Math.max(2, Math.min(20, num(searchParams.get("zoom"), 14)));
    const size = (searchParams.get("size") || "640x360").trim();

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return new Response("Bad Request: lat/lng inválidos", { status: 400 });
    }

    const headers = {
      // Algunos mirrors bloquean peticiones sin UA
      "User-Agent": "MinQuant_WSCA/1.0 (+https://minquant-wsca-app.vercel.app)",
      // Evita cachear mientras depuramos
      "Cache-Control": "no-store",
    } as const;

    const errors: string[] = [];

    for (const p of PROVIDERS) {
      const url = p.makeUrl(lat, lng, zoom, size);
      try {
        const r = await fetch(url, { headers, cache: "no-store" });

        // Aceptamos 200 con tipo imagen (png/jpg)
        const okType =
          r.ok &&
          /^image\/(png|jpeg|jpg|webp)/i.test(r.headers.get("content-type") || "");

        if (okType) {
          const buf = await r.arrayBuffer();
          return new Response(buf, {
            status: 200,
            headers: {
              "Content-Type": r.headers.get("content-type") || "image/png",
              "Cache-Control": "no-store",
              "X-Staticmap-Provider": p.name,
            },
          });
        } else {
          const txt = await r.text().catch(() => "");
          errors.push(`[${p.name}] ${r.status} ${txt.slice(0, 200)}`);
        }
      } catch (e: any) {
        errors.push(`[${p.name}] fetch error: ${e?.message || e}`);
      }
    }

    // Ningún provider respondió bien
    return new Response(
      `Staticmap upstreams unavailable:\n${errors.join("\n")}`,
      { status: 502 }
    );
  } catch (e: any) {
    return new Response(`Staticmap error: ${e?.message || e}`, { status: 500 });
  }
}
