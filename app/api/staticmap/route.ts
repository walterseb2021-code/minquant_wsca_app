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
        // Geoapify Static Maps
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

/**
 * Genera un SVG simple como fallback para evitar 502 en el PDF.
 * El SVG incluye un marcador y texto con lat/lng/zoom.
 */
function makeSvgFallback(width: number, height: number, lat: number, lng: number, zoom: number, providerErrors: string[]) {
  const w = Math.max(100, Math.min(2000, Math.round(width)));
  const h = Math.max(100, Math.min(2000, Math.round(height)));
  const title = `Mapa fallback (${lat.toFixed(6)}, ${lng.toFixed(6)})`;
  const escapedTitle = title.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const errorsText = providerErrors.length ? providerErrors.slice(0,6).join(" | ").replace(/&/g,"&amp;") : "Ningún proveedor disponible";
  // Marker position approximated in SVG coords (centro)
  const markerX = Math.round(w * 0.5);
  const markerY = Math.round(h * 0.45);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="g" x1="0" x2="1">
      <stop offset="0" stop-color="#eef2ff"/>
      <stop offset="1" stop-color="#f8fafc"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <!-- Marco -->
  <rect x="4" y="4" width="${w-8}" height="${h-8}" fill="none" stroke="#d1d5db" stroke-width="2" rx="6"/>
  <!-- Marcador -->
  <g transform="translate(${markerX}, ${markerY})">
    <circle cx="0" cy="0" r="${Math.max(6, Math.min(20, Math.floor(Math.min(w,h)/40)))}" fill="#1e40af" stroke="#fff" stroke-width="2"/>
    <text x="0" y="${Math.max(28, Math.floor(Math.min(w,h)/12))}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.max(10, Math.floor(Math.min(w,h)/20))}" text-anchor="middle" fill="#0f172a">${escapedTitle}</text>
  </g>
  <!-- Info abajo -->
  <rect x="12" y="${h - 72}" rx="6" ry="6" width="${w - 24}" height="56" fill="#ffffffee" stroke="#e5e7eb"/>
  <text x="24" y="${h - 48}" font-family="Arial, Helvetica, sans-serif" font-size="12" fill="#374151">Lat/Lng: ${lat.toFixed(6)}, ${lng.toFixed(6)} — Zoom: ${zoom}</text>
  <text x="24" y="${h - 28}" font-family="Arial, Helvetica, sans-serif" font-size="11" fill="#6b7280">Fallback providers: ${errorsText}</text>
</svg>`;
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

    // Soporte para varias variantes de la variable de entorno
    const geoKey = process.env.GEOAPIFY_KEY || process.env.GEOAPIFY_API_KEY || process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY || null;
    const providers = buildProviders(geoKey);

    const providerErrors: string[] = [];

    for (const p of providers) {
      const url = p.makeUrl(lat, lng, zoom, width, height);
      // Loguear la externalUrl que vamos a usar (sin key expuesta: si contiene API key, la mostramos parcialmente)
      try {
        const logUrl = String(url).replace(/(api(Key)?=)[^&]*/i, "$1[REDACTED]");
        console.log(`[staticmap] intentando provider=${p.name} externalUrl=${logUrl}`);
      } catch {
        console.log(`[staticmap] intentando provider=${p.name} (externalUrl oculto por seguridad)`);
      }

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
          // Leer un poco del body para registro (limitar tamaño)
          const txt = await r.text().catch(() => "");
          const snippet = txt ? txt.slice(0, 240) : `${r.status} ${r.statusText}`;
          providerErrors.push(`[${p.name}] ${r.status} ${snippet}`);
          console.warn(`[staticmap] provider ${p.name} fallo: ${r.status} ${r.statusText} — snippet: ${snippet}`);
        }
      } catch (e: any) {
        providerErrors.push(`[${p.name}] fetch error: ${e?.message || String(e)}`);
        console.warn(`[staticmap] provider ${p.name} fetch error: ${e?.message || String(e)}`);
      }
    }

    // Si ninguno devolvió imagen válida -> devolver SVG fallback (200) para proteger el flujo del PDF
    const svg = makeSvgFallback(width, height, lat, lng, zoom, providerErrors);
    return new Response(svg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Staticmap-Provider": "fallback",
        "X-Staticmap-Errors": providerErrors.slice(0,5).join(" | ")
      }
    });
  } catch (e: any) {
    const errMsg = `Staticmap error: ${e?.message || String(e)}`;
    console.error(errMsg);
    // En caso de fallo inesperado, devolver también un SVG con el error breve (evitar 500 crudo que rompa PDF)
    const svgErr = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="120"><rect width="100%" height="100%" fill="#fff"/><text x="12" y="24" font-family="Arial" font-size="13" fill="#b91c1c">Error generando staticmap:</text><text x="12" y="48" font-family="Arial" font-size="12" fill="#374151">${String(e?.message || e)}</text></svg>`;
    return new Response(svgErr, {
      status: 200,
      headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "no-store", "X-Staticmap-Provider": "fallback-error" }
    });
  }
}
