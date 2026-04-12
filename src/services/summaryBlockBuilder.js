import { apiClient } from './apiClient';

function splitIntoSentences(text) {
  return (text || '')
    .trim()
    .split(/(?<=[.!?…])\s+/)
    .filter(Boolean);
}

function splitSummaryIntoParagraphs(text) {
  const normalized = (text || '').trim();
  if (!normalized) return [];

  // Prefer AI-provided paragraph breaks if present.
  const provided = normalized
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (provided.length > 1) return provided;

  const sentences = splitIntoSentences(normalized);
  if (sentences.length <= 6) return [normalized];

  const paragraphs = [];
  let index = 0;
  while (index < sentences.length) {
    const remaining = sentences.length - index;
    if (remaining <= 6) {
      paragraphs.push(sentences.slice(index).join(' '));
      break;
    }
    let take = 4;
    if (remaining - take < 3) take = 3;
    paragraphs.push(sentences.slice(index, index + take).join(' '));
    index += take;
  }
  return paragraphs;
}

function pickDistributedImages(images, count) {
  if (!Array.isArray(images) || images.length === 0 || count <= 0) return [];
  const picked = [];
  const used = new Set();
  const step = images.length / (count + 1);
  for (let i = 0; i < count; i += 1) {
    let idx = Math.max(0, Math.min(images.length - 1, Math.round((i + 1) * step) - 1));
    while (used.has(idx) && idx < images.length - 1) idx += 1;
    while (used.has(idx) && idx > 0) idx -= 1;
    if (!used.has(idx)) {
      used.add(idx);
      picked.push(images[idx]);
    }
  }
  return picked;
}

function getRecapImages(recapScenes) {
  return (Array.isArray(recapScenes) ? recapScenes : [])
    .map((scene, idx) => {
      if (!scene?.image) return null;
      return {
        id: scene.id || `scene_${idx + 1}`,
        sceneNumber: idx + 1,
        src: apiClient.resolveMediaUrl(scene.image),
        prompt: scene.imagePrompt || '',
      };
    })
    .filter((image) => Boolean(image?.src));
}

function injectImagesIntoTextBlocks(textBlocks, recapImages, imageEvery = 2) {
  if (!Array.isArray(textBlocks) || textBlocks.length === 0) return [];
  if (recapImages.length === 0) {
    return textBlocks.map((text) => ({ type: 'text', text }));
  }

  const imageSlots = Math.min(
    recapImages.length,
    Math.max(1, Math.floor(textBlocks.length / Math.max(1, imageEvery)))
  );
  const selectedImages = pickDistributedImages(recapImages, imageSlots);
  const result = [];
  let imageIndex = 0;

  textBlocks.forEach((text, index) => {
    result.push({ type: 'text', text });
    const shouldInsertImage = (
      selectedImages.length > imageIndex
      && (index + 1) % Math.max(1, imageEvery) === 0
      && index < textBlocks.length - 1
    );
    if (shouldInsertImage) {
      result.push({ type: 'image', image: selectedImages[imageIndex] });
      imageIndex += 1;
    }
  });

  return result;
}

function buildNarrativeBlocks(text, recapScenes) {
  const sentences = splitIntoSentences(text);
  if (sentences.length === 0) return [];

  const storyImages = getRecapImages(recapScenes);

  const sentenceInterval = 7;
  const imageSlots = Math.min(storyImages.length, Math.floor(sentences.length / sentenceInterval));
  const selectedImages = pickDistributedImages(storyImages, imageSlots);

  if (selectedImages.length === 0) {
    return splitSummaryIntoParagraphs(text).map((paragraph) => ({
      type: 'text',
      text: paragraph,
    }));
  }

  const blocks = [];
  let sentenceIndex = 0;
  let imageIndex = 0;

  while (sentenceIndex < sentences.length) {
    const remaining = sentences.length - sentenceIndex;
    const take = Math.min(sentenceInterval, remaining);
    const paragraphText = sentences.slice(sentenceIndex, sentenceIndex + take).join(' ');
    blocks.push({ type: 'text', text: paragraphText });
    sentenceIndex += take;

    if (imageIndex < selectedImages.length && sentenceIndex < sentences.length) {
      blocks.push({ type: 'image', image: selectedImages[imageIndex] });
      imageIndex += 1;
    }
  }

  return blocks;
}

function buildStructuredBlocks(text, recapScenes) {
  const normalized = (text || '').trim();
  if (!normalized) return [];
  const recapImages = getRecapImages(recapScenes);

  const chunks = normalized
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  if (chunks.length > 0) {
    return injectImagesIntoTextBlocks(chunks, recapImages, 2);
  }
  return injectImagesIntoTextBlocks([normalized], recapImages, 2);
}

export function formatPoemForDisplay(text) {
  return (text || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n');
}

function buildPoemBlocks(text, recapScenes) {
  const formatted = formatPoemForDisplay((text || '').trim());
  if (!formatted) return [];

  const lines = formatted.split('\n');
  const nonEmptyLineCount = lines.filter((line) => line.trim().length > 0).length;
  const poemImages = getRecapImages(recapScenes);
  const imageSlots = Math.min(poemImages.length, Math.floor(nonEmptyLineCount / 12));
  const selectedImages = pickDistributedImages(poemImages, imageSlots);

  const blocks = [];
  let imageIndex = 0;
  let linesInChunk = 0;
  let chunkLines = [];

  const flushChunk = () => {
    if (chunkLines.length === 0) return;
    blocks.push({ type: 'text', text: chunkLines.join('\n') });
    chunkLines = [];
  };

  lines.forEach((line) => {
    chunkLines.push(line);
    if (line.trim()) linesInChunk += 1;
    if (linesInChunk >= 12) {
      flushChunk();
      linesInChunk = 0;
      if (imageIndex < selectedImages.length) {
        blocks.push({ type: 'image', image: selectedImages[imageIndex], variant: 'poem-pencil' });
        imageIndex += 1;
      }
    }
  });

  flushChunk();
  return blocks;
}

/**
 * Build the summary content blocks (text + image) from the raw summary text.
 * Mode selects the layout algorithm — narrative blocks for stories, structured
 * chunks for dialogue/report, poem-specific chunking for poems.
 */
export function buildSummaryBlocks({ summaryText, summaryMode, recapScenes }) {
  if (summaryMode === 'poem') return buildPoemBlocks(summaryText, recapScenes);
  if (summaryMode === 'dialogue' || summaryMode === 'report') return buildStructuredBlocks(summaryText, recapScenes);
  return buildNarrativeBlocks(summaryText, recapScenes);
}
