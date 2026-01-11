// lib/assistant/guardrails.ts

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

type AssistantMode = "app" | "academic";

const OUT_OF_SCOPE_TEXT =
  "Eso está fuera de mi alcance; volvamos a MinQuant_WSCA. " +
  "Dime en qué pantalla estás (Login / Inicio / Análisis / Términos / Guía) y qué quieres lograr.";

// Prompt-injection
const INJECTION_RX =
  /(ignora (todas )?las instrucciones|olvida las reglas|actua como|haz de cuenta que|system prompt|prompt del sistema|revela|mu[eé]strame tus reglas|jailbreak|dan mode|modo dan|bypass|rompe las reglas)/i;

// ✅ NEW: rutas del app que consideramos “contexto válido” para mensajes genéricos
const KNOWN_APP_PATH_RX =
  /^(\/(login|inicio|analisis|an[aá]lisis|terminos|t[eé]rminos|guia|gu[ií]a)(\/)?|\/)$/i;

// Señales APP (incluye uso + soporte técnico del proyecto)
const IN_SCOPE_APP_RX =
  /(minquant|wsca|app|aplicaci[oó]n|plataforma|pantalla|ventana|paso a paso|flujo|ayuda|gu[ií]a|guia|tutorial|instrucciones|d[oó]nde|c[oó]mo uso|t[eé]rminos|condiciones|privacidad|login|iniciar sesi[oó]n|ingresar|usuario|id de usuario|contrase[nñ]a|bienvenida|inicio|comenzar|analisis|an[aá]lisis|c[aá]mara|foto|im[aá]gen|capturar|geolocaliz|ubicaci[oó]n|gps|yacimientos|geocatmin|interpret|interpretaci[oó]n|mezcla global|resultados|pdf|reporte|ficha|minerales|commodity|econom[ií]a|tipo de cambio|usd|pen|eur|\/api\/auth\/login|\/api\/assistant|\/api\/analyze|\/api\/interpret|\/api\/nearby|\/api\/geounit|\/api\/geocontext|\/api\/commodity-prices|ia no (est[aá]|esté) disponible|cuota|limitaci[oó]n|saturad[ao]|no responde|no funciona|error|fall[oa]|se cuelga|se qued[aó]|build error|module parse failed|identifier .* has already been declared|next\.js|vercel|typescript|tailwind|npm|pnpm|yarn|deploy|producci[oó]n|localhost|ruta\.ts|route\.ts|page\.tsx|component|import|compilar|dev server|npm run dev)/i;

// Señales ACADÉMICAS (mineralogía aplicada)
const IN_SCOPE_ACADEMIC_RX =
  /(mena|ganga|ley|head grade|concentrado|flotaci[oó]n|lixiviaci[oó]n|sulfuro|sulfuros|oxido|óxido|carbonato|calcopirita|pirita|esfalerita|galena|malaquita|azurita|payable|pagable|recuperaci[oó]n|penalidad|impureza|ars[eé]nico|antimonio|plomo|zinc|cobre|oro|plata|ppm|porcentaje|mineralog[ií]a|alteraci[oó]n|oxidaci[oó]n)/i;

// Fuera de alcance (solo por texto del usuario)
const OUT_SCOPE_RX =
  /(presidente|elecciones|partido pol[ií]tico|campaña|voto|congreso|sentencia|demanda|denuncia|fiscal|abogado|c[oó]digo penal|c[oó]digo civil|contrataciones|osce|sunarp|medicina|c[aá]ncer|tratamiento|dieta|receta|síntomas|diagn[oó]stico|psicolog[ií]a|relig[ií]on|bitcoin|trading|apuesta|porn|sexo)/i;

function normalizeText(input: string): string {
  return String(input || "").replace(/\s+/g, " ").trim();
}

function safeStringify(obj: any): string {
  try {
    return JSON.stringify(obj);
  } catch {
    return "";
  }
}

/**
 * Recorta textos largos para no “inflar” el prompt/contexto.
 */
function clipText(s: string, max = 2500): string {
  const t = normalizeText(s || "");
  if (!t) return "";
  return t.length > max ? t.slice(0, max) + "…(recortado)" : t;
}

export function buildSystemPolicy(mode: AssistantMode): string {
  if (mode === "academic") {
    return [
      "Eres el asistente integrado de MinQuant_WSCA (modo académico).",
      "Puedes responder sobre mineralogía aplicada al análisis del app (mena/ganga, sulfuros/óxidos, payable/recuperación, concentración, impurezas).",
      "No des asesoría médica, legal, política, apuestas, ni temas ajenos.",
      "Responde en español, claro y práctico. Evita contenido largo.",
    ].join("\n");
  }

  return [
    "Eres el asistente integrado de MinQuant_WSCA.",
    "Tu único rol es ayudar a usar MinQuant_WSCA: pantallas, flujo, login, botones, análisis, interpretación, geolocalización y PDFs.",
    "También puedes ayudar con soporte técnico del proyecto (errores de build/dev, Next.js/Vercel) siempre dentro del contexto MinQuant_WSCA.",
    "No des asesoría médica, legal, política, financiera externa, ni temas ajenos al uso/desarrollo de MinQuant_WSCA.",
    "Si la pregunta está fuera del ámbito, responde con una negativa breve y redirige al flujo del app con 1-2 preguntas concretas.",
    "Responde en español, claro y práctico. Evita contenido largo.",
  ].join("\n");
}

export function guardrailsCheck(
  userText: string,
  ctx?: {
    pathname?: string | null;
    uiHints?: string[] | null;

    /**
     * visibleState: estado visible de la UI.
     * Recomendado: incluir "screenText" con texto humano de lo que se ve en pantalla.
     */
    visibleState?: Record<string, any> | null;

    mode?: AssistantMode;
  }
): AssistantScopeResult {
  const cleaned = normalizeText(userText);
  const mode: AssistantMode = ctx?.mode === "academic" ? "academic" : "app";

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
        "No puedo ayudar con eso. Volvamos a MinQuant_WSCA: dime en qué pantalla estás y qué te muestra el sistema para poder guiarte.",
    };
  }

  /**
   * 🔥 CAMBIO CLAVE:
   * - Combinamos userText + pathname + hints + screenText + JSON visibleState
   * - screenText es “humano” y evita que el asistente quede ciego ante consultas genéricas.
   */
  let combined = cleaned;

  if (ctx) {
    const p = normalizeText(ctx.pathname || "");
    const hints = Array.isArray(ctx.uiHints) ? ctx.uiHints.join(" ") : "";

    const vsObj = ctx.visibleState && typeof ctx.visibleState === "object" ? ctx.visibleState : null;

    // 1) Texto “humano” visible en pantalla
    const screenText =
      vsObj && typeof (vsObj as any).screenText === "string" ? clipText((vsObj as any).screenText, 2500) : "";

    // 2) JSON resumen
    const vsJson = vsObj ? clipText(safeStringify(vsObj), 2000) : "";

    combined = `${cleaned} ${p} ${hints} ${screenText} ${vsJson}`.trim();
  }

  const outScope = OUT_SCOPE_RX.test(cleaned);

  // Detectar in-scope según modo
  let inScope =
    mode === "academic"
      ? IN_SCOPE_ACADEMIC_RX.test(combined) || IN_SCOPE_APP_RX.test(combined)
      : IN_SCOPE_APP_RX.test(combined);

  // ✅ NEW: si el mensaje es genérico pero hay contexto fuerte del app, lo tratamos como in-scope
  // Ej: "hola", "ayuda", "no funciona", "qué hago", "ok", etc.
  if (!inScope && !outScope) {
    const pathname = normalizeText(ctx?.pathname || "");
    const hasUiHints = Array.isArray(ctx?.uiHints) && (ctx?.uiHints?.length || 0) > 0;
    const hasVisibleState = !!(ctx?.visibleState && typeof ctx.visibleState === "object");
    const isShortGeneric = cleaned.length <= 24;

    const looksLikeAppContext =
      (!!pathname && (KNOWN_APP_PATH_RX.test(pathname) || pathname.includes("/analisis") || pathname.includes("/login"))) ||
      hasUiHints ||
      hasVisibleState;

    if (isShortGeneric && looksLikeAppContext) {
      inScope = true;
    }
  }

  // Si NO es in-scope y SÍ tiene señales claras de fuera de alcance, rechazamos
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
      systemPolicy: buildSystemPolicy(mode),
    };
  }

  return {
    ok: false,
    reason: "out_of_scope",
    cleanedUserText: cleaned,
    refusalText:
      "Puedo ayudarte con MinQuant_WSCA. ¿Estás en Login, Inicio o Análisis? ¿Qué botón o mensaje estás viendo?",
  };
}

export function buildPageContext(input: {
  pathname?: string | null;
  uiHints?: string[] | null;
  visibleState?: Record<string, any> | null;
}): string {
  const pathname = (input?.pathname || "").trim() || "desconocida";
  const uiHints = Array.isArray(input?.uiHints) ? input.uiHints : [];
  const visibleState =
    input?.visibleState && typeof input.visibleState === "object"
      ? input.visibleState
      : null;

  const lines: string[] = [];
  lines.push(`Ruta actual: ${pathname}`);

  if (uiHints.length) {
    lines.push(`Elementos/acciones en pantalla: ${uiHints.join(" | ")}`);
  }

  /**
   * 🔥 CAMBIO CLAVE:
   * Si existe visibleState.screenText, lo añadimos como “Texto visible”.
   */
  if (visibleState && typeof (visibleState as any).screenText === "string") {
    const st = clipText((visibleState as any).screenText, 2500);
    if (st) {
      lines.push(`Texto visible en pantalla (screenText): ${st}`);
    }
  }

  if (visibleState) {
    const safe = clipText(safeStringify(visibleState), 2500);
    if (safe) {
      lines.push(`Estado visible (resumen JSON): ${safe}`);
    }
  }

  return lines.join("\n");
}
