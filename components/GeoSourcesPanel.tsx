"use client";
import React, { useEffect, useState } from "react";
import { getAvailableSources, type GeoSource } from "../geo/registry";

export default function GeoSourcesPanel() {
  const [country, setCountry] = useState<string>("auto");
  const [sources, setSources] = useState<GeoSource[]>([]);
  const [loading, setLoading] = useState(false);

  // Detección inicial de país según IP
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("https://ipapi.co/json/");
        const j = await res.json();
        const cc = j?.country_name || "Desconocido";
        setCountry(cc);
        const src = await getAvailableSources(cc);
        setSources(src);
      } catch {
        setCountry("Desconocido");
      }
    })();
  }, []);

  async function handleCountryChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const c = e.target.value;
    setCountry(c);
    setLoading(true);
    const src = await getAvailableSources(c);
    setSources(src);
    setLoading(false);
  }

  return (
    <div className="border rounded-lg p-3 bg-gray-50 mt-4">
      <div className="font-semibold mb-2">🌎 Fuentes geoespaciales disponibles</div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <label className="text-sm text-gray-600">País:</label>
        <select
          value={country}
          onChange={handleCountryChange}
          className="border rounded px-2 py-1 text-sm"
        >
          <option value="auto">Auto (IP)</option>
          <option>Perú</option>
          <option>Chile</option>
          <option>Argentina</option>
          <option>Colombia</option>
          <option>Brasil</option>
          <option>EE.UU.</option>
          <option>Canadá</option>
          <option>Francia</option>
          <option>Alemania</option>
          <option>Suecia</option>
          <option>Sudáfrica</option>
          <option>China</option>
          <option>Australia</option>
        </select>
        {loading && <span className="text-xs text-gray-500">Cargando…</span>}
      </div>

      {sources.length > 0 ? (
        <ul className="text-sm space-y-1">
          {sources.map((s, i) => (
            <li key={i} className="border rounded p-2 bg-white">
              <b>{s.name}</b> — {s.type}
              <br />
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 underline text-xs"
              >
                {s.url}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500">
          No hay fuentes registradas para este país o aún no se cargaron.
        </p>
      )}
    </div>
  );
}
