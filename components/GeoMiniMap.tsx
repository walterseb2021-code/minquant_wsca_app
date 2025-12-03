"use client";

import React, { useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";

type Props = {
  lat: number;
  lng: number;
};

type BaseLayerId = "street" | "satellite" | "terrain";

const baseLayers: Record<
  BaseLayerId,
  { name: string; url: string; attribution: string }
> = {
  street: {
    name: "Mapa",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; OpenStreetMap contributors',
  },
  satellite: {
    name: "Satélite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
  },
  terrain: {
    name: "Relieve",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: "Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap",
  },
};

// Icono simple para el punto de la muestra
const pointIcon = new L.Icon({
  iconUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [0, -35],
  shadowSize: [41, 41],
});

function RecenterOnChange({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  map.setView([lat, lng]);
  return null;
}

export default function GeoMiniMap({ lat, lng }: Props) {
  const [base, setBase] = useState<BaseLayerId>("street");

  const current = baseLayers[base];

  const earthUrl = `https://earth.google.com/web/@${lat},${lng},1000d`;

  return (
    <div className="border rounded-lg overflow-hidden bg-slate-900/80">
      {/* Barra superior: selector de mapa + botón 3D */}
      <div className="flex items-center justify-between px-2 py-1 bg-slate-800 text-[11px] text-slate-100">
        <div className="flex gap-1">
          {(
            [
              "street",
              "satellite",
              "terrain",
            ] as BaseLayerId[]
          ).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setBase(id)}
              className={`px-2 py-1 rounded border text-[11px] ${
                base === id
                  ? "bg-emerald-500 border-emerald-400 text-white"
                  : "bg-slate-900/40 border-slate-600 text-slate-200 hover:bg-slate-700"
              }`}
            >
              {baseLayers[id].name}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() =>
            window.open(earthUrl, "_blank", "noopener,noreferrer")
          }
          className="px-2 py-1 rounded border border-sky-400 text-sky-100 hover:bg-sky-600/40"
        >
          Vista 3D (Earth)
        </button>
      </div>

      {/* Mapa Leaflet */}
      <div className="w-full h-60">
        <MapContainer
          center={[lat, lng]}
          zoom={13}
          scrollWheelZoom={true}
          className="w-full h-full"
        >
          <TileLayer url={current.url} attribution={current.attribution} />

          <Marker position={[lat, lng]} icon={pointIcon}>
            <Popup>
              <div className="text-xs">
                <div className="font-semibold mb-1">
                  Ubicación de la muestra
                </div>
                <div>Lat: {lat.toFixed(5)}</div>
                <div>Lng: {lng.toFixed(5)}</div>
              </div>
            </Popup>
          </Marker>

          <RecenterOnChange lat={lat} lng={lng} />
        </MapContainer>
      </div>
    </div>
  );
}
