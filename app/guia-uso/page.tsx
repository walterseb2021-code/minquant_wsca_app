"use client";

import Link from "next/link";

export default function GuiaUsoPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      {/* Header */}
      <header className="w-full py-3 px-6 border-b border-slate-800 bg-slate-900/80">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <h1 className="text-lg md:text-2xl font-bold tracking-tight">
            Cómo usar MinQuant_WSCA
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
          MinQuant_WSCA es una herramienta profesional para el{" "}
          <b>reconocimiento preliminar de minerales</b>, con integración de{" "}
          <b>cámara</b>, <b>geolocalización</b>, contexto geológico,
          estimación económica referencial y generación automática de reportes
          en PDF (general y fichas por mineral).
        </p>

        <p className="text-slate-400 text-xs">
          Esta guía describe paso a paso cómo usar la consola de análisis y qué
          significa cada bloque que ves en la pantalla de <b>Cámara – Ubicación – Análisis</b>.
        </p>

        {/* 1. Inicio y código */}
        <div className="space-y-2">
          <h2 className="text-base md:text-lg font-semibold text-emerald-300">
            1. Ingreso al análisis y código de muestra
          </h2>
          <p>
            Tras iniciar sesión y hacer clic en{" "}
            <b>“Comenzar análisis”</b>, la app te lleva al panel principal de
            análisis. En la parte superior verás el <b>Código de muestra</b>,
            que se genera automáticamente (por ejemplo: <b>MQ-0001</b>). Este
            código identifica toda la sesión y aparecerá en:
          </p>
          <ul className="list-disc list-inside ml-4 text-slate-300">
            <li>La pantalla de resultados.</li>
            <li>El PDF general del análisis.</li>
            <li>Las fichas técnicas individuales que generes.</li>
          </ul>
          <p>
            Si lo necesitas, puedes editar manualmente el código para adaptarlo
            a tu sistema interno de muestras.
          </p>
        </div>

        {/* 2. Moneda y tipo de cambio */}
        <div className="space-y-2">
          <h2 className="text-base md:text-lg font-semibold text-emerald-300">
            2. Moneda y tipo de cambio
          </h2>
          <p>
            Debajo del código de muestra verás el selector de <b>Moneda</b>.
            Puedes elegir entre:
          </p>
          <ul className="list-disc list-inside ml-4 text-slate-300">
            <li>USD – dólares estadounidenses</li>
            <li>PEN – soles peruanos</li>
            <li>EUR – euros</li>
          </ul>
          <p>
            A la derecha encontrarás los campos de <b>Tipo de cambio</b>:
          </p>
          <ul className="list-disc list-inside ml-4 text-slate-300">
            <li><b>1 USD = X PEN</b></li>
            <li><b>1 EUR = Y PEN</b></li>
          </ul>
          <p>
            La app trae valores por defecto, pero tú puedes colocar el{" "}
            <b>tipo de cambio real del día</b> o el que uses en tu proyecto.
            Estos valores se utilizan para convertir los precios de referencia
            de los commodities a la moneda seleccionada y se verán reflejados
            en la sección económica del PDF.
          </p>
        </div>

        {/* 3. Recuperación y Payable */}
        <div className="space-y-2">
          <h2 className="text-base md:text-lg font-semibold text-emerald-300">
            3. Recuperación y Payable (proceso Cu/Zn/Pb)
          </h2>
          <p>
            El cuadro de <b>“Recuperación y Payable (proceso Cu/Zn/Pb)”</b> te
            permite definir cómo se comportaría el mineral en una planta típica
            de concentración y venta. Los valores que aparecen en pantalla
            vienen ajustados según rangos comunes de:
          </p>
          <ul className="list-disc list-inside ml-4 text-slate-300">
            <li><b>Recuperación (%)</b> – qué parte del metal llega al concentrado.</li>
            <li><b>Payable (%)</b> – qué porcentaje del metal pagaría la fundición.</li>
          </ul>
          <p>
            Estos parámetros son <b>totalmente editables</b>. Si trabajas con
            una planta específica o con contratos diferentes, puedes
            modificarlos y la app recalculará la porción económica pagable en
            el reporte.
          </p>
        </div>

        {/* 4. Economía – precios */}
        <div className="space-y-2">
          <h2 className="text-base md:text-lg font-semibold text-emerald-300">
            4. Economía – Precios de referencia (editable)
          </h2>
          <p>
            En el bloque de <b>“Economía – Precios de referencia”</b> verás una
            tabla con más de 20 commodities (Cu, Au, Ag, Fe, Zn, Pb, entre
            otros). Los valores mostrados vienen de:
          </p>
          <ul className="list-disc list-inside ml-4 text-slate-300">
            <li>
              Precios de referencia internacionales y promedios utilizados de forma
              orientativa.
            </li>
          </ul>
          <p>
            Puedes <b>modificar cualquier precio manualmente</b> para ajustarlo
            a:
          </p>
          <ul className="list-disc list-inside ml-4 text-slate-300">
            <li>El mercado del día.</li>
            <li>El contrato de tu proyecto.</li>
            <li>Escenarios de sensibilidad (precio alto, bajo, etc.).</li>
          </ul>
          <p>
            El botón <b>“Restaurar por defecto”</b> devuelve todos los
            precios al conjunto estándar de la app, por si quieres comenzar de
            nuevo desde un escenario base.
          </p>
        </div>

        {/* 5. Imágenes */}
        <div className="space-y-2">
          <h2 className="text-base md:text-lg font-semibold text-emerald-300">
            5. Imágenes de la muestra: cámara y galería
          </h2>
          <p>
            El siguiente bloque es el corazón visual del análisis. Aquí puedes:
          </p>
          <ul className="list-disc list-inside ml-4 text-slate-300">
            <li><b>Tomar foto</b> con la cámara del dispositivo.</li>
            <li><b>Subir desde galería/archivo</b> si ya tienes las fotos guardadas.</li>
          </ul>
          <p>
            La app permite hasta <b>6 fotos por muestra</b>. Se recomienda:
          </p>
          <ul className="list-disc list-inside ml-4 text-slate-300">
            <li>Fotografiar desde distintos ángulos.</li>
            <li>Usar buena iluminación y fondo neutro.</li>
            <li>Evitar reflejos, sombras fuertes o imágenes movidas.</li>
          </ul>
          <p>
            Todas las imágenes se utilizan de forma conjunta para construir la{" "}
            <b>mezcla mineral global</b> y los resultados por imagen.
          </p>
        </div>

        {/* 6. Ubicación de la muestra */}
        <div className="space-y-2">
          <h2 className="text-base md:text-lg font-semibold text-emerald-300">
            6. Ubicación de la muestra y mapa
          </h2>
          <p>
            El cuadro de <b>“Ubicación de la muestra”</b> ofrece dos opciones:
          </p>
          <ul className="list-disc list-inside ml-4 text-slate-300">
            <li>
              <b>Obtener ubicación actual</b>: la app toma la posición GPS
              del dispositivo (ideal cuando estás en campo).
            </li>
            <li>
              <b>Ingresar coordenadas manualmente</b>: útil si ya tienes las
              coordenadas de la muestra registradas con un GPS u otro método.
            </li>
          </ul>
          <p>
            Luego puedes hacer clic en <b>“Ver mapa con coordenadas”</b> para
            abrir el mapa interactivo. Allí podrás alternar entre:
          </p>
          <ul className="list-disc list-inside ml-4 text-slate-300">
            <li>Mapa tipo carretera.</li>
            <li>Vista satelital (similar a Google Earth).</li>
            <li>Vista de relieve.</li>
            <li>Opciones 3D cuando la fuente lo permita.</li>
          </ul>
          <p>
            La ubicación se imprime en los PDF y se usa para buscar
            yacimientos cercanos y para contextualizar geológicamente la
            muestra.
          </p>
        </div>

        {/* 7. Yacimientos cercanos */}
        <div className="space-y-2">
          <h2 className="text-base md:text-lg font-semibold text-emerald-300">
            7. Buscar yacimientos cercanos
          </h2>
          <p>
            Una vez fijado el punto en el mapa, puedes pulsar el botón{" "}
            <b>“Buscar yacimientos cercanos”</b>. La app consultará fuentes
            oficiales y devolverá, cuando existan datos:
          </p>
          <ul className="list-disc list-inside ml-4 text-slate-300">
            <li>Yacimientos metálicos o no metálicos.</li>
            <li>Ocurrencias registradas.</li>
            <li>Otros elementos relevantes según la fuente.</li>
          </ul>
          <p>
            Cada resultado tiene un botón <b>“Incluir”</b>. Al incluirlos,
            esos yacimientos pasarán a formar parte del resumen del análisis y
            aparecerán en el PDF general.
          </p>
        </div>

        {/* 8. Fuentes geoespaciales */}
        <div className="space-y-2">
          <h2 className="text-base md:text-lg font-semibold text-emerald-300">
            8. Fuentes geoespaciales
          </h2>
          <p>
            En el bloque de <b>“Fuentes geoespaciales”</b> puedes elegir el
            país de estudio. Para cada país, la app muestra las capas y
            servicios que utiliza (por ejemplo, GEOCATMIN en Perú).
          </p>
          <p>
            Por ahora la opción más probada es <b>Perú</b>, donde se han
            configurado capas geológicas y de yacimientos. En otros países
            las capas pueden ser más limitadas o experimentales.
          </p>
        </div>

        {/* 9. Ejecutar análisis */}
        <div className="space-y-2">
          <h2 className="text-base md:text-lg font-semibold text-emerald-300">
            9. Ejecutar el análisis mineral
          </h2>
          <p>
            Cuando ya tienes fotos, parámetros económicos y ubicación, pulsa
            el botón <b>“Analizar”</b>. MinQuant_WSCA procesará las imágenes
            y generará varios bloques de resultados:
          </p>

          <h3 className="text-sm md:text-base font-semibold text-emerald-200 mt-2">
            9.1 Mezcla global
          </h3>
          <p>
            Presenta la <b>mezcla mineral global normalizada al 100%</b>, con
            el porcentaje estimado de cada mineral en la muestra completa.
            Para cada mineral verás un botón <b>“Ficha”</b> que permite abrir y
            descargar una ficha técnica en PDF.
          </p>

          <h3 className="text-sm md:text-base font-semibold text-emerald-200 mt-2">
            9.2 Resultados por imagen
          </h3>
          <p>
            Debajo se listan las imágenes analizadas. Para cada una se
            muestran los minerales predominantes y sus porcentajes. Esto
            permite ver cómo aporta cada foto al resultado global.
          </p>
        </div>

        {/* 10. Interpretación preliminar */}
        <div className="space-y-2">
          <h2 className="text-base md:text-lg font-semibold text-emerald-300">
            10. Interpretación preliminar: Geología, Economía y Advertencias
          </h2>
          <p>
            Este bloque integra los resultados en un resumen textual que se
            divide en tres partes:
          </p>
          <ul className="list-disc list-inside ml-4 text-slate-300">
            <li>
              <b>Geología</b>: describe el tipo de entorno geológico sugerido
              por la mezcla mineral (por ejemplo, zonas de oxidación,
              presencia de minerales indicadores, etc.).
            </li>
            <li>
              <b>Economía</b>: analiza si hay minerales potencialmente
              interesantes desde el punto de vista económico, considerando
              los parámetros de recuperación, payable y precios configurados.
            </li>
            <li>
              <b>Advertencias</b>: recuerda que el análisis es preliminar y
              no reemplaza ensayos de laboratorio ni informes geológicos
              formales.
            </li>
          </ul>
        </div>

        {/* 11. Sugerencias automáticas */}
        <div className="space-y-2">
          <h2 className="text-base md:text-lg font-semibold text-emerald-300">
            11. Sugerencias automáticas
          </h2>
          <p>
            En algunos casos la app puede detectar ajustes recomendados sobre
            la mezcla o el tratamiento de ciertos minerales. Estas aparecen
            en el bloque de <b>“Sugerencias automáticas disponibles”</b>.
          </p>
          <p>
            El botón <b>“Aplicar sugerencias”</b> permite aplicar dichos
            cambios y actualizar los resultados. Es una herramienta opcional
            para mejorar la coherencia de la interpretación.
          </p>
        </div>

        {/* 12. Yacimientos incluidos */}
        <div className="space-y-2">
          <h2 className="text-base md:text-lg font-semibold text-emerald-300">
            12. Yacimientos incluidos en el estudio
          </h2>
          <p>
            En el panel lateral de resultados verás la lista de <b>Yacimientos
            incluidos</b>. Son aquellos que decidiste incorporar desde la
            búsqueda de yacimientos cercanos. Cada uno muestra:
          </p>
          <ul className="list-disc list-inside ml-4 text-slate-300">
            <li>Nombre o tipo de depósito.</li>
            <li>Mineral principal.</li>
            <li>Distancia aproximada a tu punto de muestra.</li>
            <li>La fuente geológica oficial utilizada.</li>
          </ul>
        </div>

        {/* 13. PDF general y fichas */}
        <div className="space-y-2">
          <h2 className="text-base md:text-lg font-semibold text-emerald-300">
            13. Generación del PDF general y fichas por mineral
          </h2>
          <p>
            Cuando estés conforme con el análisis, puedes generar los
            reportes:
          </p>
          <ul className="list-disc list-inside ml-4 text-slate-300">
            <li>
              <b>PDF general</b>: botón ubicado junto al de Analizar. Incluye
              portada con mapa, mezcla global, resultados por imagen,
              interpretación, economía referencial y yacimientos incluidos.
            </li>
            <li>
              <b>Fichas individuales</b>: desde el cuadro de mezcla global,
              usando el botón <b>Ficha</b> de cada mineral, puedes descargar
              una ficha técnica PDF para ese mineral.
            </li>
          </ul>
        </div>

        {/* Nota final */}
        <div className="border-t border-slate-800 pt-4 mt-4">
          <p className="text-xs text-slate-400">
            <b>Importante:</b> MinQuant_WSCA es una herramienta de apoyo para
            análisis preliminar. Los resultados son orientativos y no
            sustituyen ensayos de laboratorio certificados ni informes
            geológicos formales cuando sean requeridos por norma o por las
            políticas de tu organización.
          </p>
        </div>
      </section>
    </main>
  );
}
