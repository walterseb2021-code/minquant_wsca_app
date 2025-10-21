// app/api/staticmap/route.ts
export const runtime = "nodejs";

function num(v: string | null, d: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = num(searchParams.get("lat"), NaN);
    const lng = num(searchParams.get("lng"), NaN);
    const zoom = Math.max(2, Math.min(20, num(searchParams.get("zoom"), 14)));
    const size = searchParams.get("size") || "640x360";

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return new Response("Bad Request: lat/lng inválidos", { status: 400 });
    }

    // 1º intenta Alemania (.de), 2º Francia (.fr)
    const endpoints = [
      (lat: number, lng: number, zoom: number, size: string) =>
        `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=${zoom}&size=${encodeURIComponent(
          size
        )}&markers=${lat},${lng},lightblue1`,
      (lat: number, lng: number, zoom: number, size: string) =>
        `https://staticmap.openstreetmap.fr/staticmap.php?center=${lat},${lng}&zoom=${zoom}&size=${encodeURIComponent(
          size
        )}&markers=${lat},${lng},lightblue1`,
    ];

    const ua = { "User-Agent": "MinQuant_WSCA/1.0 (+https://vercel.app)" };
    const errors: string[] = [];

    for (const makeUrl of endpoints) {
      const url = makeUrl(lat, lng, zoom, size);
      try {
        const osm = await fetch(url, { headers: ua, cache: "no-store" });
        if (osm.ok) {
          const buf = await osm.arrayBuffer();
          // algunos servidores responden image/png, otros image/jpeg
          const ct = osm.headers.get("content-type") || "image/png";
          return new Response(buf, {
            status: 200,
            headers: { "Content-Type": ct, "Cache-Control": "no-store" },
          });
        } else {
          const txt = await osm.text().catch(() => "");
          errors.push(`Upstream ${new URL(url).host} -> ${osm.status} ${txt.slice(0, 200)}`);
        }
      } catch (e: any) {
        errors.push(`Fetch ${new URL(url).host} -> ${e?.message || String(e)}`);
      }
    }

    return new Response(
      `Staticmap error: ningún endpoint respondió.\n${errors.join("\n")}`,
      { status: 502 }
    );
  } catch (e: any) {
    return new Response(`Staticmap error: ${e?.message || e}`, { status: 500 });
  }
}
