import { useEffect, useRef, useState } from 'react';

const CHAR_INTERVAL_MS = 45;
const TYPING_SFX_COUNT = 3;

function pickRandomTypingSfx() {
  const idx = Math.floor(Math.random() * TYPING_SFX_COUNT) + 1;
  return `/battle_sfx/typing_on_keyboard_${idx}.mp3`;
}

export default function TypewriterActionOverlay({ text, onComplete }) {
  const [displayedChars, setDisplayedChars] = useState(0);
  const [phase, setPhase] = useState('typing');
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const audioRef = useRef(null);

  const typingDurationMs = text.length * CHAR_INTERVAL_MS;

  // Start typing SFX on mount, stop when typing ends
  useEffect(() => {
    const audio = new Audio(pickRandomTypingSfx());
    audio.loop = true;
    audio.volume = 0.45;
    audio.play().catch(() => {});
    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.currentTime = 0;
    };
  }, []);

  useEffect(() => {
    if (phase !== 'typing' && audioRef.current) {
      const audio = audioRef.current;
      let vol = audio.volume;
      const fade = setInterval(() => {
        vol = Math.max(0, vol - 0.05);
        audio.volume = vol;
        if (vol <= 0) {
          clearInterval(fade);
          audio.pause();
          audio.currentTime = 0;
        }
      }, 30);
      return () => clearInterval(fade);
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== 'typing') return;
    if (displayedChars >= text.length) {
      setPhase('holding');
      return;
    }
    const timer = setTimeout(() => setDisplayedChars((n) => n + 1), CHAR_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [displayedChars, phase, text.length]);

  useEffect(() => {
    if (phase === 'holding') {
      const timer = setTimeout(() => setPhase('fading'), 1500);
      return () => clearTimeout(timer);
    }
    if (phase === 'fading') {
      const timer = setTimeout(() => onCompleteRef.current?.(), 600);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  const progress = text.length > 0 ? displayedChars / text.length : 0;

  return (
    <div
      className={`fixed inset-0 z-[70] flex items-center justify-center ${
        phase === 'fading' ? 'animate-typewriter-fade-out' : ''
      }`}
      style={{
        background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.7) 100%)',
        backdropFilter: 'blur(6px)',
      }}
    >
      {/* Decorative glow behind the panel */}
      <div
        className="absolute rounded-full pointer-events-none animate-typewriter-glow"
        style={{
          width: '500px',
          height: '200px',
          background: 'radial-gradient(ellipse, rgba(197, 154, 255, 0.12) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }}
      />

      <div
        className="relative max-w-2xl w-full mx-4 animate-typewriter-zoom-out"
        style={{ animationDuration: `${Math.max(typingDurationMs, 800)}ms` }}
      >
        {/* Top ornament line */}
        <div className="flex items-center gap-3 mb-4 px-2">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
          <span className="material-symbols-outlined text-xs text-primary/50 animate-pulse">edit_note</span>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
        </div>

        {/* Main panel */}
        <div
          className="relative px-8 py-6 rounded-sm border border-primary/15 overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(25, 20, 30, 0.95), rgba(18, 15, 22, 0.97))',
            boxShadow: `
              inset 0 1px 0 rgba(197, 154, 255, 0.06),
              0 0 60px rgba(197, 154, 255, 0.06),
              0 12px 40px rgba(0, 0, 0, 0.5)
            `,
          }}
        >
          {/* Animated progress underline */}
          <div className="absolute bottom-0 left-0 h-px bg-gradient-to-r from-primary/60 via-tertiary/40 to-primary/60 transition-all duration-100 ease-linear" style={{ width: `${progress * 100}%` }} />

          {/* Subtle noise texture */}
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")' }} />

          <p className="relative font-mono text-lg leading-relaxed whitespace-pre-wrap min-h-[1.75rem] tracking-wide text-center">
            {text.split('').slice(0, displayedChars).map((char, i) => (
              <span
                key={i}
                className={i === displayedChars - 1 ? 'animate-typewriter-char-in' : ''}
                style={{ color: 'rgba(232, 210, 255, 0.9)' }}
              >
                {char}
              </span>
            ))}
            {phase !== 'fading' && (
              <span
                className="animate-cursor-blink inline-block ml-0.5"
                style={{
                  color: 'rgba(197, 154, 255, 0.9)',
                  textShadow: '0 0 8px rgba(197, 154, 255, 0.5)',
                }}
              >
                |
              </span>
            )}
          </p>
        </div>

        {/* Bottom ornament line */}
        <div className="flex items-center gap-3 mt-4 px-2">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
          <div className="w-1.5 h-1.5 rounded-full bg-primary/30" />
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        </div>
      </div>
    </div>
  );
}
