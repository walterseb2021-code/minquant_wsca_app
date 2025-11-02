import { SOURCES, type GeoSource } from "./sources";

export async function getAvailableSources(country: string): Promise<GeoSource[]> {
  if (country === "auto" || country === "Desconocido") {
    return SOURCES.filter(s => s.country === "Perú"); // fallback
  }
  return SOURCES.filter(s => s.country.toLowerCase().includes(country.toLowerCase()));
}
