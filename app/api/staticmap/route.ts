// app/api/staticmap/route.ts
export const runtime = "nodejs";

function num(v: string | null, d: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

/**
 * Render de mapa usando Geoapify Static Maps.
 * Docs: https://apidocs.geoapify.com/docs/maps/static/api
 * Requiere la env GEOAPIFY_API_KEY (ya la creaste en Vercel).
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = num(searchParams.get("lat"), NaN);
    const lng = num(searchParams.get("lng"), NaN);
    const zoom = Math.max(2, Math.min(20, num(searchParams.get("zoom"), 14)));
    const size = (searchParams.get("size") || "640x360").trim(); // "ancho x alto"

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return new Response("Bad Request: lat/lng inválidos", { status: 400 });
    }

    const key = process.env.GEOAPIFY_API_KEY?.trim();
    if (!key) {
      return new Response("Falta GEOAPIFY_API_KEY", { status: 500 });
    }

    // Parsear "640x360" -> w,h
    const m = size.match(/^(\d+)x(\d+)$/);
    const w = m ? Math.max(100, Math.min(2000, +m[1])) : 640;
    const h = m ? Math.max(100, Math.min(2000, +m[2])) : 360;

    // Estilo osm-bright, pin azul en el centro
    const marker = `lonlat:${lng},${lat};color:%23007AFF;size:medium;type:material`;
    const url =
      `https://maps.geoapify.com/v1/staticmap?` +
      `style=osm-bright&width=${w}&height=${h}` +
      `&center=lonlat:${lng},${lat}&zoom=${zoom}` +
      `&marker=${encodeURIComponent(marker)}` +
      `&apiKey=${encodeURIComponent(key)}`;

    const r = await fetch(url, { cache: "no-store" });

    const okType =
      r.ok && /^image\/(png|jpeg|webp)/i.test(r.headers.get("content-type") || "");

    if (!okType) {
      const txt = await r.text().catch(() => "");
      return new Response(
        `Geoapify error ${r.status}\n${txt.slice(0, 500)}`,
        { status: 502 }
      );
    }

    const buf = await r.arrayBuffer();
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": r.headers.get("content-type") || "image/png",
        "Cache-Control": "no-store",
        "X-Staticmap-Provider": "geoapify",
      },
    });
  } catch (e: any) {
    return new Response(`Staticmap error: ${e?.message || e}`, { status: 500 });
  }
}
