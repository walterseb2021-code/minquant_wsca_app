// app/api/geocontext/route.ts
import { NextRequest, NextResponse } from "next/server";

/**
 * Devuelve contexto geográfico/geológico básico a partir de lat/lng:
 * - País (código y nombre)
 * - Fuente principal de información geológica (ej. INGEMMET/GEOCATMIN para Perú)
 * - Portal oficial de consulta
 * - Geología local (unidad, litología, edad, código) vía ArcGIS REST /identify
 * - Yacimientos cercanos vía /api/nearby (si countryCode = PE)
 */

type SourceInfo = {
  source: string; // nombre de la entidad / sistema (no es un “proveedor” comercial)
  portal: string; // URL del visor o portal oficial
};

const SOURCES_BY_COUNTRY: Record<string, SourceInfo> = {
  PE: {
    source: "INGEMMET / GEOCATMIN",
    portal: "https://geocatmin.ingemmet.gob.pe/geocatmin/main",
  },
  // Aquí podrás añadir otros países más adelante
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const latStr = searchParams.get("lat");
  const lngStr = searchParams.get("lng");

  if (!latStr || !lngStr) {
    return NextResponse.json(
      {
        status: "error",
        error:
          "Parámetros lat y lng son requeridos. Ej: /api/geocontext?lat=-9.11&lng=-78.49",
      },
      { status: 400 }
    );
  }

  const lat = Number(latStr);
  const lng = Number(lngStr);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      {
        status: "error",
        error: "Parámetros lat y lng deben ser numéricos válidos.",
      },
      { status: 400 }
    );
  }

  // ==============================
  // 1) Reverse geocoding básico (OSM / Nominatim)
  // ==============================
  let countryCode = "UNK";
  let countryName = "Desconocido";

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=3&accept-language=es`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "MinQuant_WSCA/1.0 (geocontext)",
      },
    });

    if (res.ok) {
      const j = await res.json();
      const addr = j?.address || {};
      if (addr.country_code) {
        countryCode = String(addr.country_code).toUpperCase();
      }
      if (addr.country) {
        countryName = String(addr.country);
      }
    }
  } catch {
    // Si falla, seguimos con país desconocido
  }

  // ==============================
  // 2) Selección de fuente geológica por país
  // ==============================
  const sourceInfo: SourceInfo =
    SOURCES_BY_COUNTRY[countryCode] ?? {
      source: "Fuentes globales / OpenStreetMap",
      portal: "https://www.openstreetmap.org",
    };

  // ==============================
  // 3) Consultar yacimientos cercanos (solo si es Perú)
  // ==============================
  let nearbyDeposits: {
    name: string;
    commodity?: string;
    distance_km?: number;
    source?: string;
  }[] = [];

  if (countryCode === "PE") {
    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

      const nearbyUrl = `${baseUrl}/api/nearby?lat=${lat}&lon=${lng}&radius_km=15`;
      const nearbyRes = await fetch(nearbyUrl, { cache: "no-store" });

      if (nearbyRes.ok) {
        const contentType = nearbyRes.headers.get("content-type") || "";

        // Solo intentamos parsear JSON si realmente es JSON
        if (contentType.includes("application/json")) {
          try {
            const nearbyJson = await nearbyRes.json();

            if (Array.isArray(nearbyJson?.items)) {
              nearbyDeposits = nearbyJson.items.map((item: any) => ({
                name: item.name,
                commodity: item.commodity,
                source: item.source,
                distance_km: item.distance_m
                  ? Math.round(item.distance_m / 1000)
                  : undefined,
              }));
            }
          } catch (err) {
            console.warn("Error parseando JSON de /api/nearby:", err);
          }
        } else {
          // Esto pasa cuando el middleware redirige a /login y devuelve HTML
          console.warn(
            "Respuesta no JSON desde /api/nearby (probable login o HTML). Se omiten yacimientos."
          );
        }
      }
    } catch (e) {
      console.warn("Error consultando /api/nearby:", e);
    }
  }

  // ==============================
  // 3.1) Obtener UNIDAD GEOLÓGICA REAL (ArcGIS REST /identify)
  // ==============================
  let geologyContext: null | {
    unit?: string;
    lithology?: string;
    age?: string;
    code?: string;
    source: string;
  } = null;

  if (countryCode === "PE") {
    try {
      // Endpoint oficial ArcGIS REST
      const identifyUrl = new URL(
        "https://geocatmin.ingemmet.gob.pe/arcgis/rest/services/SERV_GEOLOGIA/MapServer/identify"
      );

      // Parámetros básicos para Identify
      identifyUrl.searchParams.set("f", "json");
      // geometry = x,y = lon,lat en SR 4326
      identifyUrl.searchParams.set("geometry", `${lng},${lat}`);
      identifyUrl.searchParams.set("geometryType", "esriGeometryPoint");
      identifyUrl.searchParams.set("sr", "4326");

      // Probar con TODAS las capas visibles
      identifyUrl.searchParams.set("layers", "all");

      // Más tolerancia en píxeles para “atrapar” el polígono cercano
      identifyUrl.searchParams.set("tolerance", "12");

      // Extensión de mapa “amplia” alrededor del punto
      const dx = 0.5;
      const dy = 0.5;
      identifyUrl.searchParams.set(
        "mapExtent",
        `${lng - dx},${lat - dy},${lng + dx},${lat + dy}`
      );

      // Resolución de la "imagen" usada para el cálculo de tolerancia
      identifyUrl.searchParams.set("imageDisplay", "1024,768,96");

      const identifyRes = await fetch(identifyUrl.toString(), {
        cache: "no-store",
      });

      if (identifyRes.ok) {
        const data = await identifyRes.json();

        // Log para depuración
        console.log("GEOCONTEXT IDENTIFY RAW:", JSON.stringify(data));

        // Si el servicio devuelve error (como "Service ... not started"), lo registramos y salimos
        const anyData = data as any;
        if (anyData?.error) {
          console.warn("Identify geológico devolvió error:", anyData.error);
        } else {
          const first =
            anyData?.results?.[0] ||
            (Array.isArray(anyData?.results) && anyData.results[0]) ||
            null;

          const attrs = first?.attributes || {};

          geologyContext = {
            // Intentamos mapear a campos típicos; si no existen, caerán en null
            unit:
              attrs.NOMUNIDAD ||
              attrs.UNIDAD ||
              attrs.UNID_LITO ||
              attrs.NOMBRE ||
              null,
            lithology:
              attrs.LITOLOGIA ||
              attrs.LITO ||
              attrs.DESCRIPCION ||
              attrs.DESC_LITO ||
              null,
            age: attrs.EDAD || attrs.ERA || attrs.PERIODO || null,
            code: attrs.COD_UNID || attrs.CODIGO || attrs.CODIGO_UNID || null,
            source: "INGEMMET – Geología 1:100 000 (ArcGIS REST identify)",
          };

          // Si no se obtuvo nada relevante, lo dejamos en null
          if (
            !geologyContext.unit &&
            !geologyContext.lithology &&
            !geologyContext.age &&
            !geologyContext.code
          ) {
            geologyContext = null;
          }
        }
      } else {
        console.warn(
          "Identify geológico no OK:",
          identifyRes.status,
          identifyRes.statusText
        );
      }
    } catch (e) {
      console.warn("Error consultando ArcGIS REST /identify:", e);
    }
  }

  // ==============================
  // 4) Respuesta final estructurada (CON GEOLOGÍA REAL)
  // ==============================
  return NextResponse.json({
    status: "ok",
    point: { lat, lng },
    countryCode,
    countryName,
    source: sourceInfo.source,
    portal: sourceInfo.portal,

    geologyContext, // ← puede venir con datos reales o null (si servicio caído)

    nearbyDeposits,

    faultsSummary: null as
      | {
          hasFaultsNearby: boolean;
          minDistance_km?: number;
          raw?: any;
        }
      | null,

    concessionsSummary: null as
      | {
          hasConcessionsNearby: boolean;
          minDistance_km?: number;
          raw?: any;
        }
      | null,
  });
}
