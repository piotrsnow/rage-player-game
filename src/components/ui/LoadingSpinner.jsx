import { useEffect, useRef } from 'react';

export default function LoadingSpinner({ size = 'md', text }) {
  const edge = { sm: 20, md: 32, xl: 64, lg: 120 }[size];
  const half = edge / 2;
  const dot = Math.round(edge * 0.14);

  const faces = [
    { rotate: 'rotateY(0deg)', dots: 1 },
    { rotate: 'rotateY(180deg)', dots: 6 },
    { rotate: 'rotateY(90deg)', dots: 2 },
    { rotate: 'rotateY(-90deg)', dots: 5 },
    { rotate: 'rotateX(90deg)', dots: 3 },
    { rotate: 'rotateX(-90deg)', dots: 4 },
  ];

  const dotPositions = {
    1: [[50, 50]],
    2: [[25, 25], [75, 75]],
    3: [[25, 25], [50, 50], [75, 75]],
    4: [[25, 25], [75, 25], [25, 75], [75, 75]],
    5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
    6: [[25, 25], [75, 25], [25, 50], [75, 50], [25, 75], [75, 75]],
  };

  const tiltRef = useRef(null);

  useEffect(() => {
    const el = tiltRef.current;
    if (!el || typeof window === 'undefined') return;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    if (reduced || coarse) return;

    const MAX_TILT = 12;
    const EASING = 0.12;
    const clamp = (v) => Math.max(-1, Math.min(1, v));

    let targetX = 0;
    let targetZ = 0;
    let currentX = 0;
    let currentZ = 0;
    let raf = 0;

    const onMove = (e) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = clamp((e.clientX - cx) / (window.innerWidth / 2));
      const dy = clamp((e.clientY - cy) / (window.innerHeight / 2));
      targetX = -dy * MAX_TILT;
      targetZ = dx * MAX_TILT;
    };

    const tick = () => {
      currentX += (targetX - currentX) * EASING;
      currentZ += (targetZ - currentZ) * EASING;
      el.style.transform = `rotateX(${currentX.toFixed(3)}deg) rotateZ(${currentZ.toFixed(3)}deg)`;
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener('pointermove', onMove);
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-16 select-none" aria-busy="true">
      <div
        className="dice-scene"
        style={{ width: edge, height: edge }}
      >
        <div
          className="dice-tilt"
          ref={tiltRef}
          style={{ width: edge, height: edge }}
        >
          <div className="dice-cube" style={{ width: edge, height: edge }}>
            {faces.map(({ rotate, dots }, i) => (
              <div
                key={i}
                className="dice-face"
                style={{ transform: `${rotate} translateZ(${half}px)`, width: edge, height: edge }}
              >
                {dotPositions[dots].map(([x, y], j) => (
                  <span
                    key={j}
                    className="dice-dot"
                    style={{
                      width: dot,
                      height: dot,
                      left: `${x}%`,
                      top: `${y}%`,
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      {text && (
        <p className="text-on-surface-variant text-xs uppercase tracking-widest font-label animate-shimmer pointer-events-none">
          {text}
        </p>
      )}
    </div>
  );
}
