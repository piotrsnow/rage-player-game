// Chargen routes — serves animation frame data from the LPC manifest
// so the frontend LpcSprite component can slice frames from sprite sheets.

import { loadManifestFromDisk } from '../services/chargenCompositor.js';

let animMapCache = null;

export async function chargenRoutes(fastify) {
  fastify.get('/anim-map', async () => {
    if (animMapCache) return animMapCache;

    const manifest = await loadManifestFromDisk();
    animMapCache = { anim: manifest.anim || {} };
    return animMapCache;
  });
}
