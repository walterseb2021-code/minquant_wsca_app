// lib/assistant/guardrails.ts
/**
 * Guardrails de dominio: el asistente SOLO debe responder sobre MinQuant_WSCA
 * (uso del app, pantallas, flujo, interpretación de resultados, PDFs, geolocalización,
 * y endpoints propios como /api/analyze, /api/interpret, etc.).
 *
 * Objetivo:
 * - Bloquear preguntas fuera del ámbito (política, salud, derecho, etc.)
 * - Mitigar prompt-injection (ignora instrucciones, actúa como..., etc.)
 * - Mantener respuestas cortas, guiadas y accionables dentro del app
 */

export type AssistantScopeResult =
  | {
      ok: true;
      reason: "in_scope";
      cleanedUserText: string;
      systemPolicy: string;
    }
  | {
      ok: false;
      reason: "out_of_scope" | "unsafe_or_injection" | "empty";
      cleanedUserText: string;
      refusalText: string;
    };

const OUT_OF_SCOPE_TEXT =
  "Eso está fuera de mi alcance; volvamos a MinQuant_WSCA. " +
  "¿En qué parte del app estás (por ejemplo /analisis) y qué necesitas hacer: analizar fotos, interpretar resultados o generar el PDF?";

/**
 * Palabras/frases típicas de prompt injection o intento de salir del rol.
 * No es perfecto, pero reduce casos comunes.
 */
const INJECTION_RX =
  /(ignora (todas )?las instrucciones|olvida las reglas|actua como|haz de cuenta que|system prompt|prompt del sistema|revela|mu[eé]strame tus reglas|jailbreak|dan mode|modo dan|bypass|rompe las reglas)/i;

/**
 * Señales de que el usuario está hablando del app MinQuant_WSCA
 * (rutas/páginas, features, PDFs, geolocalización, minerales, endpoints).
 */
const IN_SCOPE_RX =
  /(minquant|wsca|analisis|an[aá]lisis|analyzer|c[aá]mara|foto|im[aá]gen|capturar|geolocaliz|ubicaci[oó]n|gps|yacimientos|nearby|geocatmin|geounit|interpret|interpretaci[oó]n|mezcla global|por imagen|excluida|pdf|reporte|ficha|mineral|minerales|commodity|econom[ií]a|payable|recuperaci[oó]n|tipo de cambio|usd|pen|eur|\/api\/analyze|\/api\/interpret|\/api\/nearby|\/api\/geounit|\/api\/commodity-prices)/i;

/**
 * Temas comúnmente fuera de alcance (no bloquea todo, solo ayuda a detectar).
 * Si el texto NO tiene señales in-scope y SÍ tiene señales out-of-scope → bloquear.
 */
const OUT_SCOPE_RX =
  /(presidente|elecciones|partido pol[ií]tico|campaña|voto|congreso|sentencia|demanda|denuncia|fiscal|abogado|c[oó]digo penal|c[oó]digo civil|contrataciones|osce|sunarp|ingemmet(?!.*geo)|medicina|c[aá]ncer|tratamiento|dieta|receta|síntomas|diagn[oó]stico|psicolog[ií]a|relig[ií]on|bitcoin|trading|apuesta|porn|sexo)/i;

function normalizeText(input: string): string {
  return String(input || "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Devuelve una política de sistema corta para usar en Gemini/OpenAI:
 * - Responder SOLO sobre el app
 * - Si está fuera de alcance: rechazar y redirigir
 */
export function buildSystemPolicy(): string {
  return [
    "Eres el asistente integrado de MinQuant_WSCA.",
    "Tu único rol es ayudar a usar MinQuant_WSCA: pantallas, flujo, análisis de imágenes, interpretación, geolocalización, y generación/lectura de PDFs.",
    "No des asesoría médica, legal, política, financiera, ni temas ajenos al uso de MinQuant_WSCA.",
    "Si la pregunta está fuera del ámbito, responde con una negativa breve y redirige al flujo del app con 1-2 preguntas concretas.",
    "Responde en español, claro y práctico. Evita contenido largo.",
  ].join("\n");
}

/**
 * Evalúa si una consulta está dentro del ámbito del app.
 * - Si detecta inyección: bloquea
 * - Si no hay señales del app y sí hay señales out-of-scope: bloquea
 * - Si está vacía: bloquea
 * - Si tiene señales del app: ok
 * - Caso gris: por defecto bloquea suave (para cumplir guardrails estrictos)
 */
export function guardrailsCheck(userText: string): AssistantScopeResult {
  const cleaned = normalizeText(userText);

  if (!cleaned) {
    return {
      ok: false,
      reason: "empty",
      cleanedUserText: cleaned,
      refusalText: OUT_OF_SCOPE_TEXT,
    };
  }

  if (INJECTION_RX.test(cleaned)) {
    return {
      ok: false,
      reason: "unsafe_or_injection",
      cleanedUserText: cleaned,
      refusalText:
        "No puedo ayudar con eso. Volvamos a MinQuant_WSCA: dime en qué página estás y qué te muestra el sistema para poder explicarlo.",
    };
  }

  const inScope = IN_SCOPE_RX.test(cleaned);
  const outScope = OUT_SCOPE_RX.test(cleaned);

  if (!inScope && outScope) {
    return {
      ok: false,
      reason: "out_of_scope",
      cleanedUserText: cleaned,
      refusalText: OUT_OF_SCOPE_TEXT,
    };
  }

  if (inScope) {
    return {
      ok: true,
      reason: "in_scope",
      cleanedUserText: cleaned,
      systemPolicy: buildSystemPolicy(),
    };
  }

  // Caso gris: guardrail estricto → bloquear suave
  return {
    ok: false,
    reason: "out_of_scope",
    cleanedUserText: cleaned,
    refusalText: OUT_OF_SCOPE_TEXT,
  };
}

/**
 * Construye un texto de "contexto de página" para enviar al modelo,
 * sin filtrar datos sensibles. Solo descripción de UI y estado.
 */
export function buildPageContext(input: {
  pathname?: string | null;
  uiHints?: string[] | null;
  visibleState?: Record<string, any> | null;
}): string {
  const pathname = (input?.pathname || "").trim() || "desconocida";
  const uiHints = Array.isArray(input?.uiHints) ? input.uiHints : [];
  const visibleState = input?.visibleState && typeof input.visibleState === "object" ? input.visibleState : null;

  const lines: string[] = [];
  lines.push(`Ruta actual: ${pathname}`);

  if (uiHints.length) {
    lines.push(`Elementos/acciones en pantalla: ${uiHints.join(" | ")}`);
  }

  if (visibleState) {
    // No enviar objetos gigantes: limitar a 3KB aprox en string
    let safe = "";
    try {
      safe = JSON.stringify(visibleState);
    } catch {
      safe = "";
    }
    if (safe) {
      const clipped = safe.length > 3000 ? safe.slice(0, 3000) + "…(recortado)" : safe;
      lines.push(`Estado visible (resumen JSON): ${clipped}`);
    }
  }

  return lines.join("\n");
}
