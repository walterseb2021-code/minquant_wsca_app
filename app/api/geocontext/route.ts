// app/api/geocontext/route.ts
import { NextRequest, NextResponse } from "next/server";

/**
 * Devuelve contexto geográfico/geológico básico a partir de lat/lng:
 * - País (código y nombre)
 * - Fuente principal de información geológica (ej. INGEMMET/GEOCATMIN para Perú)
 * - Portal oficial de consulta
 * - Estructura preparada para integrar WMS/WFS (geología, yacimientos, etc.)
 *
 * Más adelante:
 * - Se conectará con servicios WMS/WFS reales para poblar geology/nearbyDeposits.
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
      }
    } catch (e) {
      console.warn("Error consultando /api/nearby:", e);
    }
  }

  // ==============================
  // 4) Respuesta final estructurada
  // ==============================
  return NextResponse.json({
    status: "ok",
    point: { lat, lng },
    countryCode,
    countryName,
    source: sourceInfo.source,
    portal: sourceInfo.portal,

    geology: null as
      | {
          unitName?: string;
          age?: string;
          lithology?: string;
          raw?: any;
        }
      | null,

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
