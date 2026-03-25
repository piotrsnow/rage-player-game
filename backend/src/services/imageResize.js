import sharp from 'sharp';

export const GENERATED_IMAGE_SCALE = 0.75;

export async function downscaleGeneratedImage(buffer) {
  const image = sharp(buffer, { failOn: 'none' });
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    return buffer;
  }

  const width = Math.max(1, Math.round(metadata.width * GENERATED_IMAGE_SCALE));
  const height = Math.max(1, Math.round(metadata.height * GENERATED_IMAGE_SCALE));

  return image
    .resize({
      width,
      height,
      fit: 'fill',
      withoutEnlargement: true,
    })
    .toBuffer();
}
