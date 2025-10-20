// app/api/commodity-prices/route.ts
// Devuelve precios por tonelada de metal (por ahora USD). Fuentes:
// 1) Si COMMODITY_PRICES_JSON_URL está definido, lo usa (JSON { prices: {Nombre: number}, currency: "USD", updatedAt?: ISO })
// 2) Si falla, usa un respaldo interno.

export const runtime = "nodejs";
export const maxDuration = 30;

const FALLBACK = {
  currency: "USD",
  updatedAt: undefined,
  prices: {
    Oro: 70000000,
    Plata: 800000,
    Cobre: 9000,
    Aluminio: 2300,
    Zinc: 2600,
    Plomo: 2200,
    Estaño: 25000,
    Níquel: 17000,
  },
};

export async function GET() {
  try {
    const url = process.env.COMMODITY_PRICES_JSON_URL?.trim();
    if (url) {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      // Validación muy básica
      if (!j || typeof j !== "object" || !j.prices) throw new Error("bad schema");
      const out = {
        currency: (j.currency || "USD") as string,
        updatedAt: j.updatedAt || new Date().toISOString(),
        prices: j.prices as Record<string, number>,
      };
      return Response.json(out, { status: 200 });
    }
    return Response.json(FALLBACK, { status: 200 });
  } catch (e: any) {
    return Response.json({ ...FALLBACK, error: e?.message || String(e) }, { status: 200 });
  }
}
