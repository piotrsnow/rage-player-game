// TilePreview — tiny square that either draws a fragment of an atlas
// (given tileset image + localId) or a colored swatch with a label.
//
// Used by RulesEditor to visualize "left trait → right trait" pairs.
// Falls back to a labeled color square when we don't have a tileset fragment
// to draw (e.g. pure trait-only previews, or missing image).
//
// The atlas image cache below is module-level on purpose: the Studio
// renders dozens of `AtlasTilePreview` instances (rule rows, hover
// tooltip, pin) that all point at the same atlas. Without a cache each
// mount kicks off a fresh `new Image()` load + `drawImage`; with it we
// decode once per URL and every consumer reuses the same HTMLImageElement.

import React, { useEffect, useRef } from 'react';

// Module-level single-flight loader. Maps a URL → Promise<HTMLImageElement>
// that resolves once (and stays resolved) so concurrent callers share
// one network request / decode. Errors are NOT cached — next mount that
// asks for the same URL can retry (common when a user re-imports a
// tileset and the media URL changes on server side).
const IMG_CACHE = new Map();

function loadAtlasImage(url) {
  if (!url) return Promise.reject(new Error('no url'));
  const cached = IMG_CACHE.get(url);
  if (cached) return cached;
  const p = new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => {
      IMG_CACHE.delete(url);
      reject(new Error(`Failed to load atlas image: ${url}`));
    };
    img.src = url;
  });
  IMG_CACHE.set(url, p);
  return p;
}

function traitHue(key, value) {
  if (!value) return 230;
  let h = 2166136261 >>> 0;
  const s = `${key}:${value}`;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h % 360;
}

export function TraitSwatch({ traitKey, traitValue, size = 28 }) {
  const hue = traitHue(traitKey || '', traitValue || '');
  const label = traitValue || '∅';
  return (
    <div
      className="rounded-sm border border-outline-variant/30 flex items-center justify-center text-[9px] font-semibold text-black/80 leading-none overflow-hidden px-0.5"
      style={{
        width: size,
        height: size,
        background: traitValue
          ? `hsl(${hue}, 60%, 62%)`
          : 'rgba(100,116,139,0.25)',
      }}
      title={traitValue ? `${traitKey}: ${traitValue}` : 'brak traitu'}
    >
      <span className="truncate">{label}</span>
    </div>
  );
}

function AtlasTilePreviewImpl({ imageUrl, sx, sy, tilesize, size = 28 }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageUrl || !tilesize) return undefined;
    let cancelled = false;
    loadAtlasImage(imageUrl)
      .then((img) => {
        if (cancelled) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, size, size);
        try {
          ctx.drawImage(img, sx, sy, tilesize, tilesize, 0, 0, size, size);
        } catch {
          // Fallthrough: if the region is out of bounds, just leave the
          // canvas blank — the outer Rule row will still render.
        }
      })
      .catch(() => {
        /* swallow — the blank canvas is the fallback */
      });
    return () => { cancelled = true; };
  }, [imageUrl, sx, sy, tilesize, size]);
  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="rounded-sm border border-outline-variant/30 bg-surface-container-lowest"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

export const AtlasTilePreview = React.memo(AtlasTilePreviewImpl);
