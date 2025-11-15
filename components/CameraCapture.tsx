// components/CameraCapture.tsx
"use client";

import React from "react";

export type CapturedPhoto = { file: File; url: string; takenAt: string };

type Props = {
  onPhotos: (photos: CapturedPhoto[]) => void;
  /** Máximo de fotos permitidas */
  max?: number;
  /** Señal externa para limpiar fotos */
  resetSignal?: number;
};

const DEFAULT_MAX = 6;

export default function CameraCapture({ onPhotos, max = DEFAULT_MAX, resetSignal }: Props) {
  const [photos, setPhotos] = React.useState<CapturedPhoto[]>([]);
  const camRef = React.useRef<HTMLInputElement | null>(null);
  const galRef = React.useRef<HTMLInputElement | null>(null);

  // Notificar al padre cada vez que cambia la lista
  React.useEffect(() => {
    onPhotos(photos);
  }, [photos, onPhotos]);

  // 💥 NUEVO: limpiar al recibir una señal externa
  React.useEffect(() => {
    setPhotos([]);
    if (camRef.current) camRef.current.value = "";
    if (galRef.current) galRef.current.value = "";
  }, [resetSignal]);

  const makePhoto = (file: File): CapturedPhoto => ({
    file,
    url: URL.createObjectURL(file),
    takenAt: new Date().toISOString(),
  });

  const pushOne = (file?: File | null) => {
    if (!file) return;
    setPhotos((prev) => {
      if (prev.length >= max) {
        alert(`Solo se permiten ${max} fotos. El resto será ignorado.`);
        return prev;
      }
      return [...prev, makePhoto(file)];
    });
  };

  const pushMany = (list: FileList | null) => {
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
  };

  const resetValue = (el?: HTMLInputElement | null) => {
    if (el) el.value = "";
  };

  const onCamChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    pushOne(e.target.files?.[0]); // cámara: 1 por vez
    resetValue(camRef.current);
  };

  const onGalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    pushMany(e.target.files); // galería: múltiples
    resetValue(galRef.current);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => camRef.current?.click()}
        className="px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700"
        title="Abrir cámara"
      >
        Tomar foto
      </button>

      <button
        type="button"
        onClick={() => galRef.current?.click()}
        className="px-4 py-2 rounded bg-slate-600 text-white hover:bg-slate-700"
        title="Seleccionar imágenes desde galería/archivos"
      >
        Subir de galería
      </button>

      {/* Inputs ocultos */}
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onCamChange}
        className="hidden"
      />

      <input
        ref={galRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onGalChange}
        className="hidden"
      />
    </div>
  );
}
