import { useEffect, useRef, useState } from 'react';

// ── module-level caches ────────────────────────────────────────────
const imageCache = new Map();
let animMapCache = null;
let animMapPromise = null;

function loadImage(url) {
  if (imageCache.has(url)) return imageCache.get(url);
  const p = new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
  imageCache.set(url, p);
  return p;
}

function fetchAnimMap() {
  if (animMapCache) return Promise.resolve(animMapCache);
  if (animMapPromise) return animMapPromise;
  animMapPromise = fetch('/v1/chargen/anim-map')
    .then((r) => r.json())
    .then((data) => { animMapCache = data.anim; return animMapCache; });
  return animMapPromise;
}

// ── frameAt (ported from mapapp/src/chargen/animFrames.js) ─────────
function frameAt(anim, elapsedMs) {
  if (!anim?.frames?.length) return { index: 0, frame: null, done: true };
  let total = 0;
  for (const f of anim.frames) total += Number(f[6]) || 0;
  if (total === 0) return { index: 0, frame: anim.frames[0], done: true };
  let t = elapsedMs;
  if (anim.loop) {
    t = ((t % total) + total) % total;
  } else if (t >= total) {
    const last = anim.frames[anim.frames.length - 1];
    return { index: anim.frames.length - 1, frame: last, done: true };
  }
  let acc = 0;
  for (let i = 0; i < anim.frames.length; i++) {
    const dur = Number(anim.frames[i][6]) || 0;
    if (t < acc + dur) return { index: i, frame: anim.frames[i], done: false };
    acc += dur;
  }
  const lastIdx = anim.frames.length - 1;
  return { index: lastIdx, frame: anim.frames[lastIdx], done: !anim.loop };
}

// ── direction helper ───────────────────────────────────────────────
export function getAnimDirection(dx, dy) {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

// ── component ──────────────────────────────────────────────────────
export default function LpcSprite({
  sheetUrl,
  animation = 'idle_down',
  width = 48,
  height = 48,
  playing = true,
  onAnimationEnd,
  className = '',
  style,
  fallback = null,
  pixelated = true,
}) {
  const canvasRef = useRef(null);
  const stateRef = useRef({
    img: null,
    animMap: null,
    startTime: 0,
    lastIndex: -1,
    calledEnd: false,
    rafId: 0,
  });
  const [ready, setReady] = useState(false);

  // Load sheet image + anim map
  useEffect(() => {
    let cancelled = false;
    const s = stateRef.current;
    s.img = null;
    setReady(false);

    Promise.all([loadImage(sheetUrl), fetchAnimMap()])
      .then(([img, animMap]) => {
        if (cancelled) return;
        s.img = img;
        s.animMap = animMap;
        setReady(true);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [sheetUrl]);

  // Reset timing when animation changes
  useEffect(() => {
    const s = stateRef.current;
    s.startTime = performance.now();
    s.lastIndex = -1;
    s.calledEnd = false;
  }, [animation]);

  // Animation loop
  useEffect(() => {
    if (!ready) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const s = stateRef.current;
    if (!s.startTime) s.startTime = performance.now();

    function tick() {
      const anim = s.animMap?.[animation];
      if (!anim || !s.img) { s.rafId = requestAnimationFrame(tick); return; }

      const elapsed = performance.now() - s.startTime;
      const { index, frame, done } = frameAt(anim, elapsed);

      if (index !== s.lastIndex && frame) {
        const [sx, sy, fw, fh] = frame;
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(s.img, sx, sy, fw, fh, 0, 0, width, height);
        s.lastIndex = index;
      }

      if (done && !anim.loop) {
        if (!s.calledEnd) { s.calledEnd = true; onAnimationEnd?.(); }
        return;
      }
      if (playing) s.rafId = requestAnimationFrame(tick);
    }

    s.rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(s.rafId);
  }, [ready, animation, playing, width, height, onAnimationEnd]);

  if (!ready) return fallback;

  const canvasStyle = pixelated ? { imageRendering: 'pixelated' } : undefined;

  return (
    <div className={className} style={style}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={canvasStyle}
      />
    </div>
  );
}
