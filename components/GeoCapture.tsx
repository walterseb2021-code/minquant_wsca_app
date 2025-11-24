"use client";
import React from "react";

export type GeoPoint = { lat: number; lng: number; accuracy?: number };
export type ReverseAddress = {
  raw?: any;
  formatted?: string;
  country?: string;
  admin1?: string;
  admin2?: string;
  admin3?: string;
};
export type GeoResult = {
  point: GeoPoint | null;
  address: ReverseAddress | null;
  mapsUrl?: string;
};

async function reverseGeocodeOSM(lat: number, lng: number, lang = "es"): Promise<ReverseAddress | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=${lang}`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    const j = await r.json();
    const addr = j?.address || {};
    const formatted: string | undefined = j?.display_name;
    return {
      raw: j,
      formatted,
      country: addr.country,
      admin1: addr.state || addr.region || addr.state_district,
      admin2: addr.province || addr.county,
      admin3:
        addr.city_district || addr.town || addr.village || addr.city || addr.suburb || addr.neighbourhood,
    };
  } catch {
    return null;
  }
}

async function reverseGeocodeGoogle(lat: number, lng: number, apiKey?: string): Promise<ReverseAddress | null> {
  if (!apiKey) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=es&key=${apiKey}`;
    const r = await fetch(url);
    const j = await r.json();
    const formatted = j?.results?.[0]?.formatted_address;
    const comps = j?.results?.[0]?.address_components || [];
    const get = (t: string[]) =>
      comps.find((c: any) => t.every((tt) => c.types.includes(tt)))?.long_name;
    return {
      raw: j,
      formatted,
      country: get(["country"]),
      admin1: get(["administrative_area_level_1"]),
      admin2: get(["administrative_area_level_2"]),
      admin3: get(["administrative_area_level_3"]) || get(["locality"]) || get(["sublocality"]),
    };
  } catch {
    return null;
  }
}

function osmEmbedUrl(lat: number, lng: number) {
  const dLat = 0.003, dLng = 0.005;
  const minLat = lat - dLat, maxLat = lat + dLat;
  const minLng = lng - dLng, maxLng = lng + dLng;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${minLng},${minLat},${maxLng},${maxLat}&layer=mapnik&marker=${lat},${lng}`;
}

type Props = {
  onChange: (geo: GeoResult) => void;
  googleKey?: string;
};

export default function GeoCapture({ onChange, googleKey }: Props) {
  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<GeoResult>({ point: null, address: null });

  const capture = React.useCallback(() => {
    if (!navigator.geolocation) {
      alert("Geolocalización no soportada por este dispositivo/navegador.");
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude);
        const lng = Number(pos.coords.longitude);
        const accuracy = Number(pos.coords.accuracy);
        const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}&z=18`;

        let address = await reverseGeocodeOSM(lat, lng, "es");
        if (!address) address = await reverseGeocodeGoogle(lat, lng, googleKey);

        const result: GeoResult = { point: { lat, lng, accuracy }, address, mapsUrl };
        setData(result);
        onChange(result);
        setLoading(false);
      },
      (err) => {
        alert(`No se pudo obtener ubicación: ${err.message}`);
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, [googleKey, onChange]);

  const embedSrc = data.point ? osmEmbedUrl(data.point.lat, data.point.lng) : null;

  return (
    <div className="flex items-start gap-3 w-full">
      <button
        type="button"
        onClick={capture}
        disabled={loading}
        className="mt-6 px-4 py-2 rounded-2xl shadow border text-sm disabled:opacity-60"
      >
        {loading ? "Obteniendo ubicación..." : "Obtener ubicación"}
      </button>

      <div className="text-sm flex-1">
        {data.point && (
          <>
            <div>
              <b>Lat/Lng:</b> {data.point.lat.toFixed(6)}, {data.point.lng.toFixed(6)}
              {data.point.accuracy != null && <> — <b>Precisión:</b> ±{Math.round(data.point.accuracy)} m</>}
            </div>
            {data.address?.formatted && (
              <div className="mt-1"><b>Dirección:</b> {data.address.formatted}</div>
            )}
            {embedSrc && (
              <div className="mt-2 rounded overflow-hidden border">
                <iframe title="Mapa" src={embedSrc} width="100%" height="220" style={{ border: 0 }} loading="lazy" />
              </div>
            )}
            {data.mapsUrl && (
              <div className="mt-2">
                <a href={data.mapsUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                  Abrir en Google Maps
                </a>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
