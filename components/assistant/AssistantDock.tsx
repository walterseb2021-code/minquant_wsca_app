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
  debug?: { modelUsed?: string };
};

const LS_ENABLED = "mq_assistant_enabled_v1";
const LS_TTS = "mq_assistant_tts_v1";
const LS_OPEN = "mq_assistant_open_v1";
const LS_MODE = "mq_assistant_mode_v1"; // "app" | "academic"
const LS_POS = "mq_assistant_pos_v1"; // {"x":number,"y":number}
const LS_MINI = "mq_assistant_mini_v1";

type DockPos = { x: number; y: number };

function safeTrim(s: string) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function getDefaultPos(): DockPos {
  // esquina inferior derecha por defecto (burbuja ~72px, margen 16)
  if (typeof window === "undefined") return { x: 16, y: 16 };
  const w = window.innerWidth || 360;
  const h = window.innerHeight || 640;
  return { x: Math.max(16, w - 16 - 72), y: Math.max(16, h - 16 - 72) };
}

function readSavedPos(): DockPos | null {
  try {
    const raw = localStorage.getItem(LS_POS);
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (typeof j?.x === "number" && typeof j?.y === "number") return { x: j.x, y: j.y };
    return null;
  } catch {
    return null;
  }
}

function savePos(p: DockPos) {
  try {
    localStorage.setItem(LS_POS, JSON.stringify(p));
  } catch {}
}

function clampPos(pos: DockPos, w: number, h: number): DockPos {
  if (typeof window === "undefined") return pos;
  const margin = 8;
  const maxX = Math.max(margin, window.innerWidth - w - margin);
  const maxY = Math.max(margin, window.innerHeight - h - margin);
  return {
    x: clamp(pos.x, margin, maxX),
    y: clamp(pos.y, margin, maxY),
  };
}

// ✅ Captura texto visible de la pantalla para que el backend “lea” la app
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

  // --- UI sizes
  const dockWidthPx = compact ? 320 : 360;
  const dockMaxHPx = compact ? 420 : 520;
  const bubbleSize = 72; // burbuja mini

  // --- Estado principal
  const [enabled, setEnabled] = React.useState<boolean>(true);
  const [open, setOpen] = React.useState<boolean>(true);
  const [mini, setMini] = React.useState<boolean>(false);
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

  // refs
  const endRef = React.useRef<HTMLDivElement | null>(null);
  const messagesRef = React.useRef<ChatMsg[]>(messages);
  React.useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const dockRef = React.useRef<HTMLDivElement | null>(null);

  // --- Texto visible capturado (para mandar al backend)
  const [screenText, setScreenText] = React.useState<string>("");

  // --- Voz (STT/TTS)
  const voice = useVoice({
    lang: "es-PE",
    interimResults: true,
    continuous: false,
  });

  // =======================
  // ✅ DRAG (Pointer events) PC + móvil
  // =======================
  const [pos, setPos] = React.useState<DockPos>(() => getDefaultPos());
  const dragRef = React.useRef<{
    active: boolean;
    pointerId: number | null;
    dx: number;
    dy: number;
    startX: number;
    startY: number;
    moved: boolean;
  }>({ active: false, pointerId: null, dx: 0, dy: 0, startX: 0, startY: 0, moved: false });

  function getCurrentSize(): { w: number; h: number } {
    // intentamos medir real, si no, aproximamos
    const rect = dockRef.current?.getBoundingClientRect();
    if (rect && rect.width && rect.height) return { w: rect.width, h: rect.height };

    // fallback por modo
    if (mini) return { w: bubbleSize, h: bubbleSize };
    if (!open) return { w: 180, h: 48 }; // botón “Abrir asistente”
    return { w: dockWidthPx, h: dockMaxHPx };
  }

  function setPosClamped(next: DockPos) {
    const { w, h } = getCurrentSize();
    const clamped = clampPos(next, w, h);
    setPos(clamped);
    savePos(clamped);
  }

  function onPointerDownDrag(e: React.PointerEvent) {
    if (!enabled) return;

    // Evita scroll/zoom mientras arrastras
    e.preventDefault();

    const el = e.currentTarget as any;

    dragRef.current.active = true;
    dragRef.current.pointerId = e.pointerId;
    dragRef.current.dx = e.clientX - pos.x;
    dragRef.current.dy = e.clientY - pos.y;
    dragRef.current.startX = e.clientX;
    dragRef.current.startY = e.clientY;
    dragRef.current.moved = false;

    // Captura el puntero (clave en móvil)
    try {
      el.setPointerCapture?.(e.pointerId);
    } catch {}

    document.body.style.userSelect = "none";
  }

  function onPointerMoveDrag(e: React.PointerEvent) {
    if (!dragRef.current.active) return;
    if (dragRef.current.pointerId !== e.pointerId) return;

    e.preventDefault();

    const dist = Math.hypot(e.clientX - dragRef.current.startX, e.clientY - dragRef.current.startY);
    if (dist > 6) dragRef.current.moved = true;

    const next = {
      x: e.clientX - dragRef.current.dx,
      y: e.clientY - dragRef.current.dy,
    };
    setPosClamped(next);
  }

  function onPointerUpDrag(e: React.PointerEvent, opts?: { miniTapToOpen?: boolean }) {
    if (!dragRef.current.active) return;
    if (dragRef.current.pointerId !== e.pointerId) return;

    e.preventDefault();

    const moved = dragRef.current.moved;

    dragRef.current.active = false;
    dragRef.current.pointerId = null;
    dragRef.current.dx = 0;
    dragRef.current.dy = 0;

    document.body.style.userSelect = "";

    // ✅ Si es mini y fue tap (NO drag), abre
    if (opts?.miniTapToOpen && !moved) {
      setMini(false);
      setOpen(true);
      window.setTimeout(() => setScreenText(readScreenText(2800)), 80);
    }
  }

  function resetPos() {
    const d = getDefaultPos();
    setPosClamped(d);
  }

  // Re-clamp al cambiar tamaño/ventana
  React.useEffect(() => {
    function onResize() {
      setPos((p) => {
        const { w, h } = getCurrentSize();
        const clamped = clampPos(p, w, h);
        savePos(clamped);
        return clamped;
      });
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mini, open, compact]);

  // =======================
  // ✅ Cargar prefs (LS)
  // =======================
  React.useEffect(() => {
    try {
      const e = localStorage.getItem(LS_ENABLED);
      const o = localStorage.getItem(LS_OPEN);
      const t = localStorage.getItem(LS_TTS);
      const m = localStorage.getItem(LS_MODE);
      const mn = localStorage.getItem(LS_MINI);

      if (e != null) setEnabled(e === "1");
      if (o != null) setOpen(o === "1");
      if (t != null) setTtsOn(t === "1");
      if (m === "academic" || m === "app") setMode(m);
      if (mn != null) setMini(mn === "1");

      const savedPos = readSavedPos();
      if (savedPos) setPos(savedPos);
      else setPos(getDefaultPos());
    } catch {
      setPos(getDefaultPos());
    }
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

  React.useEffect(() => {
    try {
      localStorage.setItem(LS_MINI, mini ? "1" : "0");
    } catch {}
  }, [mini]);

  // ✅ Capturar screenText cuando cambia la ruta / se abre / enabled
  React.useEffect(() => {
    if (!enabled) {
      setScreenText("");
      return;
    }
    if (mini) return;
    if (!open) return;

    const t = window.setTimeout(() => {
      setScreenText(readScreenText(2800));
    }, 120);

    return () => window.clearTimeout(t);
  }, [pathname, open, enabled, mini]);

  // Si llega transcript (STT), lo volcamos al input
  React.useEffect(() => {
    const t = safeTrim(voice.state.lastTranscript);
    if (!t) return;
    setInput(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.state.lastTranscript]);

  // Si deshabilitan el asistente, paramos voz
  React.useEffect(() => {
    if (!enabled) {
      try {
        voice.stopListening();
        voice.cancelSpeak();
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Auto-scroll
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
          content: "El asistente está en OFF. Actívalo para que pueda responder dentro de MinQuant_WSCA.",
        })
      );
      return;
    }

    setBusy(true);
    setMessages((prev) => prev.concat({ role: "user", content: text }));

    try {
      const base = messagesRef.current || [];
      const history = clampHistory([...base, { role: "user", content: text }], 8);

      const mergedVisibleState = {
        ...(visibleState ?? {}),
        pathname: pathname || null,
        screenText: screenText || "",
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
              "Ahora mismo la IA no está disponible. Puedo ayudarte igual: dime qué botón ves en pantalla o qué acción quieres realizar.",
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
          content: "Tuve un error al responder. Intenta de nuevo o describe qué estás viendo en la pantalla.",
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

  const dockWidthClass = compact ? "w-[320px]" : "w-[360px]";
  const dockMaxHClass = compact ? "max-h-[420px]" : "max-h-[520px]";
  const bodyMaxH = compact ? 260 : 320;

  const modeLabel = mode === "academic" ? "Académico" : "APP";
  const hasScreenText = !!safeTrim(screenText);

  // ==================================================
  // ✅ CONTENEDOR FLOTANTE (siempre)
  // ==================================================
  // IMPORTANTÍSIMO: touchAction none aquí ayuda a móvil
  const containerStyle: React.CSSProperties = {
    left: pos.x,
    top: pos.y,
    touchAction: "none",
  };

  // ==================================================
  // ✅ MODO MINI (BURBUJA) draggable + tap abre
  // ==================================================
  if (mini) {
    return (
      <div
        ref={dockRef}
        className="fixed z-[9999] select-none"
        style={containerStyle}
      >
        <button
          type="button"
          className={[
            "w-[72px] h-[72px] rounded-full shadow-xl border bg-white",
            "flex items-center justify-center",
            enabled ? "" : "opacity-70",
          ].join(" ")}
          title="Toca para abrir. Arrastra para mover."
          onPointerDown={onPointerDownDrag}
          onPointerMove={onPointerMoveDrag}
          onPointerUp={(e) => onPointerUpDrag(e, { miniTapToOpen: true })}
        >
          <div className="pointer-events-none">
            <LightAvatar size={56} paused={!enabled} energy={enabled ? (busy ? 0.95 : 0.65) : 0} />
          </div>
        </button>

        {/* mini-controls (esquinita) */}
        <div className="absolute -top-2 -right-2 flex gap-1">
          <button
            type="button"
            onClick={() => setEnabled((v) => !v)}
            className={[
              "w-7 h-7 rounded-full text-[10px] border shadow bg-white",
              enabled ? "text-emerald-700" : "text-gray-500",
            ].join(" ")}
            title={enabled ? "Asistente ON (clic para OFF)" : "Asistente OFF (clic para ON)"}
          >
            {enabled ? "ON" : "OFF"}
          </button>

          <button
            type="button"
            onClick={resetPos}
            className="w-7 h-7 rounded-full text-[10px] border shadow bg-white text-gray-700"
            title="Reset posición"
          >
            ↺
          </button>
        </div>
      </div>
    );
  }

  // ==================================================
  // ✅ PANEL NORMAL (Header draggable)
  // ==================================================
  return (
    <div
      ref={dockRef}
      className="fixed z-[9999]"
      style={containerStyle}
    >
      {/* Toggle bar */}
      <div className="flex items-center justify-end gap-2 mb-2">
        <button
          type="button"
          onClick={() => setEnabled((v) => !v)}
          className={[
            "px-3 py-1 rounded-full text-xs border shadow-sm",
            enabled ? "bg-emerald-600 text-white border-emerald-700" : "bg-gray-200 text-gray-700 border-gray-300",
          ].join(" ")}
          title="ON/OFF del asistente (OFF = sin IA, sin micrófono)"
        >
          {enabled ? "Asistente: ON" : "Asistente: OFF"}
        </button>

        <button
          type="button"
          onClick={() => {
            setMini(true);
            setOpen(true);
            // clampa por si cambia el tamaño (panel->burbuja)
            const next = clampPos(pos, bubbleSize, bubbleSize);
            setPos(next);
            savePos(next);
          }}
          className="px-3 py-1 rounded-full text-xs border bg-white shadow-sm"
          title="Convertir a burbuja (modo mini)"
        >
          Mini
        </button>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="px-3 py-1 rounded-full text-xs border bg-white shadow-sm"
          title={open ? "Minimizar panel (no burbuja)" : "Abrir"}
        >
          {open ? "Minimizar" : "Abrir"}
        </button>

        <button
          type="button"
          onClick={resetPos}
          className="px-3 py-1 rounded-full text-xs border bg-white shadow-sm"
          title="Reinicia la posición del asistente"
        >
          Reset pos
        </button>
      </div>

      {/* Panel */}
      {open && (
        <div
          className={[
            dockWidthClass,
            dockMaxHClass,
            "rounded-2xl shadow-xl border bg-white overflow-hidden",
            "flex flex-col",
          ].join(" ")}
        >
          {/* Header (DRAG HANDLE) */}
          <div
            className="flex items-center gap-3 px-3 py-3 border-b bg-gradient-to-r from-cyan-600 to-emerald-600 text-white select-none"
            title="Arrastra desde aquí para mover el asistente"
            style={{ cursor: "grab" }}
            onPointerDown={onPointerDownDrag}
            onPointerMove={onPointerMoveDrag}
            onPointerUp={(e) => onPointerUpDrag(e)}
          >
            <div className="shrink-0 pointer-events-none">
              <LightAvatar size={56} paused={!enabled} energy={enabled ? (busy ? 0.95 : 0.65) : 0} />
            </div>

            <div className="min-w-0 pointer-events-none">
              <div className="text-sm font-semibold leading-tight">Asistente MinQuant_WSCA</div>

              <div className="text-[11px] opacity-90 truncate">
                {pathname ? `Página: ${pathname}` : "Página: (sin ruta)"}
              </div>

              <div className="text-[11px] opacity-95">
                Modo: <b>{modeLabel}</b>{" "}
                <span className="opacity-90">
                  · Lectura pantalla: <b>{enabled ? (hasScreenText ? "OK" : "…") : "OFF"}</b>
                </span>
              </div>

              {!enabled && <div className="text-[11px] opacity-95">OFF: no IA, no micrófono.</div>}
            </div>
          </div>

          {/* Body chat (scroll) */}
          <div className="px-3 py-3 overflow-y-auto flex-1" style={{ maxHeight: bodyMaxH }}>
            <div className="space-y-2">
              {messages.map((m, idx) => {
                const isUser = m.role === "user";
                return (
                  <div key={idx} className={["flex", isUser ? "justify-end" : "justify-start"].join(" ")}>
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
                  <div className="bg-gray-100 text-gray-700 rounded-2xl px-3 py-2 text-sm">Pensando…</div>
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

          {/* Footer controls */}
          <div className="border-t px-3 py-3 bg-white shrink-0">
            {/* Row 1: Modo + TTS */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-full overflow-hidden border bg-white">
                  <button
                    type="button"
                    disabled={!enabled || busy}
                    onClick={() => {
                      setMode("app");
                      setMessages((prev) =>
                        prev.concat({ role: "assistant", content: "✅ Modo cambiado a APP (ayuda dentro de la app)." })
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
                      prev.concat({ role: "assistant", content: "🔄 Reset: modo APP activado (y se borró el modo guardado)." })
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

            {/* Row 2: Voz STT */}
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

            {/* Input */}
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

      {/* Minimizado (sin burbuja): botón draggable */}
      {!open && (
        <button
          type="button"
          className="px-3 py-2 rounded-2xl border bg-white shadow select-none"
          title="Arrastra para mover. Toca para abrir."
          style={{ cursor: "grab", touchAction: "none" }}
          onPointerDown={onPointerDownDrag}
          onPointerMove={onPointerMoveDrag}
          onPointerUp={(e) => {
            onPointerUpDrag(e);
            // tap abre (si no movió)
            if (!dragRef.current.moved) setOpen(true);
          }}
        >
          Abrir asistente
        </button>
      )}
    </div>
  );
}
