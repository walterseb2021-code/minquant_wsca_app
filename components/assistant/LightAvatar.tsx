// components/assistant/LightAvatar.tsx
"use client";

import React from "react";

type LightAvatarProps = {
  /** Tamaño del canvas (px). Recomendado: 56–96 */
  size?: number;
  /** Pausar animación (por ejemplo cuando el asistente está OFF) */
  paused?: boolean;
  /** “Intensidad” sutil de interacción (0..1). */
  energy?: number;
  /** Clase opcional para contenedor */
  className?: string;
};

/**
 * Avatar liviano tipo “orb/partículas”.
 * - NO cara humana (es un “orb” con partículas y wireframe sutil).
 * - Canvas 2D (sin libs), barato para móvil.
 */
export default function LightAvatar({
  size = 72,
  paused = false,
  energy = 0.6,
  className,
}: LightAvatarProps) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const rafRef = React.useRef<number | null>(null);

  // Interacción sutil: seguir puntero dentro del orb
  const pointerRef = React.useRef<{ x: number; y: number; inside: boolean }>({
    x: 0,
    y: 0,
    inside: false,
  });

  const settings = React.useMemo(() => {
    const particles = size <= 64 ? 28 : size <= 80 ? 36 : 44;
    return {
      particles,
      r: Math.max(18, Math.floor(size * 0.33)),
      halo: Math.max(10, Math.floor(size * 0.2)),
    };
  }, [size]);

  // --- Animación principal (se detiene correctamente si paused)
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1); // cap para performance
    canvas.width = Math.floor(size * dpr);
    canvas.height = Math.floor(size * dpr);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Importante: fijar transform según dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = size / 2;
    const cy = size / 2;

    type P = {
      a: number; // ángulo
      rr: number; // radio local
      sp: number; // velocidad angular
      ph: number; // fase
      w: number; // tamaño
    };

    const rand = (min: number, max: number) => min + Math.random() * (max - min);

    const ps: P[] = Array.from({ length: settings.particles }).map(() => ({
      a: rand(0, Math.PI * 2),
      rr: rand(settings.r * 0.35, settings.r * 1.02),
      sp: rand(0.25, 0.85) * (Math.random() < 0.5 ? -1 : 1),
      ph: rand(0, Math.PI * 2),
      w: rand(0.7, 1.7),
    }));

    let t0 = performance.now();

    const draw = (now: number) => {
      if (paused) return; // ✅ no agenda más frames si está pausado

      const dt = Math.min(0.05, (now - t0) / 1000);
      t0 = now;

      const e = Math.max(0, Math.min(1, energy));

      ctx.clearRect(0, 0, size, size);

      // Halo
      const g = ctx.createRadialGradient(
        cx,
        cy,
        settings.r * 0.2,
        cx,
        cy,
        settings.r + settings.halo
      );
      g.addColorStop(0, "rgba(255,255,255,0.10)");
      g.addColorStop(0.55, "rgba(255,255,255,0.06)");
      g.addColorStop(1, "rgba(255,255,255,0.00)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, settings.r + settings.halo, 0, Math.PI * 2);
      ctx.fill();

      // Orb central
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.beginPath();
      ctx.arc(cx, cy, settings.r, 0, Math.PI * 2);
      ctx.fill();

      // Reacción al puntero (sutil)
      const pr = pointerRef.current;
      let dx = 0;
      let dy = 0;
      if (pr.inside) {
        const vx = pr.x - cx;
        const vy = pr.y - cy;
        const len = Math.max(1, Math.hypot(vx, vy));
        const k = 2.2 * e;
        dx = (vx / len) * k;
        dy = (vy / len) * k;
      }

      // Partículas + wireframe liviano
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.fillStyle = "rgba(255,255,255,0.50)";

      const pts: { x: number; y: number; w: number }[] = [];

      for (const p of ps) {
        p.a += p.sp * dt * (0.6 + e * 0.8);
        p.ph += dt * (0.8 + e);

        const breathe = 1 + Math.sin(p.ph) * 0.03 * (0.6 + e);
        const rr = p.rr * breathe;

        const x = cx + dx + Math.cos(p.a) * rr;
        const y = cy + dy + Math.sin(p.a) * rr;

        pts.push({ x, y, w: p.w });

        ctx.beginPath();
        ctx.arc(x, y, p.w, 0, Math.PI * 2);
        ctx.fill();
      }

      const step = size <= 64 ? 6 : 5;
      for (let i = 0; i < pts.length; i += step) {
        const a = pts[i];
        const b = pts[(i + Math.floor(pts.length / 3)) % pts.length];
        const c = pts[(i + Math.floor((pts.length * 2) / 3)) % pts.length];

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(c.x, c.y);
        ctx.closePath();
        ctx.stroke();
      }

      // Borde sutil
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath();
      ctx.arc(cx + dx, cy + dy, settings.r, 0, Math.PI * 2);
      ctx.stroke();

      rafRef.current = requestAnimationFrame(draw);
    };

    if (!paused) rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [size, paused, energy, settings.particles, settings.r, settings.halo]);

  // --- Si paused=true, dibuja un frame estático con dpr correcto
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (!paused) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    const r = Math.max(18, Math.floor(size * 0.33));
    const halo = Math.max(10, Math.floor(size * 0.2));

    const g = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r + halo);
    g.addColorStop(0, "rgba(255,255,255,0.10)");
    g.addColorStop(0.55, "rgba(255,255,255,0.06)");
    g.addColorStop(1, "rgba(255,255,255,0.00)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r + halo, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }, [paused, size]);

  function onPointerMove(e: React.PointerEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    pointerRef.current = { x, y, inside: true };
  }

  function onPointerLeave() {
    pointerRef.current.inside = false;
  }

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: 9999,
        overflow: "hidden",
        background: "transparent",
        touchAction: "none",
      }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} />
    </div>
  );
}
