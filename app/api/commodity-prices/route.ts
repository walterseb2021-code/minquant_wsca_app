// app/api/commodity-prices/route.ts
export const runtime = "nodejs";

/**
 * Endpoint de precios para MinQuant_WSCA — Versión estabilizada (sin scraping dinámico)
 *
 * Unidades:
 *  - Oro, Plata → USD/g
 *  - Resto de metales → USD/kg
 *
 * Estos valores están pensados para ser coherentes con:
 *  - La UI de /analisis
 *  - lib/pdf_plus.ts (BASE_COMMODITIES)
 *
 * Devuelve SIEMPRE JSON:
 * { currency, prices: {...}, units: {...}, updatedAt, source }
 */

type CurrencyCode = "USD" | "PEN" | "EUR";
type PriceMap = Record<string, number>;
type UnitMap = Record<string, string>;

// Tabla base estabilizada (puedes ajustar valores cuando quieras)
const FALLBACK_PRICES: PriceMap = {
  // Metales preciosos (USD/g)
  Oro: 131,      // ~ 4,071 USD/oz
  Plata: 1.67,   // ~ 52 USD/oz

  // Metales base (USD/kg) → ~ precios noviembre 2025 aproximados
  Cobre: 11,     // ~ 11,000 USD/t
  Aluminio: 2.8, // ~ 2,800 USD/t
  Zinc: 3.25,    // ~ 3,250 USD/t
  Plomo: 2.05,   // ~ 2,050 USD/t
  Estaño: 36.2,  // ~ 36,200 USD/t
  Níquel: 14.5,  // ~ 14,500 USD/t
};

// Mapa de unidades para que el front sepa qué está recibiendo
const FALLBACK_UNITS: UnitMap = {
  Oro: "USD/g",
  Plata: "USD/g",
  Cobre: "USD/kg",
  Aluminio: "USD/kg",
  Zinc: "USD/kg",
  Plomo: "USD/kg",
  Estaño: "USD/kg",
  Níquel: "USD/kg",
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const currency = (url.searchParams.get("currency") || "USD").toUpperCase() as CurrencyCode;

  // Por ahora SOLO devolvemos precios base en USD.
  // La conversión a PEN / EUR se hace en el front con los tipos de cambio manuales.
  return Response.json(
    {
      currency,
      prices: FALLBACK_PRICES,
      units: FALLBACK_UNITS,
      updatedAt: new Date().toISOString().slice(0, 10),
      source: "static-fallback",
    },
    {
      headers: { "Cache-Control": "no-store" },
    }
  );
}
