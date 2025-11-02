// lib/geo/reverse.ts
export async function reverseCountryCode(args: { lat: number; lng: number }): Promise<string> {
  const { lat, lng } = args;
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
    lat
  )}&lon=${encodeURIComponent(lng)}&zoom=5&addressdetails=1`;

  const r = await fetch(url, {
    headers: {
      "User-Agent": "MinQuant_WSCA/1.0 (+https://vercel.app)",
      "Accept": "application/json"
    },
    // Evita cachear para no tener sorpresas cuando pruebas
    cache: "no-store"
  });

  if (!r.ok) {
    // Fallback conservador: "PE"
    return "PE";
  }

  const j = (await r.json()) as any;
  // country_code suele venir en minúsculas: "pe", "us", ...
  const cc = (j?.address?.country_code || "").toUpperCase();
  return cc || "PE";
}
