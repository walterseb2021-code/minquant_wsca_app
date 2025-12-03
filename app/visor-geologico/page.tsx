"use client";

import React, { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

const DEFAULT_LAT = -9.1183;
const DEFAULT_LNG = -78.4960;

type ViewerMode = "geocatmin" | "osm" | "earth";

function parseNumber(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function buildViewerUrl(
  lat: number,
  lng: number,
  country: string,
  mode: ViewerMode
): string {
  const safeLat = Number.isFinite(lat) ? lat : DEFAULT_LAT;
  const safeLng = Number.isFinite(lng) ? lng : DEFAULT_LNG;
  const centerStr = `${safeLng.toFixed(5)},${safeLat.toFixed(5)}`;

  if (mode === "geocatmin") {
    if (country === "PE") {
      const base = "https://geocatmin.ingemmet.gob.pe/geocatmin/main";
      return `${base}?center=${centerStr}&level=11`;
    }
    // si no es Perú, caemos a OSM
    return `https://www.openstreetmap.org/?mlat=${safeLat.toFixed(
      5
    )}&mlon=${safeLng.toFixed(5)}#map=11/${safeLat.toFixed(
      5
    )}/${safeLng.toFixed(5)}`;
  }

  if (mode === "osm") {
    return `https://www.openstreetmap.org/?mlat=${safeLat.toFixed(
      5
    )}&mlon=${safeLng.toFixed(5)}#map=13/${safeLat.toFixed(
      5
    )}/${safeLng.toFixed(5)}`;
  }

  // mode === "earth"
  // Vista satélite / 3D aproximada
  const latStr = safeLat.toFixed(6);
  const lngStr = safeLng.toFixed(6);
  return `https://earth.google.com/web/@${latStr},${lngStr},5000a,0d,0h,0t,0r`;
}

export default function GeoVisorPage() {
  const params = useSearchParams();

  const lat = parseNumber(params.get("lat"), DEFAULT_LAT);
  const lng = parseNumber(params.get("lng"), DEFAULT_LNG);
  const country = (params.get("country") || "PE").toUpperCase();

  const [mode, setMode] = useState<ViewerMode>("geocatmin");

  const iframeSrc = useMemo(
    () => buildViewerUrl(lat, lng, country, mode),
    [lat, lng, country, mode]
  );

  const handleOpenNewTab = () => {
    if (typeof window !== "undefined") {
      window.open(iframeSrc, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="w-screen h-screen flex flex-col bg-slate-900">
      <header className="p-2 sm:p-3 bg-gradient-to-r from-emerald-700 to-cyan-700 text-white text-xs sm:text-sm shadow-md">
        <div className="max-w-6xl mx-auto flex flex-col gap-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-semibold">
                MinQuant_WSCA – Visor geológico (BETA mejorado)
              </div>
              <div className="text-[10px] sm:text-xs opacity-90">
                Coordenadas: {lat.toFixed(5)}, {lng.toFixed(5)} · País: {country}
              </div>
            </div>

            {/* Controles de modo */}
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[11px] sm:text-xs">
                Modo de visor:
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as ViewerMode)}
                  className="ml-1 px-2 py-1 rounded bg-emerald-900/60 border border-emerald-300 text-[11px] sm:text-xs"
                >
                  <option value="geocatmin">
                    INGEMMET / GEOCATMIN (geológico)
                  </option>
                  <option value="osm">Mapa base (OpenStreetMap)</option>
                  <option value="earth">Vista satélite 3D (Google Earth)</option>
                </select>
              </label>

              <button
                onClick={handleOpenNewTab}
                className="px-2 py-1 bg-emerald-500 hover:bg-emerald-400 rounded text-[11px] sm:text-xs font-semibold"
              >
                Abrir visor en pestaña nueva
              </button>
            </div>
          </div>

          <div className="text-[10px] sm:text-[11px] text-emerald-100">
            Las capas y datos cartográficos que se visualizan a continuación
            pertenecen al geoportal oficial (INGEMMET / GEOCATMIN, OSM, Google
            Earth u otros). MinQuant_WSCA solo embebe/redirige estos visores
            para fines de consulta preliminar, respetando sus términos de uso.
          </div>
        </div>
      </header>

      <div className="flex-1">
        <iframe
          key={mode} // fuerza recarga al cambiar modo
          src={iframeSrc}
          className="w-full h-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          title="Visor geológico MinQuant_WSCA"
        />
      </div>
    </div>
  );
}
