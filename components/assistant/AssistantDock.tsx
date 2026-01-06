// components/assistant/AssistantDock.tsx
"use client";

import React from "react";
import { usePathname } from "next/navigation";
import LightAvatar from "./LightAvatar";
import { useVoice } from "./useVoice";

type ChatMsg = { role: "user" | "assistant"; content: string };

type AssistantDockProps = {
  /**
   * Si quieres pasar “contexto visible” desde una página específica (opcional),
   * puedes renderizar <AssistantDock visibleState={...} />
   *
   * Si NO lo pasas, igual funciona solo con pathname.
   */
  visibleState?: Record<string, any> | null;

  /**
   * Hints opcionales (ej: labels de UI) para ayudar a explicar mejor.
   */
  uiHints?: string[];

  /**
   * Render en modo compacto (opcional).
   */
  compact?: boolean;
};

type ApiAssistantResponse = {
  ok: boolean;
  outOfScope: boolean;
  reason?: string;
  reply: string;
  debug?: { modelUsed?: string };
};

const LS_ENABLED = "mq_assistant_enabled_v1";
const LS_TTS = "mq_assistant_tts_v1";
const LS_OPEN = "mq_assistant_open_v1";

function safeTrim(s: string) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function clampHistory(arr: ChatMsg[], max = 8) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(-max);
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

  const [input, setInput] = React.useState<string>("");
  const [busy, setBusy] = React.useState<boolean>(false);

  const [messages, setMessages] = React.useState<ChatMsg[]>([
    {
      role: "assistant",
      content:
        "Hola. Soy tu asistente de MinQuant_WSCA. Puedo ayudarte a usar la app, interpretar resultados y entender el PDF.",
    },
  ]);

  // --- Voz (STT/TTS) (solo si enabled)
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

      if (e != null) setEnabled(e === "1");
      if (o != null) setOpen(o === "1");
      if (t != null) setTtsOn(t === "1");
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

    // 1) Agregar mensaje usuario
    setMessages((prev) => prev.concat({ role: "user", content: text }));

    try {
      const history = clampHistory(
        // ojo: aquí todavía no está el setMessages aplicado; armamos manualmente
        [...messages, { role: "user", content: text }],
        8
      );

      const body = {
        message: text,
        pathname: pathname || null,
        uiHints: uiHints ?? null,
        visibleState: visibleState ?? null,
        history,
      };

      const resp = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await resp.json()) as ApiAssistantResponse;

      if (!resp.ok || !data?.reply) {
        throw new Error("Respuesta inválida del asistente.");
      }

      const reply = safeTrim(data.reply);

      setMessages((prev) => prev.concat({ role: "assistant", content: reply }));

      // TTS opcional
      if (ttsOn && voice.state.ttsSupported) {
        // Solo si NO está out of scope? Igual puede hablar, pero lo dejamos simple:
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

  // UI sizes
  const dockWidth = compact ? "w-[320px]" : "w-[360px]";
  const dockMaxH = compact ? "max-h-[420px]" : "max-h-[520px]";

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

              {!enabled && (
                <div className="text-[11px] opacity-95">
                  OFF: no IA, no micrófono.
                </div>
              )}
            </div>
          </div>

          {/* Body chat */}
          <div className="px-3 py-3 overflow-y-auto" style={{ maxHeight: compact ? 260 : 320 }}>
            <div className="space-y-2">
              {messages.map((m, idx) => {
                const isUser = m.role === "user";
                return (
                  <div
                    key={idx}
                    className={[
                      "flex",
                      isUser ? "justify-end" : "justify-start",
                    ].join(" ")}
                  >
                    <div
                      className={[
                        "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-snug",
                        isUser
                          ? "bg-sky-600 text-white"
                          : "bg-gray-100 text-gray-900",
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
            </div>

            {/* Errors voz */}
            {voice.state.lastError && (
              <div className="mt-3 text-xs text-red-600">
                Voz: {voice.state.lastError}{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => voice.clearError()}
                >
                  ok
                </button>
              </div>
            )}
          </div>

          {/* Footer controls */}
          <div className="border-t px-3 py-3 bg-white">
            {/* Voice toggles row */}
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
                    canUseMic && !busy
                      ? "bg-white hover:bg-gray-50"
                      : "bg-gray-100 text-gray-400",
                  ].join(" ")}
                  title={
                    voice.state.sttSupported
                      ? "Micrófono (STT)"
                      : "STT no soportado"
                  }
                >
                  {voice.state.listening ? "🎙️ Escuchando…" : "🎙️ Hablar"}
                </button>

                <button
                  type="button"
                  disabled={!enabled || !voice.state.speaking}
                  onClick={() => voice.cancelSpeak()}
                  className={[
                    "px-3 py-1 rounded-full text-xs border",
                    enabled && voice.state.speaking
                      ? "bg-white hover:bg-gray-50"
                      : "bg-gray-100 text-gray-400",
                  ].join(" ")}
                  title="Detener voz"
                >
                  🔇 Stop
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

            {/* Input */}
            <form onSubmit={onSubmit} className="flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  enabled
                    ? "Pregunta sobre MinQuant_WSCA…"
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
              Este asistente responde solo sobre el uso de MinQuant_WSCA.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
