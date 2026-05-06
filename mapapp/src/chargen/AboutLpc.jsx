// Simple modal showing the LPC credits file (licenses, original authors).
// The file lives at /chargen/credits.txt and is copied at asset-build time.

import React, { useEffect, useState } from 'react';
import Button from '../ui/Button.jsx';

export default function AboutLpc({ onClose }) {
  const [body, setBody] = useState('Loading credits…');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/chargen/credits.txt');
        const text = await res.text();
        if (!cancelled) setBody(text);
      } catch (err) {
        if (!cancelled) setBody(`Could not load credits: ${err.message}`);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose?.(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1000]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-panel-elevated rounded-lg flex flex-col overflow-hidden max-h-[80vh]"
        style={{ width: 'min(760px, 90vw)' }}
      >
        <div className="px-3.5 py-2.5 border-b border-outline-variant/20 flex items-center gap-2">
          <strong className="text-on-surface text-sm font-headline tracking-wide">Liberated Pixel Cup credits</strong>
          <div className="ml-auto">
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
        <div className="p-3.5 overflow-auto custom-scrollbar flex-1 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-on-surface-variant">
          {body}
        </div>
      </div>
    </div>
  );
}
