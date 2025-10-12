// mineral-app/app/api/staticmap/route.ts
export const runtime = "nodejs";

function num(v: string | null, d: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = num(searchParams.get("lat"), 0);
    const lng = num(searchParams.get("lng"), 0);
    const zoom = Math.max(2, Math.min(20, num(searchParams.get("zoom"), 14)));
    // Formato ancho x alto en píxeles (ej. 640x360)
    const size = searchParams.get("size") || "640x360";

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return new Response("Bad Request", { status: 400 });
    }

    // Servicio público de mapas estáticos de OSM:
    // docs: https://wiki.openstreetmap.org/wiki/Static_map_images
    const url = `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=${zoom}&size=${encodeURIComponent(
      size
    )}&markers=${lat},${lng},lightblue1`;

    const osm = await fetch(url, {
      // Algunos proxies necesitan un user-agent
      headers: { "User-Agent": "MinQuant_WSCA/1.0 (+https://example.local)" },
      // Sin cache para que no choque mientras depuramos
      cache: "no-store",
    });

    if (!osm.ok) {
      // Regresa texto para ver el motivo en la consola si algo falla
      const txt = await osm.text().catch(() => "");
      return new Response(`Upstream error ${osm.status}\n${txt}`, {
        status: 500,
      });
    }

    // Devolvemos el binario PNG directamente
    const buf = await osm.arrayBuffer();
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return new Response(`Staticmap error: ${e?.message || e}`, { status: 500 });
  }
}
