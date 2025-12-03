"use client";

import React, { useState } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
} from "react-leaflet";

type LeafletMapProps = {
  lat: number;
  lng: number;
};

export default function LeafletMap({ lat, lng }: LeafletMapProps) {
  // Base: "streets" (tipo Google Maps) o "satellite" (tipo Google Earth)
  const [base, setBase] = useState<"streets" | "satellite">("streets");

  const center: [number, number] = [lat, lng];

  // IMPORTANTE: evitar problemas en SSR
  if (typeof window === "undefined") {
    return (
      <div className="w-full h-56 bg-slate-200 flex items-center justify-center text-xs text-slate-600">
        Cargando mapa…
      </div>
    );
  }

  const streetsUrl =
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

  const satelliteUrl =
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{x}/{y}";

  return (
    <div className="relative w-full h-56">
      {/* Selector de base de mapa */}
      <div className="absolute z-[1000] top-2 right-2 flex gap-1 bg-white/90 rounded shadow px-2 py-1">
        <button
          type="button"
          onClick={() => setBase("streets")}
          className={`text-[10px] px-2 py-1 rounded ${
            base === "streets"
              ? "bg-emerald-600 text-white"
              : "bg-slate-100 text-slate-800"
          }`}
        >
          Mapa
        </button>
        <button
          type="button"
          onClick={() => setBase("satellite")}
          className={`text-[10px] px-2 py-1 rounded ${
            base === "satellite"
              ? "bg-emerald-600 text-white"
              : "bg-slate-100 text-slate-800"
          }`}
        >
          Satélite
        </button>
      </div>

      <MapContainer
        center={center}
        zoom={13}
        scrollWheelZoom={true}
        className="w-full h-full rounded"
      >
        {base === "streets" ? (
          <TileLayer
            attribution='&copy; OpenStreetMap'
            url={streetsUrl}
          />
        ) : (
          <TileLayer
            attribution="&copy; Esri World Imagery"
            url={satelliteUrl}
          />
        )}

        {/* Marcador simple en la posición */}
        <CircleMarker center={center} radius={8}>
          <Popup>
            Lat: {lat.toFixed(5)} <br />
            Lng: {lng.toFixed(5)}
          </Popup>
        </CircleMarker>
      </MapContainer>
    </div>
  );
}
