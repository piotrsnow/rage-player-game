// Live animated preview of a composed LPC sprite sheet.
//
// Props:
//   canvas:     HTMLCanvasElement — the composed sheet (from useChargenStore.previewCanvas)
//   animId:     string — id from manifest.anim (e.g. "idle_down", "walk_right")
//   animMap:    manifest.anim
//   scale:      display scale (default 2)
//
// Uses a simple requestAnimationFrame loop to swap frames on an <img>-like
// canvas. Pure canvas-2d (no Pixi) because it only needs to draw one tile
// per frame and keeps this component independent of Pixi lifecycle.

import React, { useEffect, useRef } from 'react';
import { frameAt, getAnimation } from './animFrames.js';

export default function CharPreview({
  canvas, animId = 'idle_down', animMap, scale = 2, bg = '#111',
}) {
  const hostRef = useRef(null);
  // Keep the source canvas in a ref so that when composeSheet hands us a
  // freshly-composed (or reused) sheet we can swap it without tearing
  // down the preview's rAF loop and DOM node. The draw loop reads from
  // the ref on every frame.
  const sourceRef = useRef(canvas);
  useEffect(() => { sourceRef.current = canvas; }, [canvas]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const out = document.createElement('canvas');
    out.style.imageRendering = 'pixelated';
    out.style.background = bg;
    out.style.display = 'block';
    host.innerHTML = '';
    host.appendChild(out);
    const ctx = out.getContext('2d');

    const anim = getAnimation(animMap, animId);
    const firstFrame = anim?.frames?.[0];
    const w = firstFrame ? firstFrame[2] : 64;
    const h = firstFrame ? firstFrame[3] : 64;
    out.width = w * scale;
    out.height = h * scale;
    ctx.imageSmoothingEnabled = false;

    let rafId = 0;
    const start = performance.now();
    function draw(now) {
      ctx.clearRect(0, 0, out.width, out.height);
      const src = sourceRef.current;
      if (!src || !anim) {
        rafId = requestAnimationFrame(draw);
        return;
      }
      const { frame } = frameAt(anim, now - start);
      if (frame) {
        const [sx, sy, fw, fh] = frame;
        ctx.drawImage(src, sx, sy, fw, fh, 0, 0, fw * scale, fh * scale);
      }
      rafId = requestAnimationFrame(draw);
    }
    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [animId, animMap, scale, bg]);

  return <div ref={hostRef} style={{ lineHeight: 0 }} />;
}
