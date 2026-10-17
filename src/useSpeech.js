import { useCallback, useEffect, useRef, useState } from "react";

/*
 * Live speech-to-text through the browser's Web Speech API (Chrome / Edge).
 * In production the recorded audio is sent to Whisper via Groq on the server;
 * this gives the same "speak → transcript → evaluate" flow in the prototype.
 */
export function useSpeech({ onFinal } = {}) {
  const Recognition = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
  const recRef = useRef(null);
  const onFinalRef = useRef(onFinal);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { onFinalRef.current = onFinal; }, [onFinal]);

  const stop = useCallback(() => {
    recRef.current?.stop();
    setListening(false);
    setInterim("");
  }, []);

  const start = useCallback(() => {
    if (!Recognition) return setError("Speech recognition isn't supported in this browser. Use Chrome or Edge, or type your answer.");
    setError("");
    const rec = new Recognition();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) onFinalRef.current?.(r[0].transcript.trim());
        else live += r[0].transcript;
      }
      setInterim(live);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed") setError("Microphone permission was denied.");
      else if (e.error !== "no-speech" && e.error !== "aborted") setError(`Speech error: ${e.error}`);
    };
    rec.onend = () => {
      // Chrome stops after silence; restart while the user still wants to record.
      if (recRef.current === rec && rec._keep) {
        try { rec.start(); } catch { setListening(false); }
      } else setListening(false);
    };
    rec._keep = true;
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setError("Couldn't start the microphone.");
    }
  }, [Recognition]);

  const stopKeep = useCallback(() => {
    if (recRef.current) recRef.current._keep = false;
    stop();
  }, [stop]);

  useEffect(() => () => { if (recRef.current) { recRef.current._keep = false; recRef.current.abort?.(); } }, []);

  return { supported: !!Recognition, listening, interim, error, start, stop: stopKeep };
}
