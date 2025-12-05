"use client";

import Link from "next/link";

export default function TerminosPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      {/* Header */}
      <header className="w-full py-3 px-6 border-b border-slate-800 bg-slate-900/80">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <h1 className="text-lg md:text-2xl font-bold tracking-tight">
            Términos y condiciones de uso
          </h1>

          <Link
            href="/"
            className="text-xs sm:text-sm px-3 py-1 rounded-full border border-emerald-500 text-emerald-400 hover:bg-emerald-600 hover:text-white transition"
          >
            ← Volver a inicio
          </Link>
        </div>
      </header>

      {/* Contenido */}
      <section className="max-w-5xl mx-auto px-6 py-6 text-sm md:text-[15px] leading-relaxed space-y-5">
        <p className="text-slate-300">
          El uso de la aplicación <b>MinQuant_WSCA</b> implica la aceptación de
          los presentes términos y condiciones. Esta herramienta está dirigida
          a usuarios que realizan trabajos vinculados a minería, geología,
          exploración o análisis de muestras minerales en general.
        </p>

        <div className="space-y-2">
          <h2 className="text-base md:text-lg font-semibold text-emerald-300">
            1. Naturaleza de la herramienta
          </h2>
          <p>
            MinQuant_WSCA es una aplicación de apoyo para el{" "}
            <b>análisis preliminar</b> de muestras minerales mediante el uso de
            imágenes, geolocalización, contexto geológico y cálculo económico
            referencial. Los resultados generados son{" "}
            <b>estimaciones orientativas</b> y no tienen carácter de ensayo de
            laboratorio, ni de informe geológico o económico formal.
          </p>
          <p>
            El usuario reconoce que las decisiones técnicas, económicas,
            ambientales, legales o de seguridad no deben basarse exclusivamente
            en los resultados de esta herramienta.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-base md:text-lg font-semibold text-emerald-300">
            2. Alcance de los resultados
          </h2>
          <p>
            Los porcentajes minerales, interpretaciones geológicas,
            estimaciones económicas, sugerencias y cualquier otro resultado
            mostrado por la aplicación son generados a partir de:
          </p>
          <ul className="list-disc list-inside ml-4 text-slate-300">
            <li>Imágenes proporcionadas por el usuario.</li>
            <li>Parámetros económicos ingresados manualmente.</li>
            <li>Datos de ubicación y contexto geoespacial disponibles.</li>
            <li>Reglas internas y modelos de interpretación establecidos.</li>
          </ul>
          <p>
            El usuario entiende que pueden existir márgenes de error,
            omisiones, simplificaciones y limitaciones tecnológicas propias del
            sistema, de la calidad de las imágenes y de la información
            disponible en las fuentes externas consultadas.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-base md:text-lg font-semibold text-emerald-300">
            3. Uso responsable
          </h2>
          <p>
            Es responsabilidad exclusiva del usuario verificar, contrastar y
            complementar los resultados de la aplicación con:
          </p>
          <ul className="list-disc list-inside ml-4 text-slate-300">
            <li>Ensayos de laboratorio acreditados.</li>
            <li>Evaluaciones geológicas realizadas por profesionales.</li>
            <li>
              Estudios económicos, legales, ambientales o de seguridad
              elaborados conforme a la normativa aplicable.
            </li>
          </ul>
          <p>
            El usuario se compromete a utilizar la herramienta como complemento
            de su propio criterio técnico y no como sustituto de evaluaciones
            profesionales independientes.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-base md:text-lg font-semibold text-emerald-300">
            4. Datos de entrada y parámetros configurados por el usuario
          </h2>
          <p>
            La precisión de los resultados depende en gran medida de la calidad
            y exactitud de los datos ingresados por el usuario, incluyendo pero
            no limitado a:
          </p>
          <ul className="list-disc list-inside ml-4 text-slate-300">
            <li>Fotografías de la muestra.</li>
            <li>Ubicación geográfica (coordenadas y mapas).</li>
            <li>Precios de referencia de los commodities.</li>
            <li>
              Parámetros de recuperación, payable y otros factores económicos.
            </li>
          </ul>
          <p>
            Cualquier error, inconsistencia o desactualización en dichos datos
            afectará directamente los resultados obtenidos. El usuario es
            responsable de revisar y mantener actualizada la información que
            introduce en la aplicación.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-base md:text-lg font-semibold text-emerald-300">
            5. Fuentes geoespaciales y datos externos
          </h2>
          <p>
            MinQuant_WSCA puede consultar servicios geoespaciales y bases de
            datos externas (por ejemplo, entidades oficiales de geología o
            catastro minero) cuando están disponibles. Sin embargo:
          </p>
          <ul className="list-disc list-inside ml-4 text-slate-300">
            <li>
              La disponibilidad y continuidad de estos servicios no depende de
              la aplicación.
            </li>
            <li>
              Puede existir desfase entre la información publicada y la
              situación real en campo.
            </li>
            <li>
              La interpretación de los datos externos corresponde exclusivamente
              al usuario.
            </li>
          </ul>
          <p>
            La aplicación no garantiza la exactitud, completitud ni
            actualización permanente de la información proveniente de fuentes
            externas.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-base md:text-lg font-semibold text-emerald-300">
            6. Limitación de responsabilidad
          </h2>
          <p>
            En ningún caso el creador de MinQuant_WSCA será responsable por
            daños directos, indirectos, incidentales, especiales, consecuentes o
            de cualquier otro tipo, incluyendo pero no limitado a:
          </p>
          <ul className="list-disc list-inside ml-4 text-slate-300">
            <li>Pérdidas económicas o financieras.</li>
            <li>Decisiones de inversión o explotación basadas en el sistema.</li>
            <li>Daños a equipos, instalaciones o al medio ambiente.</li>
            <li>Sanciones administrativas o responsabilidades legales.</li>
          </ul>
          <p>
            El uso de la aplicación es bajo entera responsabilidad del usuario,
            quien acepta que la herramienta tiene un carácter de apoyo y no
            sustituye la evaluación profesional ni los estudios técnicos
            exigidos por la normativa vigente.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-base md:text-lg font-semibold text-emerald-300">
            7. Privacidad y uso de la información
          </h2>
          <p>
            Las imágenes, coordenadas y parámetros que el usuario introduce en
            la aplicación se utilizan exclusivamente para generar los resultados
            del análisis. El tratamiento de dichos datos se orienta a fines
            técnicos y no a la identificación personal del usuario final.
          </p>
          <p>
            No obstante, se recomienda no incluir en las fotografías ni en los
            textos datos sensibles, información confidencial o elementos que
            puedan comprometer la privacidad de terceros sin la debida
            autorización.
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-base md:text-lg font-semibold text-emerald-300">
            8. Actualizaciones y cambios en la aplicación
          </h2>
          <p>
            MinQuant_WSCA puede ser actualizada periódicamente para mejorar su
            funcionamiento, incorporar nuevas funciones o ajustar los modelos de
            análisis. Estas modificaciones pueden cambiar la forma en que se
            presentan los resultados o se calculan ciertos indicadores.
          </p>
          <p>
            El creador se reserva el derecho de modificar, suspender
            temporalmente o descontinuar partes de la aplicación sin
            notificación previa, especialmente en fases de desarrollo,
            pruebas o mejora continua.
          </p>
        </div>

        {/* Acerca del creador */}
        <div className="border-t border-slate-800 pt-4 mt-6">
          <h2 className="text-base md:text-lg font-semibold text-emerald-300 mb-2">
            Acerca del creador
          </h2>
          <p className="text-slate-300">
            MinQuant_WSCA fue desarrollado por{" "}
            <b>Walter Sebastián Cabanillas Álvarez</b>, integrando conocimiento
            técnico, diseño estructurado y herramientas modernas de inteligencia
            artificial para construir una aplicación confiable, funcional y
            orientada a uso profesional.
          </p>
          <p className="text-slate-300 mt-2">
            El proyecto combina arquitectura digital, metodologías{" "}
            <b>no-code/low-code</b> y desarrollo asistido por IA, permitiendo
            transformar procesos complejos en soluciones accesibles, eficientes
            y adaptadas a las necesidades reales del usuario.
          </p>
        </div>
      </section>
    </main>
  );
}
