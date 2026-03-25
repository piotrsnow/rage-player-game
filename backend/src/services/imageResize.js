import sharp from 'sharp';

export const GENERATED_IMAGE_SCALE = 0.75;
const GEMINI_IMAGE_SCALE_MULTIPLIER = 0.5;

export function getGeneratedImageScale(provider = 'dalle') {
  if (provider === 'gemini') {
    return GENERATED_IMAGE_SCALE * GEMINI_IMAGE_SCALE_MULTIPLIER;
  }
  return GENERATED_IMAGE_SCALE;
}

export async function downscaleGeneratedImage(buffer, scale = GENERATED_IMAGE_SCALE) {
  const image = sharp(buffer, { failOn: 'none' });
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    return buffer;
  }

  const width = Math.max(1, Math.round(metadata.width * scale));
  const height = Math.max(1, Math.round(metadata.height * scale));

  return image
    .resize({
      width,
      height,
      fit: 'fill',
      withoutEnlargement: true,
    })
    .toBuffer();
}
