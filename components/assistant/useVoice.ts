// components/assistant/useVoice.ts
"use client";

import React from "react";

/**
 * Voz sin costo (navegador):
 * - STT: Web Speech API
 * - TTS: speechSynthesis
 *
 * MEJORA:
 * - Elegir mejor voz disponible (es-PE preferida)
 * - voiceschanged (Chrome carga voces tarde)
 * - Partir texto en frases/chunks para que suene humano
 * - Tono/ritmo según contexto (explain/guide/warn)
 * - ✅ Asegurar voz antes de hablar + pequeño delay tras cancel() (Chrome)
 */

export type VoiceState = {
  sttSupported: boolean;
  ttsSupported: boolean;
  listening: boolean;
  speaking: boolean;
  lastTranscript: string;
  lastError: string | null;
  voiceName?: string | null;
  voiceLang?: string | null;
};

export type UseVoiceOptions = {
  lang?: string; // ej: "es-PE"
  interimResults?: boolean;
  continuous?: boolean;
};

function safeTrim(s: string) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

/**
 * Detecta el tipo de mensaje para ajustar voz
 */
function detectContext(text: string): "explain" | "guide" | "warn" {
  const t = text.toLowerCase();

  if (
    t.includes("advert") ||
    t.includes("importante") ||
    t.includes("preliminar") ||
    t.includes("no reemplaza") ||
    t.includes("cuidado") ||
    t.includes("ojo") ||
    t.includes("riesgo")
  ) {
    return "warn";
  }

  if (
    t.includes("paso") ||
    t.includes("primero") ||
    t.includes("luego") ||
    t.includes("presiona") ||
    t.includes("haz clic") ||
    t.includes("abre") ||
    t.includes("selecciona")
  ) {
    return "guide";
  }

  return "explain";
}

/**
 * Inserta pausas suaves (sin SSML)
 */
function withPauses(text: string) {
  // Evita exceso de "..." y deja pausas naturales
  return text
    .replace(/\s+/g, " ")
    .replace(/:\s+/g, ": … ")
    .replace(/;\s+/g, "; … ")
    .replace(/\.\s+/g, ". … ")
    .replace(/\?\s+/g, "? … ")
    .replace(/!\s+/g, "! … ")
    .trim();
}

/**
 * Parte texto en chunks cortos para TTS (más humano).
 * - corta por puntuación
 * - respeta un largo máximo
 */
function splitIntoChunks(text: string, maxLen = 180): string[] {
  const t = safeTrim(text);
  if (!t) return [];

  // Primero: cortar por frases
  const rough = t
    .replace(/\s+/g, " ")
    .split(/(?<=[\.\?\!])\s+|(?<=[:;])\s+/g)
    .map((s) => safeTrim(s))
    .filter(Boolean);

  const out: string[] = [];

  for (const part of rough) {
    if (part.length <= maxLen) {
      out.push(part);
      continue;
    }

    // Segundo: si aún es largo, corta por comas
    const commas = part
      .split(/,\s+/g)
      .map((s) => safeTrim(s))
      .filter(Boolean);
    let buff = "";

    for (const c of commas) {
      const candidate = buff ? `${buff}, ${c}` : c;
      if (candidate.length <= maxLen) {
        buff = candidate;
      } else {
        if (buff) out.push(buff);
        buff = c;
      }
    }
    if (buff) out.push(buff);
  }

  return out;
}

/**
 * Elige la voz "más humana" disponible para el idioma.
 * Preferencias:
 * 1) lang exacto (es-PE)
 * 2) es-PE (startsWith)
 * 3) es-ES
 * 4) cualquier es-*
 * Bonus: prioriza motores buenos (Google/Microsoft) si existen
 */
function pickBestVoice(voices: SpeechSynthesisVoice[], lang: string) {
  if (!Array.isArray(voices) || voices.length === 0) return null;

  const want = String(lang || "").trim().toLowerCase();
  const isGoodEngine = (v: SpeechSynthesisVoice) =>
    /google|microsoft|natural|neural/i.test(v.name || "");

  const normalize = (s: string) => String(s || "").toLowerCase();

  const byScore = voices
    .map((v) => {
      const vLang = normalize(v.lang);
      const name = normalize(v.name);

      let score = 0;

      // Idioma
      if (vLang === want) score += 100;
      if (want && vLang.startsWith(want.split("-")[0] || "es")) score += 30;

      if (want === "es-pe") {
        if (vLang.startsWith("es-pe")) score += 90;
        if (vLang.startsWith("es-es")) score += 60;
        if (vLang.startsWith("es-")) score += 40;
      } else {
        // si piden otro es-*, igual prioriza es-*
        if (vLang.startsWith("es-")) score += 40;
      }

      // Motor/Nombre
      if (isGoodEngine(v)) score += 25;

      // Bonus suave: nombres latam
      if (/peru|perú|latam|latin/i.test(name)) score += 8;

      // default del sistema (a veces buena)
      if ((v as any).default) score += 5;

      return { v, score };
    })
    .sort((a, b) => b.score - a.score);

  return byScore[0]?.v || null;
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
    voiceName: null,
    voiceLang: null,
  });

  const recRef = React.useRef<SpeechRecognition | null>(null);

  // ✅ Voz elegida (ref estable)
  const voiceRef = React.useRef<SpeechSynthesisVoice | null>(null);

  // ✅ Cola actual (para poder cancelar “bien”)
  const speakingQueueRef = React.useRef<SpeechSynthesisUtterance[]>([]);

  // ✅ Timeout para arranque post-cancel (evita issues en Chrome)
  const startTimerRef = React.useRef<number | null>(null);

  // Detectar soporte STT (post-mount)
  React.useEffect(() => {
    const w = window as any;

    const recCtor =
      (w.SpeechRecognition || w.webkitSpeechRecognition || null) as
        | (new () => SpeechRecognition)
        | null;

    const sttSupported = !!recCtor;
    const ttsSupported = typeof window !== "undefined" && "speechSynthesis" in window;

    setState((s) => ({ ...s, sttSupported, ttsSupported }));

    if (!recCtor) return;

    const rec = new recCtor();
    rec.lang = lang;
    rec.interimResults = interimResults;
    rec.continuous = continuous;

    rec.onstart = () => setState((s) => ({ ...s, listening: true, lastError: null }));

    rec.onend = () => setState((s) => ({ ...s, listening: false }));

    rec.onerror = (ev: any) =>
      setState((s) => ({
        ...s,
        listening: false,
        lastError: safeTrim(ev?.error || "STT error"),
      }));

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let txt = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        txt += r[0]?.transcript || "";
      }
      if (txt) setState((s) => ({ ...s, lastTranscript: safeTrim(txt) }));
    };

    recRef.current = rec;

    return () => {
      try {
        rec.stop();
      } catch {}
      recRef.current = null;
    };
  }, [lang, interimResults, continuous]);

  // ✅ Elegir voz TTS (Chrome: voces llegan tarde)
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("speechSynthesis" in window)) return;

    const synth = window.speechSynthesis;

    const applyVoices = () => {
      try {
        const voices = synth.getVoices?.() || [];
        const best = pickBestVoice(voices, lang);
        voiceRef.current = best;

        setState((s) => ({
          ...s,
          voiceName: best?.name || null,
          voiceLang: best?.lang || null,
        }));
      } catch {}
    };

    applyVoices();

    // Chrome dispara voiceschanged cuando ya cargó
    synth.onvoiceschanged = () => {
      applyVoices();
    };

    return () => {
      try {
        // @ts-ignore
        synth.onvoiceschanged = null;
      } catch {}
    };
  }, [lang]);

  // ✅ Asegura que haya voz elegida (Chrome a veces carga voces tarde)
  function ensureVoiceLoaded() {
    try {
      if (typeof window === "undefined") return;
      if (!("speechSynthesis" in window)) return;

      const synth = window.speechSynthesis;

      // Si ya tenemos voz, listo
      if (voiceRef.current) return;

      const voices = synth.getVoices?.() || [];
      const best = pickBestVoice(voices, lang);
      voiceRef.current = best;

      setState((s) => ({
        ...s,
        voiceName: best?.name || null,
        voiceLang: best?.lang || null,
      }));
    } catch {}
  }

  function startListening() {
    if (!state.sttSupported || !recRef.current) return;
    setState((s) => ({ ...s, lastTranscript: "", lastError: null }));
    recRef.current.start();
  }

  function stopListening() {
    if (!recRef.current) return;
    recRef.current.stop();
  }

  /**
   * 🔊 HABLAR CON TONO CONTEXTUAL + CHUNKS
   */
  function speak(text: string) {
    const t = safeTrim(text);
    if (!t || !state.ttsSupported) return;

    try {
      const synth = window.speechSynthesis;

      // limpiar timer previo si existía
      if (startTimerRef.current) {
        window.clearTimeout(startTimerRef.current);
        startTimerRef.current = null;
      }

      // ✅ cancelar cualquier cosa anterior
      synth.cancel();
      speakingQueueRef.current = [];

      // ✅ asegurar voz (por si voces llegaron tarde)
      ensureVoiceLoaded();

      // ✅ en Chrome a veces cancel() necesita un “tick” antes de speak()
      const startAfterCancel = () => {
        const context = detectContext(t);

        // Valores más humanos (menos “chipmunk”)
        let rate = 1.0;
        let pitch = 1.03;

        if (context === "explain") {
          rate = 0.98;
          pitch = 1.03;
        } else if (context === "guide") {
          rate = 1.02;
          pitch = 1.07;
        } else if (context === "warn") {
          rate = 0.95;
          pitch = 0.92;
        }

        // ✅ trocear en frases
        const chunks = splitIntoChunks(withPauses(t), 180);
        if (!chunks.length) {
          setState((s) => ({ ...s, speaking: false }));
          return;
        }

        setState((s) => ({ ...s, speaking: true, lastError: null }));

        let idx = 0;

        const speakNext = () => {
          if (idx >= chunks.length) {
            setState((s) => ({ ...s, speaking: false }));
            speakingQueueRef.current = [];
            return;
          }

          const chunk = chunks[idx++];
          const u = new SpeechSynthesisUtterance(chunk);
          u.lang = lang;

          // ✅ usar voz elegida si existe
          if (voiceRef.current) {
            u.voice = voiceRef.current;
          }

          u.rate = rate;
          u.pitch = pitch;
          u.volume = 1;

          // Un mini gap natural entre chunks (sin SSML)
          u.onend = () => {
            window.setTimeout(speakNext, 60);
          };

          u.onerror = () => {
            // si falla un chunk, no matamos todo, intentamos seguir
            window.setTimeout(speakNext, 60);
          };

          speakingQueueRef.current.push(u);
          synth.speak(u);
        };

        speakNext();
      };

      // ✅ arranca con un pequeño delay para que cancel() se asiente
      startTimerRef.current = window.setTimeout(startAfterCancel, 40) as any;
    } catch (e: any) {
      setState((s) => ({ ...s, speaking: false, lastError: String(e?.message || e) }));
    }
  }

  function cancelSpeak() {
    try {
      if (startTimerRef.current) {
        window.clearTimeout(startTimerRef.current);
        startTimerRef.current = null;
      }

      window.speechSynthesis.cancel();
      speakingQueueRef.current = [];
      setState((s) => ({ ...s, speaking: false }));
    } catch {}
  }

  return {
    state,
    startListening,
    stopListening,
    speak,
    cancelSpeak,
    clearError: () => setState((s) => ({ ...s, lastError: null })),
  };
}
