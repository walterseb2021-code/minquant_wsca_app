'use client';
import React, { useEffect, useState } from 'react';
import { buildMineralPdf } from '@/lib/pdf';

type MineralInfo = {
  nombre: string;
  formula?: string;
  densidad?: string;
  color?: string;
  habito?: string;
  ocurrencia?: string;
  notas?: string;
  mohs?: string;
  brillo?: string;
  sistema?: string;
  asociados?: string;
  commodity?: string;
  fuentes?: { title: string; url: string }[];
};

type Props = {
  mineralName: string;
  percentage?: number;
  onClose: () => void;
};

const Row = ({ label, value }: { label: string; value?: string }) => (
  <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
    <strong style={{ width: 160 }}>{label}:</strong>
    <span>{value && value.trim() ? value : '—'}</span>
  </div>
);

export default function MineralFicha({ mineralName, percentage, onClose }: Props) {
  const [info, setInfo] = useState<MineralInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/mineral-info?name=${encodeURIComponent(mineralName)}`, { cache: 'no-store' });
        const j = await r.json();
        if (alive) setInfo(j);
      } catch {
        if (alive) setInfo({ nombre: mineralName });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [mineralName]);

  const handlePdf = async () => {
    try {
      await buildMineralPdf({
        mineralName: info?.nombre || mineralName,
        samplePct: percentage,
        price: 0, // si tienes un precio lo pasas aquí
        currency: 'USD',
        notes: info?.notas || undefined,
        // 👇 añadimos los campos para que el PDF muestre la ficha completa
        infoOverride: info || undefined,
      });
    } catch (e) {
      console.error(e);
      alert('No se pudo generar el PDF de este mineral.');
    }
  };

  return (
    <div style={{ padding: 16, maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>{info?.nombre || mineralName}</h3>
        <button onClick={onClose} style={{ padding: '6px 10px' }}>Cerrar</button>
      </div>

      {loading && <p style={{ marginTop: 12 }}>Cargando ficha desde la web…</p>}

      {!loading && (
        <>
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Row label="Fórmula" value={info?.formula} />
            <Row label="Commodity" value={info?.commodity} />
            <Row label="Densidad (g/cm³)" value={info?.densidad} />
            <Row label="Dureza Mohs" value={info?.mohs} />
            <Row label="Color" value={info?.color} />
            <Row label="Brillo" value={info?.brillo} />
            <Row label="Hábito" value={info?.habito} />
            <Row label="Sistema" value={info?.sistema} />
            <Row label="Ocurrencia" value={info?.ocurrencia} />
            <Row label="Asociados" value={info?.asociados} />
          </div>

          <div style={{ marginTop: 8 }}>
            <Row label="Notas" value={info?.notas} />
          </div>

          {typeof percentage === 'number' && (
            <p style={{ marginTop: 10 }}>
              <strong>% en la muestra:</strong> {percentage.toFixed(2)} %
            </p>
          )}

          {/* Fuentes */}
          {info?.fuentes && info.fuentes.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <strong>Fuentes:</strong>
              <ul style={{ marginTop: 6 }}>
                {info.fuentes.map((f, i) => (
                  <li key={i}>
                    <a target="_blank" rel="noreferrer" href={f.url}>{f.title || f.url}</a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={handlePdf} style={{ padding: '8px 12px', background: '#16a34a', color: '#fff', borderRadius: 6 }}>
              Descargar PDF de este mineral
            </button>
          </div>
        </>
      )}
    </div>
  );
}
