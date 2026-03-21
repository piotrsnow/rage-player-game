import { useState, useRef, useCallback, useEffect } from 'react';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export function useSpeechRecognition({ lang = 'pl', continuous = true, onResult } = {}) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [supported] = useState(() => !!SpeechRecognition);
  const recognitionRef = useRef(null);
  const stoppedManually = useRef(false);

  const stop = useCallback(() => {
    stoppedManually.current = true;
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
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  return { listening, interim, supported, start, stop, toggle };
}
