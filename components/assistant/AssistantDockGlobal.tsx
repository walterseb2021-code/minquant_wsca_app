// components/assistant/AssistantDockGlobal.tsx
"use client";

import React from "react";
import { usePathname } from "next/navigation";
import AssistantDock from "@/components/assistant/AssistantDock";

export default function AssistantDockGlobal() {
  const pathname = usePathname();

  // En /analisis renderizamos un dock local con visibleState (más potente).
  if (pathname === "/analisis") return null;

  const { visibleState, uiHints } = React.useMemo(() => {
    // Contexto por página (para que el asistente "entienda" qué hay en pantalla)
    if (pathname === "/login") {
      return {
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

    if (pathname === "/") {
      return {
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
        uiHints: [
          "Comenzar análisis",
          "Cómo usar MinQuant_WSCA",
          "Términos y condiciones",
          "Cerrar sesión",
        ],
      };
    }

    if (pathname === "/guia-uso") {
      return {
        visibleState: {
          page: "guia-uso",
          title: "Guía de uso",
          description:
            "Página de instrucciones para usar MinQuant_WSCA: flujo recomendado y buenas prácticas.",
          actions: [
            { label: "Leer pasos de uso", note: "Guía dentro de esta página" },
            { label: "Volver a inicio", route: "/" },
            { label: "Comenzar análisis", route: "/analisis" },
          ],
        },
        uiHints: ["Leer guía", "Ir a /analisis", "Volver a inicio"],
      };
    }

    if (pathname === "/terminos") {
      return {
        visibleState: {
          page: "terminos",
          title: "Términos y condiciones",
          description:
            "Página legal: condiciones de uso, límites de responsabilidad, advertencias técnicas.",
          actions: [
            { label: "Leer términos", note: "Texto dentro de esta página" },
            { label: "Volver a inicio", route: "/" },
          ],
        },
        uiHints: ["Leer términos", "Volver a inicio"],
      };
    }

    // Fallback para cualquier otra página
    return {
      visibleState: {
        page: "unknown",
        title: "Pantalla",
        description:
          "Pantalla de MinQuant_WSCA. Pide al usuario qué botón/parte está viendo si no es claro.",
        actions: [{ label: "Pedir aclaración", note: "¿En qué botón o sección estás?" }],
        pathname,
      },
      uiHints: ["Dime en qué sección estás", "Describe el botón que ves"],
    };
  }, [pathname]);

  return (
    <AssistantDock
      visibleState={visibleState}
      uiHints={uiHints}
      compact
    />
  );
}
