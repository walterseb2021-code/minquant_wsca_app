// lib/geo/providers/pe-ingemmet.ts
import type { GeoContext, GeoProvider } from "../types";
import { getCountrySources } from "../sources";

/**
 * Proveedor básico para Perú (INGEMMET).
 * Ahora mismo SOLO marca disponibilidad de capas si hay URLs en el catálogo
 * y devuelve enlaces de referencia. Luego podremos:
 *  - Consultar WFS para "nearbyDeposits"
 *  - Hacer buffering por distancia
 *  - Traer metadatos del depósito (tipo, commodities, etc.)
 */
export const PE_INGEMMET: GeoProvider = {
  id: "PE-INGEMMET",

  supports: (cc) => cc.toUpperCase() === "PE",

  async fetchContext({ lat, lng }): Promise<GeoContext> {
    const country = await getCountrySources("PE");
    const ing = country?.providers?.INGEMMET || {};

    const layers = {
      metalogenic: Boolean(ing.metalogenicWms),
      deposits: Boolean(ing.depositsWfs),
      concessions: Boolean(ing.concessionsWms),
    };

    // Placeholder: aún no consultamos WFS real (lo haremos en Sprint B)
    const nearbyDeposits = [] as GeoContext["nearbyDeposits"];

    const notes = [
      "Capas nacional(es) del INGEMMET disponibles según catálogo.",
      "Esta versión no consulta WFS; solo marca disponibilidad (Sprint B habilitará consultas reales)."
    ];

    return {
      countryCode: "PE",
      countryName: country?.name || "Perú",
      layers,
      nearbyDeposits,
      notes,
      sources: ing
    };
  }
};
