// components/assistant/useVoice.ts
"use client";

import React from "react";

/**
 * Voz sin costo (navegador):
 * - STT: Web Speech API (SpeechRecognition / webkitSpeechRecognition)
 * - TTS: speechSynthesis
 *
 * Fix hydration:
 * - NO calculamos soporte (window/webkitSpeechRecognition) durante el render inicial.
 * - Lo calculamos en useEffect (después de mount) para evitar mismatch SSR/CSR.
 */

export type VoiceState = {
  sttSupported: boolean;
  ttsSupported: boolean;
  listening: boolean;
  speaking: boolean;
  lastTranscript: string;
  lastError: string | null;
};

export type UseVoiceOptions = {
  lang?: string; // "es-PE", "es-ES"
  interimResults?: boolean;
  continuous?: boolean;
};

function safeTrim(s: string) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

export function useVoice(opts?: UseVoiceOptions) {
  const lang = opts?.lang || "es-PE";
  const interimResults = opts?.interimResults ?? true;
  const continuous = opts?.continuous ?? false;

  const [state, setState] = React.useState<VoiceState>({
    sttSupported: false,
    ttsSupported: false,
    listening: false,
    speaking: false,
    lastTranscript: "",
    lastError: null,
  });

  const recRef = React.useRef<SpeechRecognition | null>(null);

  // Detectar soporte SOLO después de montar (evita hydration mismatch)
  React.useEffect(() => {
    const w = window as any;

    const recCtor =
      (w.SpeechRecognition || w.webkitSpeechRecognition || null) as
        | (new () => SpeechRecognition)
        | null;

    const sttSupported = !!recCtor;
    const ttsSupported = "speechSynthesis" in window;

    setState((s) => ({
      ...s,
      sttSupported,
      ttsSupported,
    }));

    // Crear recognition si existe
    if (!recCtor) return;

    const rec = new recCtor();
    rec.lang = lang;
    rec.interimResults = interimResults;
    rec.continuous = continuous;

    rec.onstart = () => {
      setState((s) => ({ ...s, listening: true, lastError: null }));
    };

    rec.onend = () => {
      setState((s) => ({ ...s, listening: false }));
    };

    rec.onerror = (ev: any) => {
      const msg = safeTrim(ev?.error || ev?.message || "STT error");
      setState((s) => ({ ...s, listening: false, lastError: msg }));
    };

    rec.onresult = (event: SpeechRecognitionEvent) => {
      try {
        let finalText = "";
        let interimText = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          const txt = safeTrim(res?.[0]?.transcript || "");
          if (!txt) continue;
          if (res.isFinal) finalText += (finalText ? " " : "") + txt;
          else interimText += (interimText ? " " : "") + txt;
        }

        const merged = safeTrim(finalText || interimText);
        if (merged) setState((s) => ({ ...s, lastTranscript: merged }));
      } catch (e: any) {
        setState((s) => ({ ...s, lastError: String(e?.message || e) }));
      }
    };

    recRef.current = rec;

    return () => {
      try {
        rec.onstart = null as any;
        rec.onend = null as any;
        rec.onerror = null as any;
        rec.onresult = null as any;
        rec.stop();
      } catch {}
      recRef.current = null;
    };
  }, [lang, interimResults, continuous]);

  function startListening() {
    if (!state.sttSupported || !recRef.current) {
      setState((s) => ({ ...s, lastError: "STT no soportado en este navegador." }));
      return;
    }
    try {
      setState((s) => ({ ...s, lastTranscript: "", lastError: null }));
      recRef.current.start();
    } catch (e: any) {
      setState((s) => ({ ...s, lastError: String(e?.message || e) }));
    }
  }

  function stopListening() {
    if (!state.sttSupported || !recRef.current) return;
    try {
      recRef.current.stop();
    } catch {}
  }

  function speak(text: string) {
    const t = safeTrim(text);
    if (!t) return;

    if (!state.ttsSupported) {
      setState((s) => ({ ...s, lastError: "TTS no soportado en este navegador." }));
      return;
    }

    try {
      const synth = window.speechSynthesis;
      synth.cancel();

      const u = new SpeechSynthesisUtterance(t);
      u.lang = lang;

      u.onstart = () => setState((s) => ({ ...s, speaking: true, lastError: null }));
      u.onend = () => setState((s) => ({ ...s, speaking: false }));
      u.onerror = (ev: any) => {
        const msg = safeTrim(ev?.error || ev?.message || "TTS error");
        setState((s) => ({ ...s, speaking: false, lastError: msg }));
      };

      synth.speak(u);
    } catch (e: any) {
      setState((s) => ({ ...s, lastError: String(e?.message || e) }));
    }
  }

  function cancelSpeak() {
    if (!state.ttsSupported) return;
    try {
      window.speechSynthesis.cancel();
      setState((s) => ({ ...s, speaking: false }));
    } catch {}
  }

  return {
    state,
    startListening,
    stopListening,
    speak,
    cancelSpeak,
    setLastTranscript: (t: string) =>
      setState((s) => ({ ...s, lastTranscript: safeTrim(t) })),
    clearError: () => setState((s) => ({ ...s, lastError: null })),
  };
}
