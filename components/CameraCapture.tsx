"use client";
import React from "react";

export type CapturedPhoto = { file: File; url: string; takenAt: string };

type Props = {
  onPhotos: (photos: CapturedPhoto[]) => void;
  multiple?: boolean;
};

export default function CameraCapture({ onPhotos, multiple = true }: Props) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const photos: CapturedPhoto[] = files.map((file) => ({
      file,
      url: URL.createObjectURL(file),
      takenAt: new Date().toISOString(),
    }));
    if (photos.length) onPhotos(photos);
    // Permite volver a abrir la cámara sin recargar
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple={multiple}
        onChange={handleChange}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="px-4 py-2 rounded-2xl shadow border text-sm"
      >
        Tomar foto
      </button>
    </div>
  );
}
