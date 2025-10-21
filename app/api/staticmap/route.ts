// app/api/staticmap/route.ts
export const runtime = "nodejs";

// Utilidad segura para números
function num(v: string | null, d: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

// Construye la URL de OSM Static Map (servidor .de o .fr)
function buildOSMUrl(lat: number, lng: number, zoom: number, size: string, host: "de" | "fr") {
  const base =
    host === "de"
      ? "https://staticmap.openstreetmap.de/staticmap.php"
      : "https://staticmap.openstreetmap.fr/staticmap/staticmap.php";
  const q = new URLSearchParams();
  q.set("center", `${lat},${lng}`);
  q.set("zoom", String(zoom));
  q.set("size", size);
  // marcador en el centro
  q.set("markers", `${lat},${lng},lightblue1`);
  return `${base}?${q.toString()}`;
}

// Tercer salvavidas: proxy público de imágenes (images.weserv.nl)
// Nota: weserv usa el parámetro `url` SIN esquema (http/https) y acepta querystring.
function buildWeservUrl(target: string) {
  // Remueve "https://" para cumplir con weserv
  const noScheme = target.replace(/^https?:\/\//, "");
  const u = new URL("https://images.weserv.nl/");
  u.searchParams.set("url", noScheme);
  // Desactiva compresión/optimización para evitar sorpresas
  u.searchParams.set("n", "1");
  return u.toString();
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = num(searchParams.get("lat"), NaN);
    const lng = num(searchParams.get("lng"), NaN);
    const zoom = Math.max(2, Math.min(20, num(searchParams.get("zoom"), 14)));
    const size = (searchParams.get("size") || "640x360").trim();

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !/^\d+x\d+$/.test(size)) {
      return new Response("Bad Request", { status: 400 });
    }

    // Intento 1: servidor .de
    const urlDE = buildOSMUrl(lat, lng, zoom, size, "de");
    const commonFetchOpts: RequestInit = {
      headers: { "User-Agent": "MinQuant_WSCA/1.0 (+https://example.local)" },
      cache: "no-store",
    };

    try {
      const r1 = await fetch(urlDE, commonFetchOpts);
      if (r1.ok) {
        const buf = await r1.arrayBuffer();
        return new Response(buf, {
          status: 200,
          headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
        });
      }
      // Si no ok, continuamos con fallback
    } catch {
      // seguimos a fallback
    }

    // Intento 2: servidor .fr
    const urlFR = buildOSMUrl(lat, lng, zoom, size, "fr");
    try {
      const r2 = await fetch(urlFR, commonFetchOpts);
      if (r2.ok) {
        const buf = await r2.arrayBuffer();
        return new Response(buf, {
          status: 200,
          headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
        });
      }
    } catch {
      // seguimos a fallback
    }

    // Intento 3: proxy images.weserv.nl sobre el .de (si .de cae, weserv suele resolver)
    try {
      const viaWeserv = buildWeservUrl(urlDE);
      const r3 = await fetch(viaWeserv, { cache: "no-store" });
      if (r3.ok) {
        const buf = await r3.arrayBuffer();
        const type = r3.headers.get("Content-Type") || "image/png";
        return new Response(buf, {
          status: 200,
          headers: { "Content-Type": type, "Cache-Control": "no-store" },
        });
      }
    } catch {
      // caeremos al error final
    }

    return new Response("Staticmap error: upstreams unavailable", { status: 502 });
  } catch (e: any) {
    return new Response(`Staticmap error: ${e?.message || e}`, { status: 500 });
  }
}
