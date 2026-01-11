"use client";

import React from "react";
import { usePathname } from "next/navigation";
import LightAvatar from "./LightAvatar";
import { useVoice } from "./useVoice";

type ChatMsg = { role: "user" | "assistant"; content: string };
type AssistantMode = "app" | "academic";

type AssistantDockProps = {
  visibleState?: Record<string, any> | null;
  uiHints?: string[];
  compact?: boolean;
};

type ApiAssistantResponse = {
  ok: boolean;
  outOfScope: boolean;
  reason?: string;
  reply: string;
  debug?: { modelUsed?: string; via?: string; modeResolved?: string; pathname?: string | null };
};

const LS_ENABLED = "mq_assistant_enabled_v1";
const LS_TTS = "mq_assistant_tts_v1";
const LS_OPEN = "mq_assistant_open_v1";
const LS_MODE = "mq_assistant_mode_v1"; // "app" | "academic"

function safeTrim(s: string) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function clampHistory(arr: ChatMsg[], max = 8) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(-max);
}

// ✅ Captura texto visible de la pantalla para que el backend “lea” la app (fallback)
function readScreenText(maxChars = 2800): string {
  try {
    if (typeof window === "undefined" || typeof document === "undefined") return "";
    const main = document.querySelector("main");
    const src = main ? (main as HTMLElement).innerText : document.body?.innerText || "";
    const cleaned = safeTrim(src);
    if (!cleaned) return "";
    return cleaned.length > maxChars ? cleaned.slice(0, maxChars) + "…(recortado)" : cleaned;
  } catch {
    return "";
  }
}

// ✅ Si /analisis ya manda screenText “inteligente”, úsalo primero
function pickBestScreenText(
  fromVisibleState: any,
  fromDomCapture: string
): string {
  const vsText = safeTrim(fromVisibleState?.screenText || "");
  if (vsText) return vsText;
  return safeTrim(fromDomCapture || "");
}

export default function AssistantDock({
  visibleState = null,
  uiHints,
  compact = false,
}: AssistantDockProps) {
  const pathname = usePathname();

  const [enabled, setEnabled] = React.useState<boolean>(true);
  const [open, setOpen] = React.useState<boolean>(true);
  const [ttsOn, setTtsOn] = React.useState<boolean>(false);

  const [mode, setMode] = React.useState<AssistantMode>("app");

  const [input, setInput] = React.useState<string>("");
  const [busy, setBusy] = React.useState<boolean>(false);

  const [messages, setMessages] = React.useState<ChatMsg[]>([
    {
      role: "assistant",
      content:
        "Hola. Soy tu asistente de MinQuant_WSCA. Puedo ayudarte a usar la app, interpretar resultados y entender el PDF.",
    },
  ]);

  // ✅ Ref para auto-scroll al final
  const endRef = React.useRef<HTMLDivElement | null>(null);

  // ✅ Ref para evitar “stale state” al construir history
  const messagesRef = React.useRef<ChatMsg[]>(messages);
  React.useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // ✅ Texto visible capturado (fallback DOM)
  const [screenTextDom, setScreenTextDom] = React.useState<string>("");

  // --- Voz (STT/TTS)
  const voice = useVoice({
    lang: "es-PE",
    interimResults: true,
    continuous: false,
  });

  // Cargar prefs de localStorage
  React.useEffect(() => {
    try {
      const e = localStorage.getItem(LS_ENABLED);
      const o = localStorage.getItem(LS_OPEN);
      const t = localStorage.getItem(LS_TTS);
      const m = localStorage.getItem(LS_MODE);

      if (e != null) setEnabled(e === "1");
      if (o != null) setOpen(o === "1");
      if (t != null) setTtsOn(t === "1");
      if (m === "academic" || m === "app") setMode(m);
    } catch {}
  }, []);

  // Persistir prefs
  React.useEffect(() => {
    try {
      localStorage.setItem(LS_ENABLED, enabled ? "1" : "0");
    } catch {}
  }, [enabled]);

  React.useEffect(() => {
    try {
      localStorage.setItem(LS_OPEN, open ? "1" : "0");
    } catch {}
  }, [open]);

  React.useEffect(() => {
    try {
      localStorage.setItem(LS_TTS, ttsOn ? "1" : "0");
    } catch {}
  }, [ttsOn]);

  React.useEffect(() => {
    try {
      localStorage.setItem(LS_MODE, mode);
    } catch {}
  }, [mode]);

  // ✅ Capturar screenText DOM cuando:
  // - cambia la ruta
  // - se abre el dock
  // - se habilita el asistente
  React.useEffect(() => {
    if (!enabled) {
      setScreenTextDom("");
      return;
    }
    if (!open) return;

    const t = window.setTimeout(() => {
      setScreenTextDom(readScreenText(2800));
    }, 120);

    return () => window.clearTimeout(t);
  }, [pathname, open, enabled]);

  // ✅ NUEVO: re-captura cuando cambia visibleState (ej: después de Analizar/GPS/nearby)
  // Esto es CLAVE para que el asistente sepa en qué etapa estás.
  React.useEffect(() => {
    if (!enabled || !open) return;

    const t = window.setTimeout(() => {
      setScreenTextDom(readScreenText(2800));
    }, 120);

    return () => window.clearTimeout(t);
  }, [
    enabled,
    open,
    // “firma” mínima para detectar cambios sin hacer stringify gigante
    visibleState?.results?.globalCount,
    visibleState?.results?.perImageCount,
    visibleState?.results?.excludedCount,
    visibleState?.ui?.photosCount,
    visibleState?.ui?.hasGeo,
    visibleState?.ui?.hasResults,
    visibleState?.nearby?.found,
    visibleState?.nearby?.selected,
    visibleState?.stepHint,
    visibleState?.sampleCode,
  ]);

  // Si llega transcript (STT), lo volcamos al input (sin auto-enviar)
  React.useEffect(() => {
    const t = safeTrim(voice.state.lastTranscript);
    if (!t) return;
    setInput(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.state.lastTranscript]);

  // Si deshabilitan el asistente, paramos todo
  React.useEffect(() => {
    if (!enabled) {
      try {
        voice.stopListening();
        voice.cancelSpeak();
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // ✅ Auto-scroll cuando cambian los mensajes o cuando entra busy
  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function sendMessage(raw: string) {
    const text = safeTrim(raw);
    if (!text) return;

    if (!enabled) {
      setMessages((prev) =>
        prev.concat({
          role: "assistant",
          content:
            "El asistente está en OFF. Actívalo para que pueda responder dentro de MinQuant_WSCA.",
        })
      );
      return;
    }

    setBusy(true);

    // 1) Añadimos el mensaje del usuario
    setMessages((prev) => prev.concat({ role: "user", content: text }));

    try {
      // ✅ history consistente
      const base = messagesRef.current || [];
      const history = clampHistory([...base, { role: "user", content: text }], 8);

      // ✅ Prioriza screenText del /analisis/page.tsx (visibleState.screenText)
      const finalScreenText = pickBestScreenText(visibleState, screenTextDom);

      // ✅ Construir visibleState FINAL
      const mergedVisibleState = {
        ...(visibleState ?? {}),
        // info de pantalla
        pathname: pathname || null,
        // usamos el mejor screenText (no pisamos el del page si existe)
        screenText: finalScreenText,
        // además enviamos el DOM capturado por si quieres depurar
        screenTextDom: safeTrim(screenTextDom || ""),
      };

      const body = {
        message: text,
        mode,
        pathname: pathname || null,
        uiHints: uiHints ?? null,
        visibleState: mergedVisibleState,
        history,
      };

      const resp = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await resp.json().catch(() => null)) as ApiAssistantResponse | null;

      if (!resp.ok || !data?.reply) {
        setMessages((prev) =>
          prev.concat({
            role: "assistant",
            content:
              "Ahora mismo la IA no está disponible. " +
              "Puedo ayudarte igual: dime qué botón ves en pantalla o qué acción quieres realizar.",
          })
        );
        return;
      }

      const reply = safeTrim(data.reply);
      setMessages((prev) => prev.concat({ role: "assistant", content: reply }));

      if (ttsOn && voice.state.ttsSupported) {
        voice.speak(reply);
      }
    } catch (e: any) {
      setMessages((prev) =>
        prev.concat({
          role: "assistant",
          content:
            "Tuve un error al responder. Intenta de nuevo o describe qué estás viendo en la pantalla.",
        })
      );
      console.error("[AssistantDock] error:", e);
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const text = input;
    setInput("");
    sendMessage(text);
  }

  const canUseMic = enabled && voice.state.sttSupported;
  const canUseTts = enabled && voice.state.ttsSupported;

  const dockWidth = compact ? "w-[320px]" : "w-[360px]";
  const dockMaxH = compact ? "max-h-[420px]" : "max-h-[520px]";
  const bodyMaxH = compact ? 260 : 320;

  const modeLabel = mode === "academic" ? "Académico" : "APP";

  // ✅ mejor indicador: si el page.tsx ya manda screenText, cuenta como OK
  const hasScreenText = !!safeTrim(visibleState?.screenText || "") || !!safeTrim(screenTextDom);

  return (
    <div className="fixed right-4 bottom-4 z-[9999]">
      {/* Toggle bar */}
      <div className="flex items-center justify-end gap-2 mb-2">
        <button
          type="button"
          onClick={() => setEnabled((v) => !v)}
          className={[
            "px-3 py-1 rounded-full text-xs border shadow-sm",
            enabled
              ? "bg-emerald-600 text-white border-emerald-700"
              : "bg-gray-200 text-gray-700 border-gray-300",
          ].join(" ")}
          title="ON/OFF del asistente (OFF = sin IA, sin micrófono)"
        >
          {enabled ? "Asistente: ON" : "Asistente: OFF"}
        </button>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="px-3 py-1 rounded-full text-xs border bg-white shadow-sm"
          title={open ? "Minimizar" : "Abrir"}
        >
          {open ? "Minimizar" : "Abrir"}
        </button>
      </div>

      {/* Panel */}
      {open && (
        <div
          className={[
            dockWidth,
            dockMaxH,
            "rounded-2xl shadow-xl border bg-white overflow-hidden",
            "flex flex-col",
          ].join(" ")}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-3 py-3 border-b bg-gradient-to-r from-cyan-600 to-emerald-600 text-white">
            <div className="shrink-0">
              <LightAvatar
                size={56}
                paused={!enabled}
                energy={enabled ? (busy ? 0.95 : 0.65) : 0}
              />
            </div>

            <div className="min-w-0">
              <div className="text-sm font-semibold leading-tight">
                Asistente MinQuant_WSCA
              </div>

              <div className="text-[11px] opacity-90 truncate">
                {pathname ? `Página: ${pathname}` : "Página: (sin ruta)"}
              </div>

              <div className="text-[11px] opacity-95">
                Modo: <b>{modeLabel}</b>{" "}
                <span className="opacity-90">
                  · Lectura pantalla: <b>{enabled ? (hasScreenText ? "OK" : "…") : "OFF"}</b>
                </span>
              </div>

              {!enabled && (
                <div className="text-[11px] opacity-95">OFF: no IA, no micrófono.</div>
              )}
            </div>
          </div>

          {/* Body chat */}
          <div className="px-3 py-3 overflow-y-auto flex-1" style={{ maxHeight: bodyMaxH }}>
            <div className="space-y-2">
              {messages.map((m, idx) => {
                const isUser = m.role === "user";
                return (
                  <div
                    key={idx}
                    className={["flex", isUser ? "justify-end" : "justify-start"].join(" ")}
                  >
                    <div
                      className={[
                        "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-snug",
                        isUser ? "bg-sky-600 text-white" : "bg-gray-100 text-gray-900",
                      ].join(" ")}
                    >
                      {m.content}
                    </div>
                  </div>
                );
              })}

              {busy && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 text-gray-700 rounded-2xl px-3 py-2 text-sm">
                    Pensando…
                  </div>
                </div>
              )}

              <div ref={endRef} />
            </div>

            {voice.state.lastError && (
              <div className="mt-3 text-xs text-red-600">
                Voz: {voice.state.lastError}{" "}
                <button type="button" className="underline" onClick={() => voice.clearError()}>
                  ok
                </button>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t px-3 py-3 bg-white shrink-0">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-full overflow-hidden border bg-white">
                  <button
                    type="button"
                    disabled={!enabled || busy}
                    onClick={() => {
                      setMode("app");
                      setMessages((prev) =>
                        prev.concat({
                          role: "assistant",
                          content: "✅ Modo cambiado a APP (ayuda dentro de la app).",
                        })
                      );
                    }}
                    className={[
                      "px-3 py-1 text-xs",
                      mode === "app" ? "bg-emerald-600 text-white" : "bg-white text-gray-700",
                      !enabled || busy ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50",
                    ].join(" ")}
                    title="Modo APP"
                  >
                    APP
                  </button>

                  <button
                    type="button"
                    disabled={!enabled || busy}
                    onClick={() => {
                      setMode("academic");
                      setMessages((prev) =>
                        prev.concat({
                          role: "assistant",
                          content:
                            "✅ Modo cambiado a ACADÉMICO (mineralogía aplicada: mena/ganga, sulfuros/óxidos, payable, etc.).",
                        })
                      );
                    }}
                    className={[
                      "px-3 py-1 text-xs",
                      mode === "academic" ? "bg-sky-600 text-white" : "bg-white text-gray-700",
                      !enabled || busy ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50",
                    ].join(" ")}
                    title="Modo Académico"
                  >
                    ACADÉMICO
                  </button>
                </div>

                <button
                  type="button"
                  disabled={!enabled || busy}
                  onClick={() => {
                    try {
                      localStorage.removeItem(LS_MODE);
                    } catch {}
                    setMode("app");
                    setMessages((prev) =>
                      prev.concat({
                        role: "assistant",
                        content: "🔄 Reset: modo APP activado (y se borró el modo guardado).",
                      })
                    );
                  }}
                  className={[
                    "px-3 py-1 rounded-full text-xs border",
                    !enabled || busy ? "bg-gray-100 text-gray-400" : "bg-white hover:bg-gray-50",
                  ].join(" ")}
                  title="Borra el modo guardado y vuelve a APP"
                >
                  Reset a APP
                </button>
              </div>

              <label className="flex items-center gap-2 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={ttsOn}
                  disabled={!canUseTts}
                  onChange={(e) => setTtsOn(e.target.checked)}
                />
                Responder con voz
              </label>
            </div>

            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!canUseMic || busy}
                  onClick={() => {
                    if (!canUseMic) return;
                    if (voice.state.listening) voice.stopListening();
                    else voice.startListening();
                  }}
                  className={[
                    "px-3 py-1 rounded-full text-xs border",
                    canUseMic && !busy ? "bg-white hover:bg-gray-50" : "bg-gray-100 text-gray-400",
                  ].join(" ")}
                  title={voice.state.sttSupported ? "Micrófono (STT)" : "STT no soportado"}
                >
                  {voice.state.listening ? "🎙️ Escuchando…" : "🎙️ Hablar"}
                </button>

                <button
                  type="button"
                  disabled={!enabled || !voice.state.speaking}
                  onClick={() => voice.cancelSpeak()}
                  className={[
                    "px-3 py-1 rounded-full text-xs border",
                    enabled && voice.state.speaking ? "bg-white hover:bg-gray-50" : "bg-gray-100 text-gray-400",
                  ].join(" ")}
                  title="Detener voz"
                >
                  🔇 Stop
                </button>
              </div>
            </div>

            <form onSubmit={onSubmit} className="flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  enabled
                    ? mode === "academic"
                      ? "Pregunta académica (mineralogía) o del app…"
                      : "Pregunta sobre MinQuant_WSCA…"
                    : "Asistente en OFF…"
                }
                disabled={!enabled || busy}
                className="flex-1 border rounded-xl px-3 py-2 text-sm disabled:bg-gray-100"
              />

              <button
                type="submit"
                disabled={!enabled || busy || !safeTrim(input)}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm disabled:opacity-50"
              >
                Enviar
              </button>
            </form>

            <div className="mt-2 text-[11px] text-gray-500">
              {mode === "academic"
                ? "Modo académico: mineralogía y conceptos técnicos (sin salir del dominio MinQuant)."
                : "Modo APP: ayuda sobre pantallas, botones, resultados y PDF de MinQuant_WSCA."}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
