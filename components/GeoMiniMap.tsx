"use client";

import React, { useEffect, useRef, useState } from "react";

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
    attribution: "© OpenStreetMap contributors",
  },
  satellite: {
    name: "Satélite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles © Esri",
  },
  terrain: {
    name: "Relieve",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution:
      "Datos del mapa © OpenStreetMap contributors, SRTM | Estilo © OpenTopoMap",
  },
};

export default function GeoMiniMap({ lat, lng }: Props) {
  const [base, setBase] = useState<BaseLayerId>("street");
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null); // guarda instancia de Leaflet

  const current = baseLayers[base];
  const earthUrl = `https://earth.google.com/web/@${lat},${lng},1000d`;

  useEffect(() => {
    // ⛔ Proteger SSR
    if (typeof window === "undefined") return;
    if (!mapDivRef.current) return;

    let map = mapInstanceRef.current;

    (async () => {
      const L = await import("leaflet");

      // si no hay mapa todavía, crearlo
      if (!map) {
        map = L.map(mapDivRef.current!).setView([lat, lng], 13);
        mapInstanceRef.current = map;
      } else {
        map.setView([lat, lng], map.getZoom() ?? 13);
      }

      // limpiar capas base anteriores
      map.eachLayer((layer: any) => {
        map.removeLayer(layer);
      });

      // capa base según selección
      L.tileLayer(current.url, {
        maxZoom: 19,
        attribution: current.attribution,
      }).addTo(map);

      // marcador de la muestra
      const icon = new L.Icon({
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

      const marker = L.marker([lat, lng], { icon }).addTo(map);
      marker.bindPopup(
        `<div style="font-size:11px;">
          <div style="font-weight:bold;margin-bottom:2px;">Ubicación de la muestra</div>
          <div>Lat: ${lat.toFixed(5)}</div>
          <div>Lng: ${lng.toFixed(5)}</div>
        </div>`
      );
    })();

    // limpieza al desmontar
    return () => {
      // NO destruimos el mapa cada vez que cambia base/lat/lng,
      // solo cuando el componente se desmonta.
      // Si quisieras destruirlo aquí, deberías llamar map.remove().
    };
  }, [lat, lng, base, current.url, current.attribution]);

  return (
    <div className="border rounded-lg overflow-hidden bg-slate-900/80">
      {/* Barra superior: selector de mapa + botón 3D */}
      <div className="flex items-center justify-between px-2 py-1 bg-slate-800 text-[11px] text-slate-100">
        <div className="flex gap-1">
          {(["street", "satellite", "terrain"] as BaseLayerId[]).map((id) => (
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

      {/* Contenedor del mapa Leaflet */}
      <div className="w-full h-60">
        <div
          ref={mapDivRef}
          className="w-full h-full"
        />
      </div>
    </div>
  );
}
