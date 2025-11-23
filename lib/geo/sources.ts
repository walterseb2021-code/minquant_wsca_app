// lib/geo/sources.ts
// Catálogo reducido y verificado de fuentes geoespaciales para MinQuant_WSCA

export type GeoSource = {
  country: string;       
  name: string;          
  type: "WMS" | "WFS" | "Portal" | "WebMap";
  url: string;           
  notes?: string;        
};

export const SOURCES: GeoSource[] = [
  {
    country: "Global",
    name: "ArcGIS: Global Mines and Minerals (WebMap)",
    type: "WebMap",
    url: "https://www.arcgis.com/apps/mapviewer/index.html?webmap=83ba2b12bc944167a40289cbdb931f39",
    notes: "WebMap ArcGIS Online — visor con yacimientos minerales a nivel global."
  },

  {
    country: "Global",
    name: "IGF – Critical Minerals Map (Interactive)",
    type: "Portal",
    url: "https://www.igfmining.org/es/resource/igf-critical-minerals-map/",
    notes: "Mapa interactivo sobre minerales críticos (portal del IGF)."
  },

  {
    country: "Global",
    name: "OneGeology – Portal Global",
    type: "Portal",
    url: "https://portal.onegeology.org/OnegeologyGlobal/",
    notes: "Portal global con catálogo de datasets; algunos ofrecen WMS/WFS."
  },

  {
    country: "Perú",
    name: "GEOCATMIN – INGEMMET (Portal Geocatmin)",
    type: "Portal",
    url: "https://geocatmin.ingemmet.gob.pe/geocatmin/main",
    notes: "Portal oficial de INGEMMET (Perú)."
  },

  {
    country: "Global",
    name: "USGS National Map Services",
    type: "Portal",
    url: "https://apps.nationalmap.gov/services/",
    notes: "Portal USGS — útil como recurso global."
  },

  {
    country: "Global",
    name: "OneGeology Catalog (GeoNetwork)",
    type: "Portal",
    url: "https://onegeology-geonetwork.brgm.fr/geonetwork/srv/api/records",
    notes: "Catálogo de datasets con servicios WMS/WFS."
  }
];

export default SOURCES;
