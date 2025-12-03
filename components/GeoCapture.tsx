"use client";

import React, { useState } from "react";
import GeoMiniMap from "./GeoMiniMap";

export type GeoPoint = { lat: number; lng: number };

export type GeoResult = {
  point: GeoPoint | null;
  countryCode?: string;
  countryName?: string;
  source?: string;
  portal?: string;
  raw?: any;
};

type Props = {
  onChange?: (r: GeoResult) => void;
};

function parseCoord(value: string): number | null {
  if (!value) return null;
  const v = value.replace(",", ".");
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default function GeoCapture({ onChange }: Props) {
  const [geo, setGeo] = useState<GeoResult>({ point: null });
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Aplica un punto (sea GPS o manual) y trae contexto desde /api/geocontext
  async function applyPoint(point: GeoPoint) {
    setError(null);
    setLoading(true);

    try {
      const url = `/api/geocontext?lat=${point.lat}&lng=${point.lng}`;
      const res = await fetch(url, { cache: "no-store" });

      let ctx: any = null;
      if (res.ok) {
        ctx = await res.json();
      }

      const result: GeoResult = {
        point,
        countryCode: ctx?.countryCode ?? ctx?.countryCode?.toUpperCase?.(),
        countryName: ctx?.countryName,
        source: ctx?.source,
        portal: ctx?.portal,
        raw: ctx,
      };

      setGeo(result);
      onChange?.(result);
    } catch (e) {
      console.warn("Error en /api/geocontext:", e);
      const result: GeoResult = { point };
      setGeo(result);
      onChange?.(result);
      setError(
        "No se pudo obtener el contexto geológico. Puedes seguir usando estas coordenadas."
      );
    } finally {
      setLoading(false);
    }
  }

  // Obtener ubicación por GPS
  async function handleGetLocation() {
    if (!("geolocation" in navigator)) {
      setError("Este navegador no soporta geolocalización.");
      return;
    }

    setError(null);
    setLoading(true);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        setManualLat(lat.toFixed(6));
        setManualLng(lng.toFixed(6));

        await applyPoint({ lat, lng });
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setError("No se pudo obtener la ubicación.");
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  // Fijar coordenadas en el mapa (sin abrir nueva ventana)
  async function handleSetMapPoint() {
    setError(null);

    let lat: number | null = parseCoord(manualLat);
    let lng: number | null = parseCoord(manualLng);

    if ((lat == null || lng == null) && geo.point) {
      lat = geo.point.lat;
      lng = geo.point.lng;
    }

    if (lat == null || lng == null) {
      setError(
        "Escribe una latitud y longitud válidas (decimales) o usa 'Obtener ubicación'."
      );
      return;
    }

    await applyPoint({ lat, lng });
  }

  const latText =
    geo.point?.lat != null ? geo.point.lat.toFixed(6) : "—";
  const lngText =
    geo.point?.lng != null ? geo.point.lng.toFixed(6) : "—";

  return (
    <div className="mt-4 border rounded-lg p-3 bg-white">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">Ubicación de la muestra</div>
          <div className="text-xs text-gray-600">
            Lat: {latText} · Lng: {lngText}
          </div>
          {geo.countryName && (
            <div className="text-xs text-gray-500">
              País: {geo.countryName} ({geo.countryCode})
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleGetLocation}
          disabled={loading}
          className="px-3 py-2 bg-emerald-600 text-white rounded text-xs disabled:opacity-50"
        >
          {loading ? "Obteniendo…" : "Obtener ubicación"}
        </button>
      </div>

      {/* Coordenadas manuales */}
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-700">Latitud (decimal)</label>
          <input
            type="text"
            value={manualLat}
            onChange={(e) => setManualLat(e.target.value)}
            className="mt-1 border rounded px-2 py-1 w-full text-sm"
            placeholder="-9.118261"
          />
        </div>
        <div>
          <label className="text-xs text-gray-700">Longitud (decimal)</label>
          <input
            type="text"
            value={manualLng}
            onChange={(e) => setManualLng(e.target.value)}
            className="mt-1 border rounded px-2 py-1 w-full text-sm"
            placeholder="-78.496015"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleSetMapPoint}
          disabled={loading}
          className="px-3 py-2 bg-sky-600 text-white rounded text-xs disabled:opacity-50"
        >
          Ver mapa con coordenadas
        </button>

        {error && (
          <span className="text-xs text-red-600 mt-1">{error}</span>
        )}
      </div>

      {/* Mapa interactivo (Leaflet vía GeoMiniMap) */}
      <div className="mt-3 border rounded overflow-hidden">
        {geo.point ? (
          <GeoMiniMap lat={geo.point.lat} lng={geo.point.lng} />
        ) : (
          <div className="w-full h-56 flex items-center justify-center text-xs text-gray-500 bg-slate-100">
            Ingresa coordenadas o usa “Obtener ubicación” para ver el mapa.
          </div>
        )}
      </div>

      {geo.source && (
        <div className="mt-2 text-[11px] text-gray-500">
          Fuente geológica principal: {geo.source}{" "}
          {geo.portal && (
            <>
              ·{" "}
              <a
                href={geo.portal}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                portal oficial
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}
