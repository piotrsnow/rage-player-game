import { useEffect, useRef, useState } from 'react';

export default function AnimatedTypingDraft({ text }) {
  const prevTextRef = useRef('');
  const [animateFromIndex, setAnimateFromIndex] = useState(0);

  useEffect(() => {
    const prev = prevTextRef.current;
    if (typeof text !== 'string') {
      prevTextRef.current = '';
      setAnimateFromIndex(0);
      return;
    }

    if (text.startsWith(prev) && text.length > prev.length) {
      setAnimateFromIndex(prev.length);
    } else {
      setAnimateFromIndex(0);
    }
    prevTextRef.current = text;
  }, [text]);

  if (!text) {
    return <span className="text-[11px] text-on-surface-variant/55 italic">...</span>;
  }

  return (
    <>
      <style>
        {`@keyframes mpTypingZoomOut{0%{opacity:0;transform:scale(1.35)}100%{opacity:1;transform:scale(1)}}`}
      </style>
      <span className="whitespace-pre-wrap break-words">
        {text.split('').map((char, index) => (
          <span
            key={`${char}_${index}`}
            style={index >= animateFromIndex ? { display: 'inline-block', animation: 'mpTypingZoomOut 220ms ease-out' } : undefined}
          >
            {char}
          </span>
        ))}
      </span>
    </>
  );
}
