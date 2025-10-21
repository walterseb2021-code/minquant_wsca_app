// app/api/staticmap/route.ts
export const runtime = "nodejs";

// Util: número seguro con default
function num(v: string | null, d: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

// Construye URLs a distintos “upstreams” (sin API key)
function buildCandidates(lat: number, lng: number, zoom: number, size: string) {
  // size en formato 640x360
  const [w, h] = (size || "640x360").split("x").map(s => Math.max(64, Math.min(2048, Number(s) || 0)));
  const wPx = isFinite(w) ? w : 640;
  const hPx = isFinite(h) ? h : 360;

  // 1) OSM Alemania (clásico)
  const osmDE = `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=${zoom}&size=${wPx}x${hPx}&markers=${lat},${lng},lightblue1`;

  // 2) OSM Surround (alternativa comunitaria)
  const osmSurround = `https://staticmap.osmsurround.org/staticmap.php?center=${lat},${lng}&zoom=${zoom}&size=${wPx}x${hPx}&markers=${lat},${lng},ltblu-pushpin`;

  // 3) CDN alterno de OSM (algunas veces más estable)
  const osmCdn = `https://staticmap.3cdn.openstreetmap.org/staticmap.php?center=${lat},${lng}&zoom=${zoom}&size=${wPx}x${hPx}&markers=${lat},${lng},lightblue1`;

  return [osmDE, osmSurround, osmCdn];
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = num(searchParams.get("lat"), NaN);
    const lng = num(searchParams.get("lng"), NaN);
    const zoom = Math.max(2, Math.min(20, num(searchParams.get("zoom"), 14)));
    const size = (searchParams.get("size") || "640x360").trim();

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return new Response("Staticmap error: parámetros inválidos (lat/lng).", { status: 400 });
    }

    const candidates = buildCandidates(lat, lng, zoom, size);

    // Haremos intentos en cascada con timeout corto
    const ua = "MinQuant_WSCA/1.0 (+https://example.local)";
    const controller = new AbortController();
    const tryFetch = async (url: string) => {
      const t = setTimeout(() => controller.abort(), 7000); // 7s
      try {
        const r = await fetch(url, {
          headers: { "User-Agent": ua },
          cache: "no-store",
          signal: controller.signal,
        });
        clearTimeout(t);
        if (!r.ok) throw new Error(`Upstream ${r.status}`);
        const type = r.headers.get("content-type") || "image/png";
        const buf = await r.arrayBuffer();
        return new Response(buf, {
          status: 200,
          headers: { "Content-Type": type, "Cache-Control": "no-store" },
        });
      } catch (e) {
        clearTimeout(t);
        throw e;
      }
    };

    // Intenta cada proveedor hasta que uno funcione
    const errors: string[] = [];
    for (const u of candidates) {
      try {
        return await tryFetch(u);
      } catch (e: any) {
        errors.push(`${u} -> ${e?.message || e}`);
      }
    }

    // Si todos fallan, devolvemos diagnóstico
    return new Response(
      `Staticmap error: upstreams no disponibles.\n${errors.join("\n")}`,
      { status: 502 }
    );
  } catch (e: any) {
    return new Response(`Staticmap error: ${e?.message || e}`, { status: 500 });
  }
}
