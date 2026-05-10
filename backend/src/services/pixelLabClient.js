const PIXELLAB_BASE = 'https://api.pixellab.ai/v1';

const SCALE_TO_SIZE = [
  32,  // 0
  32,  // 1
  48,  // 2
  48,  // 3
  64,  // 4
  80,  // 5
  96,  // 6
  128, // 7
];

export function scaleToSpriteSize(scale) {
  const px = SCALE_TO_SIZE[Math.min(Math.max(scale ?? 5, 0), 7)];
  return { width: px, height: px };
}

export async function generatePixelSprite({ apiKey, description, width, height, noBackground = true }) {
  const res = await fetch(`${PIXELLAB_BASE}/generate-image-pixflux`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      description,
      image_size: { width, height },
      no_background: noBackground,
      outline: 'single color black outline',
      detail: 'medium detail',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PixelLab ${res.status}: ${body}`);
  }

  return res.json();
}
