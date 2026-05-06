// webglLimits — probe the GPU's MAX_TEXTURE_SIZE once, cache it.
//
// Used as a guardrail so tileset previews / uploads don't try to allocate a
// GPU texture bigger than the hardware supports. Exceeding the limit reliably
// triggers "WebGL context was lost" in Chromium and kills every Pixi instance
// on the page.
//
// Chrome tabs have a hard cap of ~16 live WebGL contexts, so we dispose of
// the probe context via WEBGL_lose_context immediately after reading the
// parameter.

const SAFE_MAX_TEXTURE_SIZE = 4096;
let cached = 0;

export function getMaxTextureSize() {
  if (cached) return cached;
  if (typeof document === 'undefined') return SAFE_MAX_TEXTURE_SIZE;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) { cached = SAFE_MAX_TEXTURE_SIZE; return cached; }
    const max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    try { gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* ignore */ }
    cached = Number.isInteger(max) && max >= 2048 ? max : SAFE_MAX_TEXTURE_SIZE;
  } catch {
    cached = SAFE_MAX_TEXTURE_SIZE;
  }
  return cached;
}

export { SAFE_MAX_TEXTURE_SIZE };
