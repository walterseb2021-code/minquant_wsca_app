// app/api/assistant/route.ts
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  guardrailsCheck,
  buildPageContext,
  type AssistantScopeResult,
} from "@/lib/assistant/guardrails";

export const runtime = "nodejs";
export const maxDuration = 60;

// Modelos fallback (rápidos y baratos primero)
const MODEL_FALLBACKS = [
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-2.5-pro",
  "gemini-1.5-pro",
] as const;

type AssistantRequest = {
  message: string;
  pathname?: string | null;
  uiHints?: string[] | null;

  /**
   * Resumen opcional del estado visible en UI.
   * OJO: no mandes binarios/base64; solo texto y números.
   */
  visibleState?: Record<string, any> | null;

  /**
   * Historial breve opcional, para continuidad en chat
   * (no más de 6-10 mensajes ideal).
   */
  history?: { role: "user" | "assistant"; content: string }[] | null;
};

type AssistantResponse = {
  ok: boolean;
  outOfScope: boolean;
  reason?: string;
  reply: string;
  debug?: {
    modelUsed?: string;
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

function buildAssistantPrompt(input: {
  userMessage: string;
  pageContext: string;
}): string {
  const { userMessage, pageContext } = input;

  return `
Eres el asistente integrado de MinQuant_WSCA. Ayudas SOLO con el uso de esta app.

Tu tarea:
- Responder en español, claro y práctico.
- Explicar pasos concretos en la pantalla actual y cómo interpretar resultados.
- Mantener respuesta breve (máx. ~10 líneas).
- Si falta información, haz 1-2 preguntas muy concretas (ej: “¿ya analizaste?” “¿qué sale en Mezcla global?”).

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

  for (const modelName of MODEL_FALLBACKS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.2,
          topK: 40,
          topP: 0.6,
          // Queremos JSON pero no nos amarramos a responseMimeType (a veces falla según modelo)
        } as any,
      });

      const contents: any[] = [];

      // Historial mínimo (si viene)
      if (Array.isArray(history) && history.length) {
        for (const h of history.slice(-10)) {
          if (!h?.content || !h?.role) continue;
          const role = h.role === "assistant" ? "model" : "user";
          contents.push({ role, parts: [{ text: safeText(h.content, 1200) }] });
        }
      }

      // Prompt actual como user
      contents.push({ role: "user", parts: [{ text: prompt }] });

      const result = await model.generateContent({ contents });
      const text = (await result.response.text()) || "";
      return { text, modelUsed: modelName };
    } catch (e: any) {
      errors.push(`${modelName}: ${String(e?.message || e)}`);
      continue;
    }
  }

  throw new Error("Ningún modelo respondió. Intentados → " + errors.join(" | "));
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AssistantRequest;

    const message = safeText(body?.message, 2000);
    const pathname = body?.pathname ?? null;
    const uiHints = Array.isArray(body?.uiHints) ? body.uiHints : null;
    const visibleState =
      body?.visibleState && typeof body.visibleState === "object" ? body.visibleState : null;
    const history = Array.isArray(body?.history) ? body.history : null;

    // 1) Guardrails (dominio)
    const scope: AssistantScopeResult = guardrailsCheck(message);

    if (!scope.ok) {
      const out: AssistantResponse = {
        ok: true,
        outOfScope: true,
        reason: scope.reason,
        reply: scope.refusalText,
      };
      return NextResponse.json(out);
    }

    // 2) Si no hay key, responder “asistente no disponible” (pero manteniendo guardrails)
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      const out: AssistantResponse = {
        ok: true,
        outOfScope: false,
        reason: "missing_api_key",
        reply:
          "El asistente IA no está disponible en este momento (falta configuración). " +
          "Aun así puedo ayudarte: dime qué estás viendo en pantalla (por ejemplo, si ya tienes “Mezcla global” o si aún no analizaste).",
      };
      return NextResponse.json(out);
    }

    // 3) Contexto de página (ruta + estado visible)
    const pageContext = buildPageContext({
      pathname,
      uiHints,
      visibleState,
    });

    // 4) Prompt final
    const prompt = buildAssistantPrompt({
      userMessage: message,
      pageContext,
    });

    // 5) Llamar Gemini con fallback
    const { text, modelUsed } = await generateWithFallback(apiKey, prompt, history);

    // 6) Parsear JSON
    const parsed = extractJsonObject(text);
    const reply = safeText(parsed?.reply ?? "", 2500);

    if (!reply) {
      // Fallback seguro: no romper UI
      const out: AssistantResponse = {
        ok: true,
        outOfScope: false,
        reason: "parse_error",
        reply:
          "Tuve un problema generando la respuesta. " +
          "Dime en qué pantalla estás y qué paso quieres hacer (analizar fotos / interpretar / PDF).",
        debug: { modelUsed },
      };
      return NextResponse.json(out);
    }

    const out: AssistantResponse = {
      ok: true,
      outOfScope: false,
      reply,
      debug: process.env.NODE_ENV !== "production" ? { modelUsed } : undefined,
    };

    return NextResponse.json(out);
  } catch (e: any) {
    console.error("[/api/assistant] Error:", e);
    return NextResponse.json(
      { ok: false, outOfScope: false, reply: "Error procesando el asistente." },
      { status: 500 }
    );
  }
}
