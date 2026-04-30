const SANITIZE_PATTERNS = [
  /\b(blood|bloody|bleeding|bloodied|bloodstain(ed)?)\b/gi,
  /\b(gore|gory|guts|entrails|viscera|dismember(ed|ment)?)\b/gi,
  /\b(corpse|dead\s+bod(y|ies)|severed|decapitat(ed|ion)|mutilat(ed|ion))\b/gi,
  /\b(murder(ed|ing)?|kill(ed|ing)|slaughter(ed|ing)?|massacre)\b/gi,
  /\b(torture(d|ing)?|torment(ed|ing)?)\b/gi,
  /\b(naked|nude|undress(ed)?)\b/gi,
  /\b(slave(ry|s)?|rape|assault(ed|ing)?)\b/gi,
  /\b(suicide|self-harm)\b/gi,
  /\b(drug|narcotic|opium|warpstone)\b/gi,
];

function sanitizeForImageGen(text) {
  let sanitized = text;
  for (const pattern of SANITIZE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '');
  }
  return sanitized.replace(/\s{2,}/g, ' ').trim();
}

const IMAGE_STYLE_PROMPTS = {
  illustration: {
    prompt: 'digital illustration, clean defined linework, vibrant saturated colors, fantasy book illustration, detailed ink-and-color art style',
    portrait: 'detailed character illustration, clean linework, vibrant colors, fantasy book art style',
    negative: 'photograph, photorealistic, 3d render, blurry',
  },
  pencil: {
    prompt: 'pencil sketch on textured paper, graphite drawing, expressive crosshatching, delicate shading, monochrome pencil art, hand-drawn feel',
    portrait: 'graphite pencil portrait, crosshatching, paper texture, monochrome sketch, detailed shading',
    negative: 'color, photograph, photorealistic, digital art, painting',
  },
  noir: {
    prompt: 'film noir style, stark high-contrast black and white, dramatic deep shadows, chiaroscuro lighting, 1940s hard-boiled detective aesthetic, venetian blind light',
    portrait: 'film noir portrait, high contrast black and white, dramatic shadow across face, chiaroscuro, smoky atmosphere',
    negative: 'color, bright, cheerful, cartoon, anime',
  },
  anime: {
    prompt: 'anime art style, cel-shaded, vivid colors, expressive eyes, dynamic composition, detailed anime background, Studio Ghibli quality',
    portrait: 'anime character portrait, cel-shaded, large expressive eyes, vivid colors, clean lines, detailed anime style',
    negative: 'photorealistic, photograph, 3d render, western cartoon',
  },
  painting: {
    prompt: 'classical oil painting, rich impasto brushstrokes, Renaissance chiaroscuro, deep warm palette, museum-quality fine art, canvas texture visible',
    portrait: 'oil painting portrait, rich brushwork, warm candlelight, Renaissance master style, deep colors, visible canvas texture',
    negative: 'photograph, digital art, cartoon, anime, sketch, flat colors',
  },
  watercolor: {
    prompt: 'delicate watercolor painting, soft translucent washes, wet-on-wet bleeding edges, visible paper grain, gentle pastel palette, impressionistic atmosphere',
    portrait: 'watercolor portrait, soft translucent washes, bleeding edges, visible paper texture, pastel tones, impressionistic',
    negative: 'photograph, photorealistic, digital art, sharp lines, anime',
  },
  comic: {
    prompt: 'comic book art style, bold black outlines, flat cel colors, halftone dot shading, dynamic panel composition, action-packed graphic novel aesthetic',
    portrait: 'comic book character portrait, bold ink outlines, flat cel colors, halftone shading, dynamic superhero comic style',
    negative: 'photorealistic, photograph, watercolor, oil painting, soft',
  },
  darkFantasy: {
    prompt: 'dark fantasy art, Beksinski-inspired eldritch atmosphere, oppressive gothic architecture, sickly muted palette, visceral organic textures, nightmarish surreal composition',
    portrait: 'dark fantasy portrait, haunted hollow eyes, scarred weathered face, gothic atmosphere, sickly palette, nightmarish eldritch details',
    negative: 'bright, cheerful, cartoon, anime, clean, happy',
  },
  vanGogh: {
    prompt: 'post-impressionist painting in the style of Van Gogh, expressive swirling brushstrokes, thick impasto texture, luminous night-sky colors, emotional dramatic movement, vivid painterly energy',
    portrait: 'post-impressionist portrait inspired by Van Gogh, swirling brushwork, thick impasto texture, vivid expressive colors, emotional painterly lighting',
    negative: 'photograph, photorealistic, 3d render, flat shading, smooth digital art',
  },
  photoreal: {
    prompt: 'photorealistic cinematic photograph, shallow depth of field, RAW photo quality, 8K UHD, DSLR, natural film grain, realistic lighting and materials',
    portrait: 'photorealistic portrait photograph, DSLR quality, shallow depth of field, natural skin texture, cinematic lighting, 8K detail',
    negative: 'painting, drawing, illustration, cartoon, anime, sketch, watercolor, digital art',
  },
  retro: {
    prompt: '16-bit pixel art, retro SNES-era RPG scene, limited color palette, dithering, nostalgic low-resolution aesthetic, crisp individual pixels visible',
    portrait: '16-bit pixel art character portrait, retro RPG style, limited palette, clean pixel work, nostalgic SNES aesthetic',
    negative: 'photorealistic, photograph, high resolution, smooth, blurry, 3d render',
  },
  gothic: {
    prompt: 'gothic fantasy artwork, towering cathedral arches, ornate stonework, candlelit gloom, medieval illuminated detail, solemn dramatic composition, sacred and ominous atmosphere',
    portrait: 'gothic portrait, cathedral-lit face, ornate medieval costume details, candlelit shadows, solemn sacred atmosphere, dramatic old-world elegance',
    negative: 'modern, sci-fi, cartoon, anime, cheerful, bright daylight',
  },
  hiphop: {
    prompt: 'urban hip-hop graffiti art style, bold spray-paint strokes, vibrant neon colors on concrete, street art murals, dripping paint, boombox culture aesthetic, thick outlines, stylized lettering accents',
    portrait: 'hip-hop street art portrait, spray-paint on brick wall, bold outlines, vibrant neon colors, graffiti style, urban swagger, dripping paint details',
    negative: 'photorealistic, photograph, watercolor, oil painting, soft, pastel, delicate',
  },
  crayon: {
    prompt: 'child-like crayon drawing on white paper, waxy texture, uneven coloring, playful naive art style, visible paper grain, bright primary colors, simple bold shapes, charming imperfect lines',
    portrait: 'crayon portrait drawing, waxy colorful strokes, child-like naive art style, uneven coloring, white paper background, playful and charming',
    negative: 'photorealistic, photograph, digital art, clean lines, professional, polished, 3d render',
  },
};

const TONE_MODIFIERS = {
  Dark: 'moody, desaturated colors, deep shadows, somber ominous atmosphere',
  Epic: 'grand scale, dramatic golden-hour lighting, heroic composition, sweeping vista',
  Humorous: 'warm vibrant colors, whimsical playful details, lighthearted cheerful mood',
};

const SERIOUSNESS_MODIFIERS = {
  silly: 'whimsical goofy scene, exaggerated cartoon-like proportions, playful absurd humor, comical expressions, slapstick energy',
  lighthearted: 'lighthearted cheerful mood, playful atmosphere, warm inviting tones, slight whimsy',
  serious: 'serious dignified atmosphere, realistic proportions, dramatic weight, solemn composed mood',
  grave: 'gravely somber atmosphere, oppressive heavy mood, no levity, dark weighty tension, haunting stillness',
};

const EMOTION_CUES = {
  anger: 'anger (furrowed brow, clenched jaw, hard narrowed gaze, tense mouth)',
  joy: 'joy (genuine smile, bright warm eyes, relaxed cheeks, lively expression)',
  mockery: 'mockery (curled lip, raised eyebrow, condescending smirk, sideways glance)',
  sadness: 'sadness (downturned mouth, heavy eyelids, distant melancholic gaze, soft weariness)',
  nostalgia: 'nostalgia (soft wistful gaze, faint bittersweet smile, distant thoughtful eyes)',
};

function buildEmotionDirective(emotions) {
  if (!emotions || typeof emotions !== 'object') return '';
  const parts = [];
  for (const [key, cue] of Object.entries(EMOTION_CUES)) {
    const raw = Number(emotions[key]);
    if (!Number.isFinite(raw) || raw <= 0) continue;
    const clamped = Math.max(0, Math.min(100, Math.round(raw)));
    if (clamped === 0) continue;
    parts.push(`${clamped}% ${cue}`);
  }
  if (parts.length === 0) return '';
  return ` Emotional expression on the face and in the eyes: ${parts.join(', ')}.`;
}

function buildLikenessDirective(hasReferenceImage, likeness) {
  if (!hasReferenceImage) return '';
  const val = Number.isFinite(Number(likeness)) ? Number(likeness) : 70;
  const v = Math.max(0, Math.min(100, Math.round(val)));
  if (v < 20) return '';
  if (v < 50) {
    return 'Use the reference image as loose inspiration only; the fantasy reinterpretation takes priority over exact likeness.';
  }
  if (v < 80) {
    return 'Preserve a clear likeness to the provided reference image: keep the same face shape, facial proportions, eyes, nose, mouth, hairstyle, and overall identity while reimagining the subject as a fantasy character.';
  }
  return 'Preserve the exact likeness to the reference image: identical face shape, facial proportions, eyes, nose, mouth, and hairstyle — only wardrobe, lighting, and setting change.';
}

function getSeriousnessDirective(seriousness) {
  const val = seriousness ?? 50;
  if (val < 25) return SERIOUSNESS_MODIFIERS.silly;
  if (val < 50) return SERIOUSNESS_MODIFIERS.lighthearted;
  if (val < 75) return SERIOUSNESS_MODIFIERS.serious;
  return SERIOUSNESS_MODIFIERS.grave;
}

function getImageStyleDirective(imageStyle, field = 'prompt') {
  const entry = IMAGE_STYLE_PROMPTS[imageStyle] || IMAGE_STYLE_PROMPTS.painting;
  return entry[field] || entry.prompt;
}

export function getImageStyleNegative(imageStyle) {
  const entry = IMAGE_STYLE_PROMPTS[imageStyle] || IMAGE_STYLE_PROMPTS.painting;
  return entry.negative || '';
}

export function buildImagePrompt(narrative, genre, tone, imagePrompt, provider = 'dalle', imageStyle = 'painting', darkPalette = false, characterAge = null, characterGender = null, seriousness = null, hasPortraitRef = false) {
  const isGemini = provider === 'gemini';

  const styleDirective = getImageStyleDirective(imageStyle, 'prompt');
  const mood = TONE_MODIFIERS[tone] || TONE_MODIFIERS.Epic;
  const darkDirective = darkPalette ? ' Use a dark, moody color palette with deep shadows, low-key lighting, muted desaturated tones, and dark atmospheric hues.' : '';
  const seriousnessDirective = seriousness != null ? ` Mood/tone: ${getSeriousnessDirective(seriousness)}.` : '';
  const portraitRefDirective = hasPortraitRef
    ? ' The main character from the reference portrait image must appear in the scene, maintaining their visual identity, face, and likeness.'
    : '';

  const rawDesc = imagePrompt || narrative.substring(0, 300);
  const sceneDesc = sanitizeForImageGen(rawDesc);
  const parsedAge = Number(characterAge);
  const ageDirective = Number.isFinite(parsedAge) ? ` Featured character age: ${Math.max(1, Math.round(parsedAge))}.` : '';
  const genderDirective = characterGender === 'female' || characterGender === 'male'
    ? ` Featured character gender: ${characterGender}.`
    : '';

  if (isGemini) {
    return `Generate an image in this EXACT art style: ${styleDirective}. Mood: ${mood}.${darkDirective}${seriousnessDirective}${ageDirective}${genderDirective} Scene: ${sceneDesc}. No text, no UI elements, no watermarks. High quality, detailed environment, atmospheric lighting, 16:9 widescreen composition.`;
  }

  return `ART STYLE: ${styleDirective}. ${mood}.${darkDirective}${seriousnessDirective}${ageDirective}${genderDirective}${portraitRefDirective} Scene: ${sceneDesc}. No text, no UI elements, no watermarks. High quality, detailed environment, atmospheric lighting.`;
}

export function buildSpeculativeImageDescription(previousNarrative, playerAction, diceOutcome) {
  const parts = [];

  if (previousNarrative) {
    parts.push(`Previous scene: ${sanitizeForImageGen(previousNarrative.substring(0, 200))}`);
  }

  const skip = !playerAction || playerAction === '[CONTINUE]' || playerAction === '[WAIT]' || playerAction.startsWith('[IDLE_WORLD_EVENT');
  if (!skip) {
    parts.push(`The character now: ${sanitizeForImageGen(playerAction.substring(0, 150))}`);
  }

  if (diceOutcome) {
    if (diceOutcome.criticalSuccess) {
      parts.push('Outcome: spectacular, extraordinary success — triumphant, glorious moment.');
    } else if (diceOutcome.criticalFailure) {
      parts.push('Outcome: dramatic, catastrophic failure — disaster, chaos, everything goes wrong.');
    } else if (diceOutcome.success) {
      parts.push('Outcome: the action succeeds.');
    } else {
      parts.push('Outcome: the action fails, complications arise.');
    }
  }

  return parts.join(' ');
}

export function buildItemImagePrompt(item, { genre = 'Fantasy', tone = 'Epic', provider = 'dalle', imageStyle = 'painting', darkPalette = false, seriousness = null } = {}) {
  const isGemini = provider === 'gemini';
  const styleDirective = getImageStyleDirective(imageStyle, 'prompt');
  const mood = TONE_MODIFIERS[tone] || TONE_MODIFIERS.Epic;
  const darkDirective = darkPalette ? ' Use a dark, moody color palette with deep shadows, low-key lighting, muted desaturated tones.' : '';
  const seriousnessDirective = seriousness != null ? ` Mood/tone: ${getSeriousnessDirective(seriousness)}.` : '';
  const itemName = sanitizeForImageGen(item?.name || 'Unknown item');
  const itemType = sanitizeForImageGen(item?.type || 'misc');
  const itemRarity = sanitizeForImageGen(item?.rarity || 'common');
  const itemDescription = sanitizeForImageGen(item?.description || `${itemName}, ${itemType}`);
  const worldContext = sanitizeForImageGen(genre || 'Fantasy');

  if (isGemini) {
    return `Generate an image in this EXACT art style: ${styleDirective}. Mood: ${mood}.${darkDirective}${seriousnessDirective} Subject: a fantasy inventory icon-style artwork of "${itemName}" (${itemType}, rarity: ${itemRarity}) in a ${worldContext} world. Visual details: ${itemDescription}. Single item in focus, centered composition, clean readable silhouette, no characters, no text, no UI elements, no watermark, high detail.`;
  }

  return `ART STYLE: ${styleDirective}. ${mood}.${darkDirective}${seriousnessDirective} Subject: a fantasy inventory artwork of "${itemName}" (${itemType}, rarity: ${itemRarity}) from a ${worldContext} setting. Visual details: ${itemDescription}. Single item in focus, centered composition, clean readable silhouette, no characters, no text, no UI elements, no watermark, high detail.`;
}

export function buildPortraitPrompt(species, gender, age, careerName, genre = 'Fantasy', provider = 'stability', imageStyle = 'painting', hasReferenceImage = false, darkPalette = false, seriousness = null, extras = {}) {
  const genderLabel = gender === 'female' ? 'female' : 'male';
  const isSD = provider === 'stability';
  const isGemini = provider === 'gemini';

  const speciesTraits = {
    Human: 'human, weathered skin, visible pores and skin texture',
    Halfling: 'halfling, short stature, round cheerful face, rosy cheeks, bright eyes',
    Dwarf: 'dwarf, stocky build, strong jaw, thick brow ridge, deep-set eyes, braided beard',
    'High Elf': 'high elf, pointed ears, high cheekbones, slender refined features, luminous eyes, ethereal complexion',
    'Wood Elf': 'wood elf, pointed ears, angular sharp features, intense wild eyes, sun-kissed weathered skin',
  };

  const styleDirective = getImageStyleDirective(imageStyle, 'portrait');
  const speciesDesc = speciesTraits[species] || 'human, weathered skin, visible pores and skin texture';
  const parsedAge = Number(age);
  const ageDirective = Number.isFinite(parsedAge) ? `, approximately ${Math.max(1, Math.round(parsedAge))} years old` : '';
  const career = careerName ? `, dressed as a ${careerName} with appropriate gear and attire` : '';
  const likenessDirective = buildLikenessDirective(hasReferenceImage, extras.likeness);
  const emotionDirective = buildEmotionDirective(extras.emotions);
  const darkDirective = darkPalette ? ' Dark moody color palette, deep shadows, low-key lighting, muted desaturated tones.' : '';
  const seriousnessDirective = seriousness != null ? ` ${getSeriousnessDirective(seriousness)}.` : '';

  if (isSD) {
    return `ART STYLE: ${styleDirective}. Close-up portrait of a ${genderLabel} ${speciesDesc}${ageDirective}${career}. ${likenessDirective} Highly detailed facial features: expressive eyes with visible iris detail, defined nose and lips, skin imperfections, scars and character lines. Sharp focus on the face, intricate costume, moody atmospheric background, head and shoulders composition.${darkDirective}${seriousnessDirective}${emotionDirective} No text, no watermarks.`;
  }

  if (isGemini) {
    return `Generate an image in this EXACT art style: ${styleDirective}. Portrait of a ${genderLabel} ${speciesDesc}${ageDirective}${career}. ${likenessDirective} Detailed face with expressive eyes, sharp focus, head and shoulders composition, dark atmospheric background.${darkDirective}${seriousnessDirective}${emotionDirective} Square 1:1 aspect ratio. No text, no watermarks.`;
  }

  if (provider === 'gpt-image') {
    return `ART STYLE: ${styleDirective}. Portrait of a ${genderLabel} ${speciesDesc}${ageDirective}${career}. ${likenessDirective} Highly detailed facial features: expressive eyes with visible iris detail, defined nose and lips, skin texture and character. Sharp focus on the face, intricate costume details, moody atmospheric background, head and shoulders composition.${darkDirective}${seriousnessDirective}${emotionDirective} No text, no watermarks.`;
  }

  return `ART STYLE: ${styleDirective}. Portrait of a ${genderLabel} ${speciesDesc}${ageDirective}${career}. Detailed face, expressive eyes, sharp focus, head and shoulders composition, dark atmospheric background.${darkDirective}${seriousnessDirective}${emotionDirective} No text, no watermarks, no borders.`;
}
