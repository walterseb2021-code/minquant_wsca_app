// app/api/commodity-prices/route.ts
export const runtime = "nodejs";

/**
 * Endpoint de precios para MinQuant_WSCA — GRATUITO
 * 
 * Prioridad:
 *   1) Westmetall — LME Official Prices (USD/ton)
 *   2) Fallback interno
 *
 * Devuelve SIEMPRE JSON: { currency, prices: {...}, updatedAt?, source }
 */

type CurrencyCode = "USD" | "PEN" | "EUR";
type PriceMap = Record<string, number>;

const FALLBACK: PriceMap = {
  Oro: 70000000,  // ~70k USD/kg (aplica a oro fino)
  Plata: 800000,  // ~800 USD/kg (aplica a plata fina)
  Cobre: 9000,
  Aluminio: 2500,
  Zinc: 2800,
  Plomo: 2000,
  Estaño: 33000,
  Níquel: 16000,
};

const WM_SYM_TO_NAME: Record<string, string> = {
  CU: "Cobre",
  ZN: "Zinc",
  PB: "Plomo",
  AL: "Aluminio",
  NI: "Níquel",
  SN: "Estaño",
};

function okNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

// Scraper Westmetall (LME Official USD/t)
async function fetchFromWestmetall(): Promise<{ prices: PriceMap; updatedAt?: string } | null> {
  const url = "https://www.westmetall.com/en/markdaten.php";
  const r = await fetch(url, {
    headers: { "User-Agent": "MinQuant_WSCA/1.0 (+vercel)" },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Westmetall HTTP ${r.status}`);

  const html = await r.text();
  const names = Object.keys(WM_SYM_TO_NAME).join("|"); // CU|ZN|PB|AL|NI|SN
  const regex = new RegExp(
    `(?:${names})[\\s\\S]{0,80}?(\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{0,2})?)`,
    "gi"
  );

  const priceBySym: Record<string, number> = {};
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    const match = m[0].match(new RegExp(`${names}`, "i"));
    if (!match) continue;
    const sym = match[0].toUpperCase();
    const price = Number(m[1].replace(/\./g, "").replace(/,/g, "."));
    if (okNumber(price)) priceBySym[sym] = price;
  }

  if (!Object.keys(priceBySym).length) return null;

  const prices: PriceMap = { ...FALLBACK };
  for (const [sym, val] of Object.entries(priceBySym)) {
    const es = WM_SYM_TO_NAME[sym];
    if (es) prices[es] = val;
  }

  return {
    prices,
    updatedAt: new Date().toISOString().slice(0, 10),
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const currency = (url.searchParams.get("currency") || "USD").toUpperCase() as CurrencyCode;

  try {
    const lme = await fetchFromWestmetall();
    if (lme?.prices) {
      return Response.json(
        { currency, prices: lme.prices, updatedAt: lme.updatedAt, source: "westmetall-lme" },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    return Response.json(
      { currency, prices: FALLBACK, updatedAt: undefined, source: "fallback" },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return Response.json(
      { currency, prices: FALLBACK, source: "error-fallback", error: String(e) },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
