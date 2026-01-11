// app/api/assistant/route.ts
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { guardrailsCheck, buildPageContext } from "@/lib/assistant/guardrails";

export const runtime = "nodejs";
export const maxDuration = 60;

// ✅ Modelos (si tu proyecto tiene cuota, funcionarán; si no, caerá al fallback)
const MODEL_FALLBACKS = [
  "gemini-2.5-flash-preview-05-20",
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.0-flash",
  "gemini-1.5-flash-8b",
  "gemini-1.5-flash",
  "gemini-2.5-pro",
  "gemini-pro-latest",
] as const;

type AssistantMode = "app" | "academic";

type AssistantRequest = {
  message: string;
  mode?: AssistantMode | string;

  pathname?: string | null;
  uiHints?: string[] | null;
  visibleState?: Record<string, any> | null;
  history?: { role: "user" | "assistant"; content: string }[] | null;
};

type AssistantResponse = {
  ok: boolean;
  outOfScope: boolean;
  reason?: string;
  reply: string;
  debug?: {
    modelUsed?: string;
    via?: "gemini" | "fallback";
    modeReceived?: any;
    modeResolved?: AssistantMode;
    pathname?: string | null;
  };
};

function safeText(x: any, max = 4000) {
  const s = String(x ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function extractJsonObject(text: string): any | null {
  if (!text) return null;
  const t = text.trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}
async function listModelsForKey(apiKey: string): Promise<string[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  try {
    const r = await fetch(url, { cache: "no-store" });
    const j = await r.json();
    const names: string[] = Array.isArray(j?.models)
      ? j.models.map((m: any) => m?.name).filter(Boolean)
      : [];
    return names.map((n) => n.replace(/^models\//, ""));
  } catch {
    return [];
  }
}

const MAX_RETRIES = 2;
const INITIAL_DELAY_MS = 700;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function genWithRetry(
  model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]>,
  contents: any
) {
  let delay = INITIAL_DELAY_MS;
  for (let i = 0; i <= MAX_RETRIES; i++) {
    try {
      return await (model as any).generateContent({ contents });
    } catch (e: any) {
      const msg = String(e?.message || e);
      const maybeOverload = /(?:503|overloaded|quota|rate|429)/i.test(msg);
      if (i < MAX_RETRIES && maybeOverload) {
        await sleep(delay);
        delay *= 1.6;
        continue;
      }
      throw e;
    }
  }
  throw new Error("Sin respuesta tras reintentos.");
}

function isQuota429(err: any) {
  const msg = String(err?.message || err || "");
  return msg.includes("429") || msg.toLowerCase().includes("quota exceeded");
}

function stripDiacritics(s: string) {
  // quita tildes/diacríticos: "académico" -> "academico"
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeMode(raw: any): AssistantMode {
  const v = stripDiacritics(String(raw ?? "").trim().toLowerCase());

  // Acepta varias formas
  if (v === "academic" || v === "academico" || v === "academica" || v === "academy")
    return "academic";
  if (v === "app" || v === "aplicacion" || v === "aplicación") return "app";

  return "app";
}

// Si el frontend manda mal el mode, igual detectamos temas académicos típicos (offline)
function looksAcademic(message: string) {
  const m = stripDiacritics(message.toLowerCase());
  const hits = [
    "mena",
    "ganga",
    "payable",
    "pagable",
    "recuperacion",
    "recovery",
    "sulfuro",
    "sulfuros",
    "oxido",
    "oxidos",
    "concentrado",
    "flotacion",
    "lixiviacion",
    "penalidad",
    "impureza",
    "impurezas",
  ];
  return hits.some((k) => m.includes(k));
}

function buildAssistantPrompt(input: {
  userMessage: string;
  pageContext: string;
  mode: AssistantMode;
}): string {
  const { userMessage, pageContext, mode } = input;

  const modeRules =
    mode === "academic"
      ? [
          "Modo ACADÉMICO (permitido): responde sobre mineralogía aplicada al análisis del app (mena/ganga, sulfuros/óxidos, payable/recuperación, concentración, impurezas, etc.).",
          "No hables de política, salud, derecho, apuestas, ni temas ajenos.",
          "Mantén respuesta breve, con ejemplo corto si aplica.",
        ].join("\n")
      : [
          "Modo APP: guía sobre pantallas, botones y flujo de MinQuant_WSCA (login, inicio, análisis, resultados, PDF).",
          "No te salgas del app.",
          "Usa el contexto de la página (incluye screenText si existe) para responder de forma específica y menos genérica.",
        ].join("\n");

  return `
Eres el asistente integrado de MinQuant_WSCA.
${modeRules}

Reglas:
- Responde en español, claro y práctico.
- Máximo ~10 líneas.
- Si falta info, haz 1-2 preguntas concretas.

Contexto de la página (NO inventes datos, úsalo tal cual):
${pageContext}

Pregunta del usuario:
${userMessage}

Formato de salida:
Responde EXCLUSIVAMENTE JSON válido con esta forma:
{
  "reply": "texto..."
}
No incluyas backticks ni texto fuera del JSON.
`.trim();
}

async function generateWithFallback(apiKey: string, prompt: string, history?: any[]) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const errors: string[] = [];

  // ✅ Igual que /api/analyze: lista modelos disponibles para ESTA key
  const fromApi = await listModelsForKey(apiKey);

  // ✅ candidatos = (modelos disponibles) + (fallbacks estáticos)
  const candidates = [...new Set([...fromApi, ...MODEL_FALLBACKS])];

  // construir contents (history + prompt)
  const contents: any[] = [];

  if (Array.isArray(history) && history.length) {
    for (const h of history.slice(-10)) {
      if (!h?.content || !h?.role) continue;
      const role = h.role === "assistant" ? "model" : "user";
      contents.push({ role, parts: [{ text: safeText(h.content, 1200) }] });
    }
  }

  contents.push({ role: "user", parts: [{ text: prompt }] });

  for (const modelName of candidates) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.2,
          topK: 40,
          topP: 0.6,
          // ✅ fuerza JSON (reduce parse errors)
          responseMimeType: "application/json",
        } as any,
      });

      // ✅ con retry/backoff
      const result = await genWithRetry(model, contents);
      const text = (await result.response.text()) || "";
      return { text, modelUsed: modelName };
    } catch (e: any) {
      errors.push(`${modelName}: ${String(e?.message || e)}`);
      continue;
    }
  }

  const err = new Error("Ningún modelo respondió. Intentados → " + errors.join(" | "));
  (err as any)._errors = errors;
  throw err;
}

/* ===================== Helpers para fallback “más humano” ===================== */

function getScreenText(visibleState?: Record<string, any> | null): string {
  const raw = visibleState && typeof visibleState === "object" ? (visibleState as any).screenText : "";
  return safeText(String(raw ?? ""), 3000);
}

function hasAnyScreenText(visibleState?: Record<string, any> | null): boolean {
  return !!getScreenText(visibleState).trim();
}

function buildQuickScreenClue(visibleState?: Record<string, any> | null): string {
  const st = stripDiacritics(getScreenText(visibleState).toLowerCase());
  if (!st) return "";

  if (st.includes("como usar minquant") || st.includes("cómo usar minquant") || st.includes("guia") || st.includes("guía")) {
    return "guia-uso";
  }
  if (st.includes("camara") || st.includes("cámara") || st.includes("ubicacion") || st.includes("ubicación") || st.includes("analisis") || st.includes("análisis")) {
    return "analisis";
  }
  if (st.includes("terminos") || st.includes("términos") || st.includes("condiciones")) {
    return "terminos";
  }
  if (st.includes("iniciar sesion") || st.includes("iniciar sesión") || st.includes("login")) {
    return "login";
  }
  if (st.includes("bienvenida") || st.includes("comenzar analisis") || st.includes("comenzar análisis") || st.includes("inicio")) {
    return "inicio";
  }

  return "";
}

function looksLikeHowToStart(msgNorm: string) {
  // “qué hago”, “cómo empiezo”, “cómo comenzar”
  return (
    msgNorm.includes("que hago") ||
    msgNorm.includes("qué hago") ||
    msgNorm.includes("como empiezo") ||
    msgNorm.includes("cómo empiezo") ||
    msgNorm.includes("como comienzo") ||
    msgNorm.includes("cómo comienzo") ||
    msgNorm.includes("como iniciar") ||
    msgNorm.includes("cómo iniciar") ||
    msgNorm.includes("empezar el analisis") ||
    msgNorm.includes("empezar el análisis") ||
    msgNorm.includes("comenzar el analisis") ||
    msgNorm.includes("comenzar el análisis")
  );
}

// ✅ NEW: detectar “qué hago después / siguiente paso” (para NO volver al inicio)
function looksLikeNextStep(msgNorm: string) {
  return (
    msgNorm.includes("despues") ||
    msgNorm.includes("después") ||
    msgNorm.includes("y ahora") ||
    msgNorm.includes("ahora que") ||
    msgNorm.includes("siguiente") ||
    msgNorm.includes("que sigue") ||
    msgNorm.includes("qué sigue") ||
    msgNorm.includes("continuo") ||
    msgNorm.includes("continúo")
  );
}

/**
 * Resume el estado de /analisis si viene visibleState de esa pantalla (tu assistantVisibleState).
 */
function getAnalisisState(vs?: Record<string, any> | null) {
  const v = vs && typeof vs === "object" ? (vs as any) : null;
  if (!v) return null;

  // Tu estructura actual
  const sampleCode = v.sampleCode ?? null;
  const results = v.results ?? {};
  const geo = v.geo ?? null;
  const nearby = v.nearby ?? null;

  const globalCount = Number(results?.globalCount ?? 0) || 0;
  const perImageCount = Number(results?.perImageCount ?? 0) || 0;
  const excludedCount = Number(results?.excludedCount ?? 0) || 0;

  const hasGeo = !!(geo && typeof geo.lat === "number" && typeof geo.lng === "number");
  const hasNearby = Number(nearby?.found ?? 0) > 0;
  const hasNearbySelected = Number(nearby?.selected ?? 0) > 0;

  return {
    sampleCode: sampleCode ? String(sampleCode) : null,
    globalCount,
    perImageCount,
    excludedCount,
    hasGeo,
    hasNearby,
    hasNearbySelected,
    geo,
    nearby,
  };
}

/**
 * ✅ Fallback local cuando:
 * - no hay GEMINI_API_KEY
 * - o Gemini está sin cuota (429)
 * - o falla el parse JSON
 *
 * CAMBIO IMPORTANTE:
 * - Ahora usa visibleState.screenText si existe
 * - Y usa visibleState estructurado (ej /analisis) para responder específico.
 */
function localFallbackReply(input: {
  mode: AssistantMode;
  message: string;
  pathname?: string | null;
  uiHints?: string[] | null;
  visibleState?: Record<string, any> | null;
}): string {
  const msg = safeText(input.message, 1200);
  const msgNorm = stripDiacritics(msg.toLowerCase());
  const p = (input.pathname || "").trim();

  // ===== Modo académico =====
  if (input.mode === "academic") {
    if (msgNorm.includes("mena") && msgNorm.includes("ganga")) {
      return (
        "MENA = mineral(es) con valor económico (p.ej. calcopirita para Cu). " +
        "GANGA = minerales acompañantes sin valor (cuarzo, calcita, etc.). " +
        "Ejemplo: en un Cu-porfídico, la mena puede ser calcopirita; la ganga, cuarzo + feldespatos."
      );
    }
    if (msgNorm.includes("payable") || msgNorm.includes("pagable")) {
      return (
        "PAYABLE (pagable) = % del metal contenido que la fundición/refinería te reconoce para pagarte. " +
        "No es lo mismo que RECUPERACIÓN: recuperación es lo que tu planta concentra; payable es lo que te pagan del concentrado. " +
        "Ejemplo: si recuperas 90% Cu, pero payable es 96%, el pago se calcula sobre ese 96% del Cu en el concentrado (menos penalidades)."
      );
    }
    if (
      msgNorm.includes("sulfuro") ||
      msgNorm.includes("sulfuros") ||
      msgNorm.includes("oxido") ||
      msgNorm.includes("oxidos")
    ) {
      return (
        "Sulfuros (p.ej. pirita, calcopirita) suelen ir mejor a flotación. " +
        "Óxidos (p.ej. malaquita, azurita) suelen ir a lixiviación/ácidos (según mineral y ganga). " +
        "Si me dices el metal (Cu/Au/Pb/Zn) te indico el proceso típico y por qué."
      );
    }

    return (
      "Modo académico (sin IA): dime el tema exacto (mena/ganga, payable/recuperación, sulfuros/óxidos, concentración, impurezas) " +
      "y 1 ejemplo (metal y tipo de mineral) para responderte preciso."
    );
  }

  // ===== Modo APP: primero intenta “leer pantalla” =====
  const screenClue = buildQuickScreenClue(input.visibleState);

  // Si por alguna razón pathname viene vacío o genérico, el screenText nos salva
  const effectivePage = p || (screenClue ? `/${screenClue}` : "");

  // ===== Respuesta específica para /analisis usando visibleState real =====
  if (effectivePage === "/analisis" || screenClue === "analisis") {
    const st = getAnalisisState(input.visibleState);

    // ✅ FIX CLAVE:
    // Si ya hay resultados y el usuario pregunta “después / siguiente”, NO volver a “comenzar”.
    if (st && st.globalCount > 0 && looksLikeNextStep(msgNorm)) {
      const extras: string[] = [];

      if (st.hasGeo && !st.hasNearby) extras.push("Si quieres contexto, toca “Buscar yacimientos cercanos”.");
      if (st.hasNearby) {
        if (st.hasNearbySelected) extras.push(`Tienes ${st.nearby?.selected} yacimientos incluidos (perfecto).`);
        else extras.push("Tienes yacimientos encontrados: usa “Incluir” en los que quieras meter al PDF.");
      }
      if (st.excludedCount > 0) extras.push(`Hay ${st.excludedCount} imágenes excluidas: revisa si alguna salió movida/oscura.`);

      return (
        `Listo. Ya analizaste ${st.sampleCode || "la muestra"} y hay ${st.globalCount} minerales en la mezcla global. ` +
        "Siguiente paso: 1) Revisa “Mezcla global” y “Por imagen”. 2) Ajusta recovery/payable y precios si aplica. " +
        "3) Genera “PDF general”. " +
        (extras.length ? extras.join(" ") : "")
      );
    }

    // Si el usuario pregunta “¿qué hago para comenzar?” -> decidir siguiente paso con estado real
    if (looksLikeHowToStart(msgNorm)) {
      if (st && !st.hasGeo) {
        return (
          "Para comenzar en /analisis: 1) Toma/Sube fotos (hasta 6). 2) (Recomendado) Pulsa “Obtener ubicación (GPS)”. " +
          "3) Presiona “Analizar”. Luego verás la Mezcla global y Resultados por imagen."
        );
      }

      return (
        "Para comenzar en /analisis: 1) Toma/Sube fotos (hasta 6). 2) Presiona “Analizar”. " +
        "3) (Opcional) “Buscar yacimientos cercanos”. 4) “PDF general” cuando estés conforme."
      );
    }

    // Si ya analizó (globalCount > 0), guía al siguiente paso real
    if (st && st.globalCount > 0) {
      const extras: string[] = [];

      if (st.hasGeo && !st.hasNearby) extras.push("Luego puedes tocar “Buscar yacimientos cercanos”.");
      if (st.hasNearby) {
        if (st.hasNearbySelected) extras.push(`Tienes ${st.nearby?.selected} yacimientos “Incluidos” (bien).`);
        else extras.push("Tienes yacimientos encontrados: usa “Incluir” en los que quieras meter al PDF.");
      }

      if (st.excludedCount > 0) extras.push(`Hay ${st.excludedCount} imágenes excluidas: revisa si alguna salió movida/oscura.`);

      return (
        `Ya tienes resultados para ${st.sampleCode || "la muestra"}. ` +
        "Siguiente paso: 1) Revisa “Mezcla global” y “Por imagen”. 2) Ajusta recovery/payable y precios si aplica. " +
        "3) Genera “PDF general”. " +
        (extras.length ? extras.join(" ") : "")
      );
    }

    // Si aún NO analizó
    return (
      "Estás en /analisis. Para avanzar: 1) Toma/Sube fotos (hasta 6). 2) Presiona “Analizar”. " +
      "Si quieres contexto geológico y yacimientos, primero obtén ubicación (GPS)."
    );
  }

  // ===== Login =====
  if (effectivePage === "/login" || screenClue === "login") {
    return (
      "Estás en Login. 1) Escribe tu ID (ej: U001). 2) Escribe tu contraseña. " +
      "3) Presiona “Iniciar sesión”. Si sale error, revisa ID/clave o copia aquí el mensaje exacto."
    );
  }

  // ===== Inicio =====
  if (effectivePage === "/" || effectivePage === "/inicio" || screenClue === "inicio") {
    return (
      "Estás en Inicio. Opciones típicas: 1) “Comenzar análisis” → /analisis. " +
      "2) “Cómo usar MinQuant_WSCA” → /guia-uso. 3) “Términos y condiciones” → /terminos."
    );
  }

  // ===== Términos =====
  if (effectivePage === "/terminos" || screenClue === "terminos") {
    return "Estás en Términos y condiciones. Baja para leer todo y vuelve a Inicio con el botón de navegación.";
  }

  // ===== Guía de uso =====
  if (effectivePage === "/guia-uso" || screenClue === "guia-uso") {
    if (looksLikeHowToStart(msgNorm) || msgNorm.includes("comenzar el analisis") || msgNorm.includes("comenzar el análisis")) {
      return (
        "Estás en la Guía. Para empezar a usar la app de verdad: 1) Pulsa “← Volver a inicio”. " +
        "2) En Inicio, toca “Comenzar análisis”. 3) En /analisis: toma/sube fotos → (opcional) GPS → “Analizar” → “PDF general”."
      );
    }

    return "Estás en la Guía de uso. Si me dices qué parte quieres (cámara, GPS, yacimientos, PDF), te lo explico en 3 pasos.";
  }

  // ===== Default =====
  const hints =
    Array.isArray(input.uiHints) && input.uiHints.length ? `Veo opciones: ${input.uiHints.join(" | ")}. ` : "";

  if (hasAnyScreenText(input.visibleState)) {
    return (
      "Ahora mismo la IA no está disponible, pero sí puedo guiarte según lo que se ve en tu pantalla. " +
      hints +
      "Dime: 1) ¿qué quieres lograr ahora? (analizar / buscar yacimientos / PDF / login) y 2) si ves algún mensaje de error."
    );
  }

  return (
    "Ahora mismo la IA no está disponible, pero te guío igual dentro de MinQuant_WSCA. " +
    hints +
    "Dime qué pantalla estás viendo (Login/Inicio/Análisis/Guía) y qué botón o mensaje tienes al frente."
  );
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AssistantRequest;

    const message = safeText(body?.message, 2000);
    const modeReceived = body?.mode;

    // ✅ 1) Normaliza mode
    let mode: AssistantMode = normalizeMode(modeReceived);

    const pathname = body?.pathname ?? null;
    const uiHints = Array.isArray(body?.uiHints) ? body.uiHints : null;
    const visibleState = body?.visibleState && typeof body.visibleState === "object" ? body.visibleState : null;
    const history = Array.isArray(body?.history) ? body.history : null;

    // ✅ 2) Heurística offline: si el mode vino "app" pero la pregunta es académica -> fuerza academic
    if (mode === "app" && looksAcademic(message)) {
      mode = "academic";
    }

    // 1) Guardrails
    const scope = guardrailsCheck(message, { pathname, uiHints, visibleState, mode });

    if (!scope.ok) {
      const out: AssistantResponse = {
        ok: true,
        outOfScope: true,
        reason: scope.reason,
        reply: scope.refusalText,
        debug: {
          via: "fallback",
          modeReceived,
          modeResolved: mode,
          pathname,
        },
      };
      return NextResponse.json(out);
    }

    // 2) Sin API key => fallback local
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      const out: AssistantResponse = {
        ok: true,
        outOfScope: false,
        reason: "missing_api_key",
        reply: localFallbackReply({ mode, message, pathname, uiHints, visibleState }),
        debug: {
          via: "fallback",
          modeReceived,
          modeResolved: mode,
          pathname,
        },
      };
      return NextResponse.json(out);
    }

    // 3) Contexto de página
    const pageContextRaw = buildPageContext({ pathname, uiHints, visibleState });
// ✅ baja el tamaño del contexto para evitar 429 por tokens/minuto
const pageContext = safeText(pageContextRaw, 1800);

const prompt = buildAssistantPrompt({ userMessage: message, pageContext, mode });

    // 5) Gemini con fallback
    try {
      const { text, modelUsed } = await generateWithFallback(apiKey, prompt, history);

      const parsed = extractJsonObject(text);
      const reply = safeText(parsed?.reply ?? "", 2500);

      if (!reply) {
        const out: AssistantResponse = {
          ok: true,
          outOfScope: false,
          reason: "parse_error",
          reply: localFallbackReply({ mode, message, pathname, uiHints, visibleState }),
          debug: {
            modelUsed,
            via: "fallback",
            modeReceived,
            modeResolved: mode,
            pathname,
          },
        };
        return NextResponse.json(out);
      }

      const out: AssistantResponse = {
        ok: true,
        outOfScope: false,
        reply,
        debug:
          process.env.NODE_ENV !== "production"
            ? {
                modelUsed,
                via: "gemini",
                modeReceived,
                modeResolved: mode,
                pathname,
              }
            : undefined,
      };
      return NextResponse.json(out);
       } catch (err: any) {
      const quota = isQuota429(err) || !!(err as any)?._quota429;

      const offline = localFallbackReply({ mode, message, pathname, uiHints, visibleState });

      const prefix = quota
        ? "⚠️ Gemini está sin cuota (429 / límite 0). Activé modo OFFLINE para responder igual.\n\n"
        : "⚠️ Gemini falló. Activé modo OFFLINE para responder igual.\n\n";

      const out: AssistantResponse = {
        ok: true,
        outOfScope: false,
        reason: quota ? "gemini_quota_429" : "gemini_error",
        reply: prefix + offline,
        debug: {
          via: "fallback",
          modeReceived,
          modeResolved: mode,
          pathname,
          // ✅ útil en DEV para ver por qué falló
          ...(process.env.NODE_ENV !== "production"
            ? { modelUsed: undefined, errors: (err as any)?._errors }
            : {}),
        } as any,
      };

      console.error("[/api/assistant] Error Gemini:", err);
      return NextResponse.json(out);
    }

  } catch (e: any) {
    console.error("[/api/assistant] Error:", e);
    const out: AssistantResponse = {
      ok: true,
      outOfScope: false,
      reason: "server_error",
      reply:
        "Tuve un error interno, pero te ayudo igual dentro de MinQuant_WSCA. " +
        "Dime qué pantalla estás viendo (Login/Inicio/Análisis/Guía) y qué quieres hacer.",
      debug: { via: "fallback" },
    };
    return NextResponse.json(out);
  }
}
