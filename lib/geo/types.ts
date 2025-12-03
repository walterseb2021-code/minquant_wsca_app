// lib/geo/types.ts
export type CountryCode = string; // "PE", "CL", "US", ...

export type NearbyDeposit = {
  name: string;
  commodity: string[];    // ["Cu","Au","Ag",...]
  type?: string;          // pórfido, skarn, epitermal, VMS, etc.
  distanceKm?: number;    // si la fuente permite calcular distancia
  source?: string;        // etiqueta de la fuente
};

export type GeoContext = {
  countryCode: CountryCode;
  countryName: string;
  layers: {
    metalogenic?: boolean;
    deposits?: boolean;
    concessions?: boolean;
  };
  nearbyDeposits?: NearbyDeposit[];
  notes?: string[];
  sources?: Record<string, any>; // URLs o metadatos usados
};

export interface GeoProvider {
  /** Identificador del proveedor, ej: "PE-INGEMMET" */
  id: string;
  /** ¿Soporta el país dado? (cc mayúsculas ISO-3166-1 alfa-2) */
  supports(countryCode: CountryCode): boolean;
  /** Construye el contexto geológico normalizado para lat/lng */
  fetchContext(args: { lat: number; lng: number }): Promise<GeoContext>;
}
// === Yacimientos / canteras cercanas, usados en Nearby, PDF y UI ===
export type GeoSourceItem = {
  id?: string;
  name: string;
  /** Ej.: "Yacimiento aurífero", "Proyecto cuprífero", "Cantera no metálica" */
  type?: string;
  /** Puede venir como string o como array desde distintos proveedores */
  commodity?: string[] | string;
  latitude: number;
  longitude: number;
  distance_m?: number;
  source?: string;
  source_url?: string;
  raw?: any;
};

