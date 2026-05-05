import { useState, useRef, useCallback, useEffect } from 'react';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

// Chrome closes long-running recognitions even when `continuous=true` (often
// after 30–60s of no final results). With `restartOnEnd`, we transparently
// re-open the stream so hands-free mode stays alive without the user touching
// the mic button.
const RESTART_DEBOUNCE_MS = 200;

export function useSpeechRecognition({ lang = 'pl', continuous = true, onResult, restartOnEnd = false } = {}) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [supported] = useState(() => !!SpeechRecognition);
  const recognitionRef = useRef(null);
  const stoppedManually = useRef(false);
  const restartTimerRef = useRef(null);
  const restartOnEndRef = useRef(restartOnEnd);

  useEffect(() => { restartOnEndRef.current = restartOnEnd; }, [restartOnEnd]);

  const stop = useCallback(() => {
    stoppedManually.current = true;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  const start = useCallback(() => {
    if (!SpeechRecognition) return;

    stop();

    const recognition = new SpeechRecognition();
    recognition.lang = lang === 'pl' ? 'pl-PL' : 'en-US';
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      stoppedManually.current = false;
      setListening(true);
      setInterim('');
    };

    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      if (finalTranscript) {
        onResult?.(finalTranscript);
        setInterim('');
      } else {
        setInterim(interimTranscript);
      }
    };

    recognition.onerror = (event) => {
      if (event.error !== 'aborted') {
        console.warn('SpeechRecognition error:', event.error);
      }
      setListening(false);
      setInterim('');
    };

    recognition.onend = () => {
      setListening(false);
      setInterim('');
      recognitionRef.current = null;
      // Auto-restart only when the stream ended on its own (Chrome's idle
      // timeout) and the caller still wants us listening. Manual `stop()`
      // sets `stoppedManually=true` and skips the restart path.
      if (restartOnEndRef.current && !stoppedManually.current) {
        if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
        restartTimerRef.current = setTimeout(() => {
          restartTimerRef.current = null;
          if (restartOnEndRef.current && !stoppedManually.current) {
            start();
          }
        }, RESTART_DEBOUNCE_MS);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [lang, continuous, onResult, stop]);

  const toggle = useCallback(() => {
    if (listening) {
      stop();
    } else {
      start();
    }
  }, [listening, start, stop]);

  useEffect(() => {
    return () => {
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  return { listening, interim, supported, start, stop, toggle };
}
