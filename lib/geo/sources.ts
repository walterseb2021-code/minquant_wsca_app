// geo/sources.ts — Catálogo internacional de fuentes geoespaciales (WMS / WFS / Portales)

export type GeoSource = {
  country: string;       // País o región
  name: string;          // Nombre descriptivo
  type: "WMS" | "WFS" | "Portal"; // Tipo de servicio
  url: string;           // URL del servicio
};

/**
 * Catálogo base de fuentes geológicas oficiales
 * Cada entrada representa un servicio WMS/WFS compatible con OGC.
 * Estos endpoints pueden consultarse mediante GetCapabilities o integrarse en mapas base.
 */
export const SOURCES: GeoSource[] = [
  // ---------------------------------------------------------
  // 🇵🇪 PERÚ – INGEMMET (GEOCATMIN)
  // ---------------------------------------------------------
  {
    country: "Perú",
    name: "Geología nacional 1:1M – INGEMMET",
    type: "WMS",
    url: "http://geocatmin.ingemmet.gob.pe/arcgis/services/SERV_GEOLOGIA/MapServer/WMSServer?",
  },
  {
    country: "Perú",
    name: "Fallas geológicas – INGEMMET",
    type: "WMS",
    url: "https://geocatmin.ingemmet.gob.pe/arcgis/services/SERV_GEOLOGIA_FALLAS/MapServer/WMSServer?",
  },
  {
    country: "Perú",
    name: "Depósitos y ocurrencias minerales – INGEMMET",
    type: "WMS",
    url: "https://geocatmin.ingemmet.gob.pe/arcgis/services/SERV_OCURRENCIA_MINERAL/MapServer/WMSServer?",
  },
  {
    country: "Perú",
    name: "Portal GEOCATMIN – INGEMMET",
    type: "Portal",
    url: "https://geocatmin.ingemmet.gob.pe/geocatmin/main",
  },

  // ---------------------------------------------------------
  // 🇨🇱 CHILE – SERNAGEOMIN
  // ---------------------------------------------------------
  {
    country: "Chile",
    name: "Geología base 1:1M – SERNAGEOMIN",
    type: "WMS",
    url: "https://sdngsig.sernageomin.cl/gissdng/services/Geoportal/GeologiaBase/MapServer/WMSServer?",
  },
  {
    country: "Chile",
    name: "Portal GeoMin – SERNAGEOMIN",
    type: "Portal",
    url: "https://portalgeomin.sernageomin.cl/",
  },

  // ---------------------------------------------------------
  // 🇦🇷 ARGENTINA – SEGEMAR
  // ---------------------------------------------------------
  {
    country: "Argentina",
    name: "SIGAM WMS – SEGEMAR",
    type: "WMS",
    url: "https://sigam.segemar.gov.ar/geoserver217/wms?request=GetCapabilities",
  },
  {
    country: "Argentina",
    name: "SIGAM WFS – SEGEMAR",
    type: "WFS",
    url: "https://sigam.segemar.gov.ar/geoserver217/wfs?request=GetCapabilities",
  },
  {
    country: "Argentina",
    name: "Portal SIGAM – SEGEMAR",
    type: "Portal",
    url: "https://sigam.segemar.gov.ar/wordpress/geoservicios/",
  },

  // ---------------------------------------------------------
  // 🇨🇴 COLOMBIA – SERVICIO GEOLÓGICO COLOMBIANO
  // ---------------------------------------------------------
  {
    country: "Colombia",
    name: "Atlas Geológico Nacional – SGC",
    type: "WMS",
    url: "https://srvags.sgc.gov.co/arcgis/services/Atlas_Geologico_Colombiano/Atlas_Geologico_Colombia/MapServer/WMSServer",
  },
  {
    country: "Colombia",
    name: "Mapa Geológico 2015 – SGC",
    type: "WFS",
    url: "https://srvags.sgc.gov.co/arcgis/services/Mapa_Geologico_Colombia_2015/Mapa_Geologico_Colombia_2015/MapServer/WFSServer?",
  },
  {
    country: "Colombia",
    name: "Portal SGC Geoservicios",
    type: "Portal",
    url: "https://www2.sgc.gov.co/sgc/mapas/Geoservicio/Paginas/geoservicios.aspx",
  },

  // ---------------------------------------------------------
  // 🇧🇷 BRASIL – CPRM / SGB
  // ---------------------------------------------------------
  {
    country: "Brasil",
    name: "GeoSGB WMS – CPRM/SGB",
    type: "WMS",
    url: "https://geosgb.sgb.gov.br/geoserver/geologia/ows?SERVICE=WMS&REQUEST=GetCapabilities",
  },
  {
    country: "Brasil",
    name: "GeoSGB WFS – CPRM/SGB",
    type: "WFS",
    url: "https://geosgb.sgb.gov.br/geoserver/geologia/ows?SERVICE=WFS&REQUEST=GetCapabilities",
  },
  {
    country: "Brasil",
    name: "Portal GeoSGB",
    type: "Portal",
    url: "https://geosgb.sgb.gov.br/",
  },

  // ---------------------------------------------------------
  // 🇺🇸 ESTADOS UNIDOS – USGS
  // ---------------------------------------------------------
  {
    country: "EE.UU.",
    name: "USGS National Map Services",
    type: "Portal",
    url: "https://apps.nationalmap.gov/services/",
  },

  // ---------------------------------------------------------
  // 🇨🇦 CANADÁ – GSC
  // ---------------------------------------------------------
  {
    country: "Canadá",
    name: "GeoScience Map WMS – GSC",
    type: "WMS",
    url: "https://maps.canada.ca/geology/wms?SERVICE=WMS&REQUEST=GetCapabilities",
  },
  {
    country: "Canadá",
    name: "Portal GeoScan – NRCan",
    type: "Portal",
    url: "https://geoscan.nrcan.gc.ca/",
  },

  // ---------------------------------------------------------
  // 🇫🇷 FRANCIA – BRGM
  // ---------------------------------------------------------
  {
    country: "Francia",
    name: "CGMW / BRGM WMS – Geología estructural",
    type: "WMS",
    url: "http://mapsref.brgm.fr/wxs/1GG/CGMW_Bedrock_and_Structural_Geology?SERVICE=WMS&REQUEST=GetCapabilities",
  },
  {
    country: "Francia",
    name: "Portal InfoTerre – BRGM",
    type: "Portal",
    url: "https://infoterre.brgm.fr/",
  },

  // ---------------------------------------------------------
  // 🇩🇪 ALEMANIA – BGR
  // ---------------------------------------------------------
  {
    country: "Alemania",
    name: "Geologische Karte Deutschland 1:1M – BGR",
    type: "WMS",
    url: "https://services.bgr.de/wms/bgr/geologie1000/?SERVICE=WMS&REQUEST=GetCapabilities",
  },
  {
    country: "Alemania",
    name: "Portal BGR",
    type: "Portal",
    url: "https://www.bgr.bund.de/DE/Home/homepage_node.html",
  },

  // ---------------------------------------------------------
  // 🇸🇪 SUECIA – SGU
  // ---------------------------------------------------------
  {
    country: "Suecia",
    name: "SGU Surface Geology WMS",
    type: "WMS",
    url: "https://resource.sgu.se/service/wms/sgu/surfacegeology?SERVICE=WMS&REQUEST=GetCapabilities",
  },
  {
    country: "Suecia",
    name: "Portal SGU",
    type: "Portal",
    url: "https://www.sgu.se/en/",
  },

  // ---------------------------------------------------------
  // 🇿🇦 SUDÁFRICA – COUNCIL FOR GEOSCIENCE
  // ---------------------------------------------------------
  {
    country: "Sudáfrica",
    name: "CGS National Geology WMS",
    type: "WMS",
    url: "https://portal.geoscience.org.za/arcgis/services/National_Geology/MapServer/WMSServer?",
  },
  {
    country: "Sudáfrica",
    name: "Portal CGS",
    type: "Portal",
    url: "https://portal.geoscience.org.za/",
  },

  // ---------------------------------------------------------
  // 🇨🇳 CHINA – CGS
  // ---------------------------------------------------------
  {
    country: "China",
    name: "CGS Geología Nacional WMS",
    type: "WMS",
    url: "http://geoservice.cgs.gov.cn/geoserver/geology/wms?SERVICE=WMS&REQUEST=GetCapabilities",
  },
  {
    country: "China",
    name: "Portal CGS",
    type: "Portal",
    url: "http://www.cgs.gov.cn/",
  },

  // ---------------------------------------------------------
  // 🇦🇺 AUSTRALIA – GEOSCIENCE AUSTRALIA
  // ---------------------------------------------------------
  {
    country: "Australia",
    name: "Superficial Geology WMS – Geoscience Australia",
    type: "WMS",
    url: "https://services.ga.gov.au/gis/rest/services/GA_Surface_Geology/MapServer",
  },
  {
    country: "Australia",
    name: "GeoServer GA – WFS",
    type: "WFS",
    url: "http://services.ga.gov.au/geoserver/ows?service=WFS&version=1.0.0&request=GetCapabilities",
  },
  {
    country: "Australia",
    name: "Portal GA",
    type: "Portal",
    url: "https://www.ga.gov.au/",
  },

  // ---------------------------------------------------------
  // 🌐 PORTALES GLOBALES – (AÑADIDOS NUEVOS)
  // ---------------------------------------------------------
  {
    country: "Global",
    name: "ArcGIS – Global Mines and Minerals (Esri)",
    type: "Portal",
    url: "https://www.arcgis.com/apps/mapviewer/index.html?webmap=83ba2b12bc944167a40289cbdb931f39",
  },
  {
    country: "Global",
    name: "IGF – Mapa de Minerales Críticos",
    type: "Portal",
    url: "https://www.igfmining.org/es/resource/igf-critical-minerals-map/",
  },
  {
    country: "Global",
    name: "OneGeology Global Portal",
    type: "Portal",
    url: "https://portal.onegeology.org/OnegeologyGlobal/",
  },
  {
    country: "Global",
    name: "MDNP – Mineral Development Network Platform",
    type: "Portal",
    url: "https://mineraldevelopmentnetworkplatform.org/",
  },
];
