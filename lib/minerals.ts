// lib/minerals.ts — cliente con caché para /api/mineral-info

export type MineralInfo = {
  nombre: string;
  formula?: string;
  densidad?: string;
  mohs?: string;
  color?: string;
  brillo?: string;
  habito?: string;
  sistema?: string;
  ocurrencia?: string;
  asociados?: string;
  commodity?: string;
  notas?: string;
};

const cache = new Map<string, MineralInfo>();

export async function getMineralInfo(name: string): Promise<MineralInfo> {
  const key = (name || "").trim().toLowerCase();
  if (cache.has(key)) return cache.get(key)!;

  try {
    const url = `/api/mineral-info?name=${encodeURIComponent(name)}`;
    const r = await fetch(url, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error || "Bad response");
    cache.set(key, j);
    return j;
  } catch {
    // mínimo para no romper UI/PDF si todo falla
    const fallback: MineralInfo = { nombre: name };
    cache.set(key, fallback);
    return fallback;
  }
}
