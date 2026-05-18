import { useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

const CLONE_REFRESH_MS = 200;

// Glass opening position measured from the frame image (1024 x 819 px).
const IMG_W = 1024;
const IMG_H = 819;
const GLASS_CX = 373 / IMG_W;     // shifted left in image → frame moves right on screen
const GLASS_CY = 298 / IMG_H;     // shifted up in image → frame moves down on screen
const GLASS_R = 205 / IMG_W;
const IMG_ASPECT = IMG_H / IMG_W;

const ANIM = '0.18s cubic-bezier(0.4,0,0.2,1)';

function HudButton({ onClick, children, disabled, active }) {
  return (
    <button
      type="button"
      onPointerDown={(e) => { e.stopPropagation(); onClick(); }}
      disabled={disabled}
      style={{
        pointerEvents: 'auto',
        width: 28, height: 28,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 6,
        border: active ? '1px solid rgba(180,130,255,0.7)' : '1px solid rgba(180,130,255,0.3)',
        background: active ? 'rgba(80,40,140,0.5)' : 'rgba(20,14,30,0.8)',
        color: disabled ? 'rgba(180,160,220,0.3)' : 'rgba(220,190,255,0.9)',
        fontSize: 16, fontWeight: 700, cursor: disabled ? 'default' : 'pointer',
        lineHeight: 1, padding: 0, fontFamily: 'monospace',
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      {children}
    </button>
  );
}

export default function MagnifierOverlay({ magnifier }) {
  const { active, zoom, size, mode, setZoom, setSize, toggle, toggleMode, increment, decrement } = magnifier;

  const glassRef = useRef(null);
  const cloneRef = useRef(null);
  const frameRef = useRef(null);
  const hudRef = useRef(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const rafRef = useRef(0);
  const cloneTimerRef = useRef(0);

  const half = size / 2;
  const frameW = size / (2 * GLASS_R);
  const frameH = frameW * IMG_ASPECT;
  const gcx = frameW * GLASS_CX;
  const gcy = frameH * GLASS_CY;

  const refreshClone = useCallback(() => {
    const glass = glassRef.current;
    if (!glass) return;
    const root = document.getElementById('root');
    if (!root) return;

    const oldClone = cloneRef.current;
    const newClone = root.cloneNode(true);
    newClone.style.cssText =
      'position:relative;left:0;top:0;pointer-events:none;margin:0;padding:0;overflow:hidden;';
    newClone.style.width = window.innerWidth + 'px';
    newClone.style.height = window.innerHeight + 'px';
    for (const el of newClone.querySelectorAll('script, iframe, video, [data-magnifier]')) {
      el.remove();
    }
    // clip-path on the glass container creates a containing block, which breaks
    // position:fixed inside the clone. Convert all to position:absolute.
    // Catches Tailwind `.fixed` class and inline style="position:fixed".
    for (const el of newClone.querySelectorAll('.fixed, [style*="fixed"]')) {
      el.style.position = 'absolute';
    }
    const realCanvases = root.querySelectorAll('canvas');
    const clonedCanvases = newClone.querySelectorAll('canvas');
    for (let i = 0; i < realCanvases.length && i < clonedCanvases.length; i++) {
      try {
        const dataUrl = realCanvases[i].toDataURL();
        const img = document.createElement('img');
        img.src = dataUrl;
        img.style.cssText = clonedCanvases[i].style.cssText + ';width:100%;height:100%;';
        clonedCanvases[i].replaceWith(img);
      } catch { /* tainted canvas */ }
    }

    if (oldClone && oldClone.parentNode === glass) {
      glass.replaceChild(newClone, oldClone);
    } else {
      glass.appendChild(newClone);
    }
    cloneRef.current = newClone;
  }, []);

  const tick = useCallback(() => {
    const glass = glassRef.current;
    const clone = cloneRef.current;
    const frame = frameRef.current;
    const hud = hudRef.current;
    if (!glass || !clone) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    const { x, y } = mouseRef.current;

    glass.style.left = `${x - half}px`;
    glass.style.top = `${y - half}px`;

    clone.style.left = `${half - x}px`;
    clone.style.top = `${half - y}px`;
    clone.style.transform = `scale(${zoom})`;
    clone.style.transformOrigin = `${x}px ${y}px`;

    if (frame) {
      frame.style.left = `${x - gcx}px`;
      frame.style.top = `${y - gcy}px`;
    }

    if (hud) {
      hud.style.left = `${x - half}px`;
      hud.style.top = `${y + half + 12}px`;
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [zoom, half, gcx, gcy]);

  useEffect(() => {
    if (!active) return;
    const onMove = (e) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('pointermove', onMove);
    refreshClone();
    cloneTimerRef.current = setInterval(refreshClone, CLONE_REFRESH_MS);
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(rafRef.current);
      clearInterval(cloneTimerRef.current);
      const glass = glassRef.current;
      const clone = cloneRef.current;
      if (glass && clone && clone.parentNode === glass) glass.removeChild(clone);
      cloneRef.current = null;
    };
  }, [active, tick, refreshClone]);

  if (!active) return null;

  const isZoomMode = mode === 'zoom';

  return createPortal(
    <div data-magnifier style={{ position: 'fixed', inset: 0, zIndex: 99998, pointerEvents: 'none' }}>
      {/* Glass circle — clips magnified content */}
      <div
        ref={glassRef}
        style={{
          position: 'fixed',
          width: size,
          height: size,
          clipPath: 'circle(50%)',
          pointerEvents: 'none',
          transition: `width ${ANIM}, height ${ANIM}, clip-path ${ANIM}`,
          left: -9999,
          top: -9999,
        }}
      />

      {/* Ornate frame image */}
      <img
        ref={frameRef}
        src="/ui/magnifier-frame.png"
        alt=""
        draggable={false}
        style={{
          position: 'fixed',
          width: frameW,
          height: frameH,
          pointerEvents: 'none',
          userSelect: 'none',
          transition: `width ${ANIM}, height ${ANIM}`,
          left: -9999,
          top: -9999,
        }}
      />

      {/* HUD panel */}
      <div
        ref={hudRef}
        data-magnifier-hud
        style={{
          position: 'fixed',
          left: -9999,
          top: -9999,
          width: size,
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          userSelect: 'none',
          transition: `width ${ANIM}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            background: 'rgba(10,8,16,0.85)',
            backdropFilter: 'blur(8px)',
            borderRadius: 10,
            padding: '5px 8px',
            border: '1px solid rgba(180,130,255,0.25)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          }}
        >
          {/* Zoom value */}
          <HudButton onClick={decrement} disabled={zoom <= 1.5 && isZoomMode}>−</HudButton>
          <span
            style={{
              fontSize: 13, fontFamily: 'monospace', fontWeight: 700,
              minWidth: 80, textAlign: 'center',
              color: isZoomMode ? 'rgba(220,190,255,0.95)' : 'rgba(200,170,240,0.5)',
              transition: 'color 0.15s',
            }}
          >
            {zoom.toFixed(1)}x zoom
          </span>
          <HudButton onClick={increment} disabled={zoom >= 5.0 && isZoomMode}>+</HudButton>

          {/* Mode toggle */}
          <HudButton onClick={toggleMode} active>
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
              swap_vert
            </span>
          </HudButton>

          {/* Size value */}
          <HudButton onClick={decrement} disabled={size <= 100 && !isZoomMode}>−</HudButton>
          <span
            style={{
              fontSize: 13, fontFamily: 'monospace', fontWeight: 700,
              minWidth: 70, textAlign: 'center',
              color: !isZoomMode ? 'rgba(220,190,255,0.95)' : 'rgba(200,170,240,0.5)',
              transition: 'color 0.15s',
            }}
          >
            {size}px
          </span>
          <HudButton onClick={increment} disabled={size >= 500 && !isZoomMode}>+</HudButton>

          {/* Divider + close */}
          <div style={{ width: 1, height: 20, background: 'rgba(180,130,255,0.2)', margin: '0 2px' }} />
          <HudButton onClick={toggle}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
          </HudButton>
        </div>

        <div style={{
          fontSize: 10, color: 'rgba(180,160,220,0.5)',
          fontFamily: 'monospace', textAlign: 'center', lineHeight: 1.4,
        }}>
          scroll / +− {isZoomMode ? 'zoom' : 'rozmiar'} &nbsp; PPM przełącz &nbsp; Esc zamknij
        </div>
      </div>
    </div>,
    document.body,
  );
}
