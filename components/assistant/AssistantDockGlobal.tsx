// components/assistant/AssistantDockGlobal.tsx
"use client";

import React from "react";
import { usePathname } from "next/navigation";
import AssistantDock from "@/components/assistant/AssistantDock";

export default function AssistantDockGlobal() {
  const pathname = usePathname();

  // ✅ Evita hydration mismatch (SSR vs client)
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // ✅ IMPORTANTE: useMemo SIEMPRE se ejecuta (no return antes)
  const { visibleState, uiHints, compact } = React.useMemo(() => {
    // =========================
    // /login
    // =========================
    if (pathname === "/login") {
      return {
        compact: true,
        visibleState: {
          page: "login",
          title: "Inicio de sesión",
          description:
            "Pantalla para ingresar con ID (U000–U040) y contraseña (MQ-0001, etc.). Todo se convierte a MAYÚSCULAS.",
          actions: [
            { label: "Escribir ID de usuario", example: "U001" },
            { label: "Escribir contraseña", example: "MQ-0001" },
            { label: "Iniciar sesión", example: "Botón: Iniciar sesión" },
            { label: "Ver/Ocultar contraseña", example: "Botón: Ver/Ocultar" },
          ],
        },
        uiHints: [
          "Ingresa tu ID (U000–U040)",
          "Ingresa tu contraseña (MQ-0001, etc.)",
          "Presiona Iniciar sesión",
          "Si falla, revisa el mensaje rojo",
        ],
      };
    }

    // =========================
    // /
    // =========================
    if (pathname === "/") {
      return {
        compact: true,
        visibleState: {
          page: "home",
          title: "Bienvenida",
          description:
            "Pantalla de bienvenida con accesos rápidos para comenzar análisis, leer la guía y ver términos.",
          actions: [
            { label: "Comenzar análisis", route: "/analisis" },
            { label: "Cómo usar MinQuant_WSCA", route: "/guia-uso" },
            { label: "Términos y condiciones", route: "/terminos" },
            { label: "Cerrar sesión", note: "Botón Salir" },
          ],
        },
        uiHints: ["Comenzar análisis", "Cómo usar MinQuant_WSCA", "Términos y condiciones", "Cerrar sesión"],
      };
    }

    // =========================
    // /guia-uso
    // =========================
    if (pathname === "/guia-uso") {
      return {
        compact: true,
        visibleState: {
          page: "guia-uso",
          title: "Guía de uso",
          description: "Instrucciones para usar MinQuant_WSCA: flujo recomendado y buenas prácticas.",
          actions: [
            { label: "Leer pasos de uso", note: "Guía dentro de esta página" },
            { label: "Volver a inicio", route: "/" },
            { label: "Comenzar análisis", route: "/analisis" },
          ],
        },
        uiHints: ["Leer guía", "Ir a /analisis", "Volver a inicio"],
      };
    }

    // =========================
    // /terminos
    // =========================
    if (pathname === "/terminos") {
      return {
        compact: true,
        visibleState: {
          page: "terminos",
          title: "Términos y condiciones",
          description: "Página legal: condiciones de uso, límites de responsabilidad, advertencias técnicas.",
          actions: [
            { label: "Leer términos", note: "Texto dentro de esta página" },
            { label: "Volver a inicio", route: "/" },
          ],
        },
        uiHints: ["Leer términos", "Volver a inicio"],
      };
    }

    // =========================
    // ✅ /analisis (ahora SÍ aparece)
    // =========================
    if (pathname === "/analisis") {
      return {
        compact: true,
        visibleState: {
          page: "analisis",
          title: "Análisis",
          description:
            "Flujo principal: 1) Tomar/Subir fotos (máx 6) 2) Obtener ubicación GPS 3) Analizar 4) (Opcional) Buscar yacimientos cercanos 5) Interpretación 6) PDF general / PDF mineral.",
          actions: [
            { label: "Tomar/Subir fotos", note: "Máximo 6 imágenes" },
            { label: "Obtener ubicación (GPS)", note: "Necesario para mapa y yacimientos cercanos" },
            { label: "Analizar", note: "Genera mezcla global y resultados por foto" },
            { label: "Buscar yacimientos cercanos", note: "Opcional, requiere GPS" },
            { label: "Interpretación", note: "Geología / Economía / Advertencias" },
            { label: "PDF general", note: "Exporta reporte completo" },
            { label: "PDF mineral", note: "Desde la ficha de un mineral" },
          ],
        },
        uiHints: [
          "📸 Paso 1: toma o sube fotos (máx 6)",
          "📍 Paso 2: obtén GPS para mapa y yacimientos",
          "🧪 Paso 3: presiona Analizar",
          "🧠 Interpretación aparece tras analizar",
          "📄 PDF general / PDF mineral",
        ],
      };
    }

    // =========================
    // Fallback
    // =========================
    return {
      compact: true,
      visibleState: {
        page: "unknown",
        title: "Pantalla",
        description: "Pantalla de MinQuant_WSCA. Si no es claro, pide al usuario qué botón/parte está viendo.",
        actions: [{ label: "Pedir aclaración", note: "¿En qué botón o sección estás?" }],
        pathname,
      },
      uiHints: ["Dime en qué sección estás", "Describe el botón que ves"],
    };
  }, [pathname]);

 // ✅ Ahora sí: no renderizamos nada hasta estar montado
if (!mounted) return null;

// ✅ CLAVE: en /analisis NO usamos el global
// porque ahí ya existe el AssistantDock local con estado real (fotos, resultados, etc.)
if (pathname === "/analisis") return null;

return <AssistantDock visibleState={visibleState} uiHints={uiHints} compact={compact} />;
}
