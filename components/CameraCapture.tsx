"use client";

import React from "react";

export type CapturedPhoto = { file: File; url: string; takenAt: string };

type Props = {
  onPhotos: (photos: CapturedPhoto[]) => void;
  /** Máximo de fotos permitidas (por defecto 6) */
  max?: number;
};

const DEFAULT_MAX = 6;

export default function CameraCapture({ onPhotos, max = DEFAULT_MAX }: Props) {
  const [photos, setPhotos] = React.useState<CapturedPhoto[]>([]);
  const camRef = React.useRef<HTMLInputElement | null>(null);
  const galRef = React.useRef<HTMLInputElement | null>(null);

  // Notificar al padre ante cualquier cambio
  React.useEffect(() => {
    onPhotos(photos);
  }, [photos, onPhotos]);

  // Utilidad: crea el objeto CapturedPhoto
  function makePhoto(file: File): CapturedPhoto {
    const url = URL.createObjectURL(file);
    return { file, url, takenAt: new Date().toISOString() };
  }

  // Agrega 1 (cámara)
  function pushOne(file?: File | null) {
    if (!file) return;
    setPhotos((prev) => {
      if (prev.length >= max) {
        alert(`Solo se permiten ${max} fotos. El resto será ignorado.`);
        return prev;
      }
      return [...prev, makePhoto(file)];
    });
  }

  // Agrega varias (galería)
  function pushMany(list: FileList | null) {
    if (!list || !list.length) return;
    setPhotos((prev) => {
      const cupo = Math.max(0, max - prev.length);
      if (cupo <= 0) {
        alert(`Ya tienes ${max} fotos. No se añadirán más.`);
        return prev;
      }
      const slice = Array.from(list).slice(0, cupo);
      const added = slice.map(makePhoto);
      if (list.length > slice.length) {
        alert(
          `Límite ${max}: se añadieron ${slice.length} y se ignoraron ${
            list.length - slice.length
          }.`
        );
      }
      return [...prev, ...added];
    });
  }

  // Limpia value para que el mismo archivo vuelva a disparar onChange
  function resetInput(el?: HTMLInputElement | null) {
    if (el) el.value = "";
  }

  // Cámara (1 por vez)
  const onCamChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    pushOne(e.target.files?.[0]);
    resetInput(camRef.current);
  };

  // Galería (múltiple)
  const onGalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    pushMany(e.target.files);
    resetInput(galRef.current);
  };

  // Eliminar una
  function removeAt(idx: number) {
    setPhotos((prev) => {
      const p = prev[idx];
      try {
        URL.revokeObjectURL(p.url);
      } catch {}
      return prev.filter((_, i) => i !== idx);
    });
  }

  // Vaciar todas
  function clearAll() {
    if (!photos.length) return;
    if (!confirm("¿Quitar todas las fotos?")) return;
    photos.forEach((p) => {
      try {
        URL.revokeObjectURL(p.url);
      } catch {}
    });
    setPhotos([]);
  }

  return (
    <div>
      {/* Botonera */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => camRef.current?.click()}
          className="px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700"
          title="Abrir cámara (móvil) o selector de cámara"
        >
          Tomar foto
        </button>

        <button
          type="button"
          onClick={() => galRef.current?.click()}
          className="px-4 py-2 rounded bg-slate-600 text-white hover:bg-slate-700"
          title="Seleccionar desde galería/archivos"
        >
          Subir de galería
        </button>

        <button
          type="button"
          onClick={clearAll}
          className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300"
          disabled={!photos.length}
        >
          Vaciar ({photos.length}/{max})
        </button>
      </div>

      {/* Inputs ocultos */}
      {/* Cámara: 1 por vez, con cámara trasera si existe */}
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onCamChange}
        className="hidden"
      />
      {/* Galería: múltiples */}
      <input
        ref={galRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onGalChange}
        className="hidden"
      />

      {/* Miniaturas rápidas (opcional, tu page.tsx ya muestra, pero ayuda aquí también) */}
      {photos.length > 0 && (
        <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-3">
          {photos.map((p, i) => (
            <div key={`${p.takenAt}-${i}`} className="border rounded overflow-hidden relative">
              <img src={p.url} alt={`foto_${i + 1}`} className="w-full h-28 object-cover" />
              <div className="px-2 py-1 text-[11px] truncate">
                {p.file.name || `foto_${i + 1}.jpg`}
              </div>
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="absolute top-1 right-1 text-xs bg-black/60 text-white rounded px-1 py-0.5"
                title="Quitar"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-[12px] text-gray-600 mt-2">
        Límite: {max} fotos. En móvil, la cámara añade <b>una por vez</b>. Usa “Subir de galería”
        para elegir varias a la vez.
      </p>
    </div>
  );
}
