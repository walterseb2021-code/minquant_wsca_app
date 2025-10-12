"use client";
import React from "react";
import Link from "next/link";

export default function Page() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-gray-50 overflow-hidden">
      <div className="max-w-3xl w-full text-center relative">
        {/* Imagen de portada */}
        <img
          src="/lab-machine.jpg"  /* Asegúrate de tener /public/lab-machine.jpg (o cambia a .png si corresponde) */
          alt="MinQuant_WSCA laboratorio"
          className="mx-auto rounded-2xl shadow-lg w-full max-w-md mb-6 object-cover"
        />

        {/* CONTENEDOR del título + franja + partículas */}
        <div className="relative inline-block mb-2">
          {/* Capa de FRANJA animada (degradado mineral) */}
          <div className="absolute -inset-x-6 inset-y-2 bg-gradient-to-r from-blue-700 via-cyan-400 via-emerald-400 to-amber-300 blur-md rounded-lg animate-mineral pointer-events-none" />

          {/* Capa de PARTÍCULAS (opcional, sutil) */}
          <div className="pointer-events-none absolute -inset-x-8 inset-y-4">
            <div className="particles-layer particles-layer--slow" />
            <div className="particles-layer particles-layer--fast" />
          </div>

          {/* Título */}
          <h1 className="relative text-4xl md:text-5xl font-extrabold text-white drop-shadow-lg px-6 py-2">
            Bienvenido a MinQuant_WSCA
          </h1>
        </div>

        <p className="mt-3 text-gray-600">
          Plataforma para análisis inteligente de minerales con tecnología de última generación.
        </p>

        {/* ÚNICO BOTÓN: ir al flujo de cámara + ubicación + análisis */}
        <div className="mt-8">
          <Link
            href="/analisis"
            className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700 transition"
          >
            <span>Comenzar</span>
            <span aria-hidden>📸</span>
          </Link>
        </div>

        <p className="mt-6 text-xs text-gray-400">
          * El navegador te solicitará permisos de <b>cámara</b> y <b>ubicación</b>.
        </p>
      </div>

      {/* Estilos globales (animaciones) */}
      <style jsx global>{`
        /* Franja degradada animada */
        @keyframes mineralFlow {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-mineral { background-size: 300% 300%; animation: mineralFlow 10s ease-in-out infinite; }

        /* Partículas sutiles */
        .particles-layer {
          position: absolute; inset: -10px -20px -10px -20px;
          opacity: 0.18; filter: blur(0.2px);
          mask-image: radial-gradient(closest-side, rgba(0,0,0,1), rgba(0,0,0,0.4));
          -webkit-mask-image: radial-gradient(closest-side, rgba(0,0,0,1), rgba(0,0,0,0.4));
          pointer-events: none;
          background-image:
            radial-gradient(2px 2px at 10% 20%, rgba(255,255,255,0.9) 60%, transparent 61%),
            radial-gradient(1.8px 1.8px at 30% 80%, rgba(255,255,255,0.8) 60%, transparent 61%),
            radial-gradient(2.2px 2.2px at 70% 30%, rgba(255,255,255,0.85) 60%, transparent 61%),
            radial-gradient(1.6px 1.6px at 85% 60%, rgba(255,255,255,0.75) 60%, transparent 61%),
            radial-gradient(1.4px 1.4px at 45% 50%, rgba(255,255,255,0.7) 60%, transparent 61%),
            radial-gradient(2px 2px at 60% 15%, rgba(255,255,255,0.85) 60%, transparent 61%),
            radial-gradient(1.8px 1.8px at 20% 60%, rgba(255,255,255,0.8) 60%, transparent 61%);
          background-repeat: no-repeat; background-size: 100% 100%; mix-blend-mode: screen;
        }
        @keyframes dustDriftSlow { 0% { transform: translate3d(-6px,0,0) } 50% { transform: translate3d(6px,-3px,0) } 100% { transform: translate3d(-6px,0,0) } }
        @keyframes dustDriftFast { 0% { transform: translate3d(6px,-2px,0) } 50% { transform: translate3d(-6px,2px,0) } 100% { transform: translate3d(6px,-2px,0) } }
        .particles-layer--slow { animation: dustDriftSlow 12s ease-in-out infinite; }
        .particles-layer--fast { animation: dustDriftFast 7.5s ease-in-out infinite; opacity: 0.12; }
        @media (max-width: 380px) { .particles-layer { opacity: 0.14; } }
      `}</style>
    </main>
  );
}
