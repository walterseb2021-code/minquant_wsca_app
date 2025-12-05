"use client";

import Link from "next/link";
import LogoutButton from "@/components/LogoutButton";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
      {/* Barra superior simple con nombre de la app y botón salir */}
      <header className="w-full py-3 px-6 border-b border-slate-800 bg-slate-900/80">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold tracking-tight">
              MinQuant_WSCA
            </h1>
            <p className="text-[11px] text-slate-300">
              Plataforma práctica para análisis mineral con cámara y geolocalización.
            </p>
          </div>

          <LogoutButton />
        </div>
      </header>

      {/* Contenido central tipo portada */}
      <div className="flex-1 flex items-center justify-center px-4 py-6">
        <div className="max-w-3xl w-full text-center relative">
          {/* Imagen de portada */}
          <img
            src="/lab-machine.jpg" // asegúrate de tener esta imagen en /public
            alt="MinQuant_WSCA laboratorio"
            className="mx-auto rounded-2xl shadow-lg w-full max-w-md mb-6 object-cover"
          />

          {/* CONTENEDOR del título + franja + partículas */}
          <div className="relative inline-block mb-2">
            {/* Capa de FRANJA animada (degradado mineral) */}
            <div className="absolute -inset-x-6 inset-y-2 bg-gradient-to-r from-blue-700 via-cyan-400 via-emerald-400 to-amber-300 blur-md rounded-lg animate-mineral pointer-events-none" />

            {/* Capa de PARTÍCULAS (sutil) */}
            <div className="pointer-events-none absolute -inset-x-8 inset-y-4">
              <div className="particles-layer particles-layer--slow" />
              <div className="particles-layer particles-layer--fast" />
            </div>

            {/* Título */}
            <h2 className="relative text-3xl md:text-4xl font-extrabold text-white drop-shadow-lg px-6 py-2">
              Bienvenido a MinQuant_WSCA
            </h2>
          </div>

          <p className="mt-3 text-sm text-slate-300">
            Inicia un nuevo análisis mineral usando la cámara, captura de
            ubicación y generación automática de reportes técnicos en PDF.
          </p>

          {/* BOTONES PRINCIPALES */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {/* Botón principal: análisis */}
            <Link
              href="/analisis"
              className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-6 py-3 font-semibold text-white hover:bg-emerald-600 transition"
            >
              <span>Comenzar análisis</span>
              <span aria-hidden>📸</span>
            </Link>

            {/* Botón: Cómo usar la app */}
            <Link
              href="/guia-uso"
              className="inline-flex items-center gap-2 rounded-full border border-slate-600 px-5 py-2.5 text-sm text-slate-100 hover:bg-slate-900 transition"
            >
              <span>Cómo usar MinQuant_WSCA</span>
            </Link>

            {/* Botón: Términos y condiciones */}
            <Link
              href="/terminos"
              className="inline-flex items-center gap-2 rounded-full border border-slate-700 px-5 py-2.5 text-xs sm:text-sm text-slate-300 hover:bg-slate-900 transition"
            >
              <span>Términos y condiciones</span>
            </Link>
          </div>

          <p className="mt-6 text-xs text-slate-400">
            * El navegador te pedirá permisos de <b>cámara</b> y <b>ubicación</b> para
            vincular la muestra al mapa geológico.
          </p>

          {/* Estilos globales (animaciones de franja y partículas) */}
          <style jsx global>{`
            /* Franja degradada animada */
            @keyframes mineralFlow {
              0% { background-position: 0% 50%; }
              50% { background-position: 100% 50%; }
              100% { background-position: 0% 50%; }
            }
            .animate-mineral {
              background-size: 300% 300%;
              animation: mineralFlow 10s ease-in-out infinite;
            }

            /* Partículas sutiles */
            .particles-layer {
              position: absolute;
              inset: -10px -20px -10px -20px;
              opacity: 0.18;
              filter: blur(0.2px);
              mask-image: radial-gradient(
                closest-side,
                rgba(0, 0, 0, 1),
                rgba(0, 0, 0, 0.4)
              );
              -webkit-mask-image: radial-gradient(
                closest-side,
                rgba(0, 0, 0, 1),
                rgba(0, 0, 0, 0.4)
              );
              pointer-events: none;
              background-image:
                radial-gradient(
                  2px 2px at 10% 20%,
                  rgba(255, 255, 255, 0.9) 60%,
                  transparent 61%
                ),
                radial-gradient(
                  1.8px 1.8px at 30% 80%,
                  rgba(255, 255, 255, 0.8) 60%,
                  transparent 61%
                ),
                radial-gradient(
                  2.2px 2.2px at 70% 30%,
                  rgba(255, 255, 255, 0.85) 60%,
                  transparent 61%
                ),
                radial-gradient(
                  1.6px 1.6px at 85% 60%,
                  rgba(255, 255, 255, 0.75) 60%,
                  transparent 61%
                ),
                radial-gradient(
                  1.4px 1.4px at 45% 50%,
                  rgba(255, 255, 255, 0.7) 60%,
                  transparent 61%
                ),
                radial-gradient(
                  2px 2px at 60% 15%,
                  rgba(255, 255, 255, 0.85) 60%,
                  transparent 61%
                ),
                radial-gradient(
                  1.8px 1.8px at 20% 60%,
                  rgba(255, 255, 255, 0.8) 60%,
                  transparent 61%
                );
              background-repeat: no-repeat;
              background-size: 100% 100%;
              mix-blend-mode: screen;
            }

            @keyframes dustDriftSlow {
              0% { transform: translate3d(-6px, 0, 0); }
              50% { transform: translate3d(6px, -3px, 0); }
              100% { transform: translate3d(-6px, 0, 0); }
            }

            @keyframes dustDriftFast {
              0% { transform: translate3d(6px, -2px, 0); }
              50% { transform: translate3d(-6px, 2px, 0); }
              100% { transform: translate3d(6px, -2px, 0); }
            }

            .particles-layer--slow {
              animation: dustDriftSlow 12s ease-in-out infinite;
            }

            .particles-layer--fast {
              animation: dustDriftFast 7.5s ease-in-out infinite;
              opacity: 0.12;
            }

            @media (max-width: 380px) {
              .particles-layer {
                opacity: 0.14;
              }
            }
          `}</style>
        </div>
      </div>
    </main>
  );
}
