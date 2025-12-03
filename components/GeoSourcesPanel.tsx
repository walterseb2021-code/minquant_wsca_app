"use client";

import React from "react";

/** Tipos mínimos que usamos del catálogo público (public/geo-sources.json) */
type Layer = {
  id?: string;
  title: string;
  service: "WMS" | "WFS" | "XYZ" | "Other";
  url: string;
  notes?: string;
};

type CountryCatalog = {
  code: string; // "PE"
  name: string; // "Perú"
  layers: Layer[];
  notes?: string[];
};

type CatalogJSON = {
  updatedAt?: string;
  countries: CountryCatalog[];
};

function copy(text: string) {
  try {
    navigator.clipboard?.writeText(text);
    alert("Copiado al portapapeles.");
  } catch {
    // Fallback simple
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    alert("Copiado al portapapeles.");
  }
}

export default function GeoSourcesPanel() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [catalog, setCatalog] = React.useState<CatalogJSON | null>(null);
  const [countryCode, setCountryCode] = React.useState<string>("");

  // Cargar catálogo desde /public/geo-sources.json
  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);

        const resp = await fetch("/geo-sources.json", { cache: "no-store" });
        if (!resp.ok) {
          throw new Error("No se pudo leer public/geo-sources.json");
        }

        const json = (await resp.json()) as CatalogJSON;

        // Normalizar estructura defensiva
        if (!Array.isArray(json.countries)) {
          throw new Error("Formato inválido en geo-sources.json");
        }

        setCatalog(json);

        // Seleccionar Perú por defecto si existe; si no, el primero
        const hasPE = json.countries.find((c) => c.code === "PE");
        setCountryCode(hasPE ? "PE" : json.countries[0]?.code ?? "");
      } catch (e: any) {
        setError(e?.message || "Error cargando catálogo geoespacial");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const country = React.useMemo(
    () => catalog?.countries.find((c) => c.code === countryCode) || null,
    [catalog, countryCode]
  );

  return (
    <div className="border rounded-lg p-3 bg-white mt-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Fuentes geoespaciales</h3>
        {catalog?.updatedAt && (
          <span className="text-xs text-gray-500">
            Catálogo: {catalog.updatedAt}
          </span>
        )}
      </div>

      {/* Estados de carga / errores */}
      {loading && (
        <p className="text-sm text-gray-600 mt-2">Cargando catálogo…</p>
      )}

      {error && (
        <p className="text-sm text-red-600 mt-2">
          {error}. Verifica que <code>public/geo-sources.json</code> exista en
          producción.
        </p>
      )}

      {/* Contenido principal */}
      {!loading && !error && catalog && (
        <>
          {/* Selector de país */}
          <div className="mt-3">
            <label className="text-sm text-gray-700">País</label>
            <select
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              className="mt-1 border rounded px-3 py-2"
            >
              {catalog.countries.map((c, idx) => (
                // key robusto: code + índice
                <option key={`${c.code}-${idx}`} value={c.code}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>

          {/* Notas del país */}
          {country?.notes && country.notes.length > 0 && (
            <div className="mt-3 text-xs text-gray-600">
              {country.notes.map((n, i) => (
                <div key={`note-${i}`}>• {n}</div>
              ))}
            </div>
          )}

          {/* Lista de capas */}
          <div className="mt-4">
            <h4 className="font-medium mb-2">Capas disponibles</h4>
            {country && Array.isArray(country.layers) && country.layers.length > 0 ? (
              <ul className="space-y-2">
                {country.layers.map((ly, idx) => {
                  // generar key segura: id si existe, sino url + idx
                  const key = ly.id ? `${ly.id}` : `${ly.url}-${idx}`;
                  return (
                    <li key={key} className="border rounded p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div style={{ minWidth: 0 }}>
                          <div className="font-medium text-sm">
                            {ly.title}
                          </div>
                          <div className="text-[11px] text-gray-500 break-words">
                            {ly.service} •{" "}
                            <code className="break-all">{ly.url}</code>
                          </div>
                          {ly.notes && (
                            <div className="text-[11px] text-gray-600 mt-1">
                              {ly.notes}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => copy(ly.url)}
                            className="px-2 py-1 bg-blue-600 text-white rounded text-xs"
                          >
                            Copiar URL
                          </button>
                          <a
                            href={ly.url}
                            target="_blank"
                            rel="noreferrer"
                            className="px-2 py-1 bg-gray-200 rounded text-xs"
                          >
                            Abrir
                          </a>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">
                No hay capas registradas para este país.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
