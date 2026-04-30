// Cloud providers (DALL-E, Gemini, Stability, gpt-image) have content policies
// that reject or silently desaturate prompts containing gore / drugs / explicit
// violence, so we strip those defensively — losing a grim-dark adjective is
// cheaper than a rejected request.
const SANITIZE_PATTERNS_CLOUD = [
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

// Local A1111 has no policy layer — we want dark-fantasy atmosphere to reach
// the model. Keep only the patterns we genuinely don't want in generated
// images regardless of provider (sexual content, assault, self-harm).
const SANITIZE_PATTERNS_LOCAL = [
  /\b(naked|nude|undress(ed)?)\b/gi,
  /\b(rape|assault(ed|ing)?)\b/gi,
  /\b(suicide|self-harm)\b/gi,
];

function sanitizeForImageGen(text, provider = 'dalle') {
  const patterns = provider === 'sd-webui' ? SANITIZE_PATTERNS_LOCAL : SANITIZE_PATTERNS_CLOUD;
  let sanitized = text;
  for (const pattern of patterns) {
    sanitized = sanitized.replace(pattern, '');
  }
  return sanitized.replace(/\s{2,}/g, ' ').trim();
}

// Per-model SDXL presets — research-backed recommendations from each model's
// Civitai card plus community consensus. Keys match the `model_name` field
// (no file extension or hash) returned by A1111's /sd-models endpoint.
// Backend mirror lives in backend/src/services/sdPresets.js — keep both in
// sync when tuning.
//
//   asgardSDXLHybrid_v12FP32MainModel — https://civitai.com/models/273751
//     "Hybrid" (Turbo-ish but not full Turbo). Author recommends the
//     "Sleipnir workflow"; community sweet spot is DPM++ 2M Karras at 24–28
//     steps with CFG 5–7. Most versatile of the trio — default scene model.
//
//   starlightXLAnimated_v3 — https://civitai.com/models/143043
//     2.5D anime. Author is explicit: DPM++ 3M SDE Karras, CFG 3–5 (sweet
//     spot ~3.6), 25–40 steps. HIGH CFG ruins this model (artifacts,
//     overcooked colors). Accepts Danbooru-style quality tags at the start
//     followed by natural-language description.
//
//   paintersCheckpointOilPaint_v11 — https://civitai.com/models/240154
//     Alla prima oil painting look. v1.1 has SAI's Offset LoRA built in —
//     do NOT stack an external Offset LoRA. DPM++ 2M Karras at 25–35 steps,
//     CFG 5–6. Reacts strongly to "oil painting / alla prima / impasto /
//     painterly / chiaroscuro" keywords in the tail.
export const SD_MODEL_PRESETS = {
  asgardSDXLHybrid_v12FP32MainModel: {
    sampler: 'DPM++ 2M Karras',
    steps: 26,
    cfg: 6,
    width: 1344,
    height: 768,
    portraitWidth: 832,
    portraitHeight: 1216,
    qualityTail: '',
    negative: 'low quality, blurry, pixelated, distorted, extra limbs, watermark, text, deformed hands, illustration, cartoon, anime, sketch',
  },
  starlightXLAnimated_v3: {
    sampler: 'DPM++ 3M SDE Karras',
    steps: 40,
    cfg: 3.6,
    width: 1344,
    height: 768,
    portraitWidth: 832,
    portraitHeight: 1216,
    qualityHead: '',
    qualityTail: '',
    negative: 'low quality, worst quality, blurry, bad anatomy, extra limbs, deformed hands, watermark, text, photorealistic, 3d render, realistic photo, overexposed, noisy, oversaturated',
  },
  paintersCheckpointOilPaint_v11: {
    sampler: 'DPM++ 2M Karras',
    steps: 30,
    cfg: 5.5,
    width: 1344,
    height: 768,
    portraitWidth: 832,
    portraitHeight: 1216,
    qualityTail: 'oil painting, alla prima, visible brushstrokes, impasto texture, painterly, atmospheric lighting, chiaroscuro, rich color palette, canvas texture',
    negative: 'low quality, blurry, pixelated, distorted, extra limbs, watermark, text, deformed hands, photograph, photorealistic, 3d render, cartoon, anime, flat colors, digital art, smooth plastic shading',
  },
};

// A1111 titles look like "asgardSDXLHybrid_v12FP32MainModel.safetensors [a1b2c3d4]".
// Strip extension + trailing hash, then exact-match; if that fails, do a
// substring containment check so forks/renames still resolve to the closest
// preset.
function normalizeModelKey(title) {
  if (!title || typeof title !== 'string') return '';
  return title
    .replace(/\s*\[[0-9a-f]{4,}\]\s*$/i, '')
    .replace(/\.(safetensors|ckpt|pt|bin)$/i, '')
    .trim();
}

export function getModelPreset(modelTitle) {
  const normalized = normalizeModelKey(modelTitle);
  if (!normalized) return null;
  if (SD_MODEL_PRESETS[normalized]) return SD_MODEL_PRESETS[normalized];
  const lower = normalized.toLowerCase();
  for (const key of Object.keys(SD_MODEL_PRESETS)) {
    if (lower.includes(key.toLowerCase())) return SD_MODEL_PRESETS[key];
  }
  return null;
}

function applyModelStyling(prompt, sdModel) {
  const preset = getModelPreset(sdModel);
  if (!preset) return prompt;
  const head = preset.qualityHead ? `${preset.qualityHead}, ` : '';
  const tail = preset.qualityTail ? `, ${preset.qualityTail}` : '';
  return `${head}${prompt}${tail}`;
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
    prompt: 'classical oil painting, rich impasto brushstrokes, chiaroscuro, deep warm palette, canvas texture visible',
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
  Epic: 'dramatic golden-hour lighting, cinematic framing',
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

// Extra negatives to append when the portrait is generated from a real
// reference photo via plain img2img. Without ControlNet / IP-Adapter the init
// image drags in the whole modern-photo aesthetic (casual clothes, indoor
// room, phone lighting) — these push it back toward fantasy.
export const REFERENCE_PHOTO_NEGATIVE = 'modern clothes, contemporary clothing, t-shirt, hoodie, jeans, sportswear, business suit, necktie, eyeglasses frame, selfie, phone photo, webcam photo, snapshot, casual photo, indoor room, plain wall background, office background, modern background, modern furniture, smartphone, headphones, earbuds';

export function buildImagePrompt(narrative, genre, tone, imagePrompt, provider = 'dalle', imageStyle = 'painting', darkPalette = false, characterAge = null, characterGender = null, seriousness = null, hasPortraitRef = false, sdModel = null) {
  const isGemini = provider === 'gemini';
  const isSdWebui = provider === 'sd-webui';

  const styleDirective = getImageStyleDirective(imageStyle, 'prompt');
  const mood = TONE_MODIFIERS[tone] || TONE_MODIFIERS.Epic;
  const darkDirective = darkPalette ? ' Use a dark, moody color palette with deep shadows, low-key lighting, muted desaturated tones, and dark atmospheric hues.' : '';
  const seriousnessDirective = seriousness != null ? ` Mood/tone: ${getSeriousnessDirective(seriousness)}.` : '';
  const portraitRefDirective = hasPortraitRef
    ? ' The main character from the reference portrait image must appear in the scene, maintaining their visual identity, face, and likeness.'
    : '';

  const rawDesc = imagePrompt || narrative.substring(0, 300);
  const sceneDesc = sanitizeForImageGen(rawDesc, provider);
  const parsedAge = Number(characterAge);
  const ageDirective = Number.isFinite(parsedAge) ? ` Featured character age: ${Math.max(1, Math.round(parsedAge))}.` : '';
  const genderDirective = characterGender === 'female' || characterGender === 'male'
    ? ` Featured character gender: ${characterGender}.`
    : '';

  if (isGemini) {
    return `Generate an image in this EXACT art style: ${styleDirective}. Mood: ${mood}.${darkDirective}${seriousnessDirective}${ageDirective}${genderDirective} Scene: ${sceneDesc}. No text, no UI elements, no watermarks. High quality, detailed environment, atmospheric lighting, 16:9 widescreen composition.`;
  }

  const base = `ART STYLE: ${styleDirective}. ${mood}.${darkDirective}${seriousnessDirective}${ageDirective}${genderDirective}${portraitRefDirective} Scene: ${sceneDesc}. No text, no UI elements, no watermarks. High quality, detailed environment, atmospheric lighting.`;
  return isSdWebui ? applyModelStyling(base, sdModel) : base;
}

export function buildSpeculativeImageDescription(previousNarrative, playerAction, diceOutcome, provider = 'dalle') {
  const parts = [];

  if (previousNarrative) {
    parts.push(`Previous scene: ${sanitizeForImageGen(previousNarrative.substring(0, 200), provider)}`);
  }

  const skip = !playerAction || playerAction === '[CONTINUE]' || playerAction === '[WAIT]' || playerAction.startsWith('[IDLE_WORLD_EVENT');
  if (!skip) {
    parts.push(`The character now: ${sanitizeForImageGen(playerAction.substring(0, 150), provider)}`);
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

export function buildItemImagePrompt(item, { genre = 'Fantasy', tone = 'Epic', provider = 'dalle', imageStyle = 'painting', darkPalette = false, seriousness = null, sdModel = null } = {}) {
  const isGemini = provider === 'gemini';
  const isSdWebui = provider === 'sd-webui';
  const styleDirective = getImageStyleDirective(imageStyle, 'prompt');
  const mood = TONE_MODIFIERS[tone] || TONE_MODIFIERS.Epic;
  const darkDirective = darkPalette ? ' Use a dark, moody color palette with deep shadows, low-key lighting, muted desaturated tones.' : '';
  const seriousnessDirective = seriousness != null ? ` Mood/tone: ${getSeriousnessDirective(seriousness)}.` : '';
  const itemName = sanitizeForImageGen(item?.name || 'Unknown item', provider);
  const itemType = sanitizeForImageGen(item?.type || 'misc', provider);
  const itemRarity = sanitizeForImageGen(item?.rarity || 'common', provider);
  const itemDescription = sanitizeForImageGen(item?.description || `${itemName}, ${itemType}`, provider);
  const worldContext = sanitizeForImageGen(genre || 'Fantasy', provider);

  if (isGemini) {
    return `Generate an image in this EXACT art style: ${styleDirective}. Mood: ${mood}.${darkDirective}${seriousnessDirective} Subject: a fantasy inventory icon-style artwork of "${itemName}" (${itemType}, rarity: ${itemRarity}) in a ${worldContext} world. Visual details: ${itemDescription}. Single item in focus, centered composition, clean readable silhouette, no characters, no text, no UI elements, no watermark, high detail.`;
  }

  const base = `ART STYLE: ${styleDirective}. ${mood}.${darkDirective}${seriousnessDirective} Subject: a fantasy inventory artwork of "${itemName}" (${itemType}, rarity: ${itemRarity}) from a ${worldContext} setting. Visual details: ${itemDescription}. Single item in focus, centered composition, clean readable silhouette, no characters, no text, no UI elements, no watermark, high detail.`;
  return isSdWebui ? applyModelStyling(base, sdModel) : base;
}

export function buildPortraitPrompt(species, gender, age, careerName, genre = 'Fantasy', provider = 'stability', imageStyle = 'painting', hasReferenceImage = false, darkPalette = false, seriousness = null, extras = {}, sdModel = null) {
  const genderLabel = gender === 'female' ? 'female' : 'male';
  const isSD = provider === 'stability';
  const isSdWebui = provider === 'sd-webui';
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

  // When we have a reference photo going into plain img2img (A1111 / Stability
  // without IP-Adapter), the init image pulls the result toward the uploaded
  // photo's styling — modern clothes, phone-photo lighting, indoor background.
  // Prepend weighted fantasy anchors (A1111 weighting syntax works on both
  // sd-webui and Stability SDXL) to keep the final image squarely in genre.
  const fantasyAnchor = hasReferenceImage
    ? `(fantasy character portrait:1.4), (epic fantasy illustration:1.3), (fantasy ${careerName || 'adventurer'} in character:1.2), (fantasy armor and costume:1.2), `
    : '';

  if (isSdWebui) {
    const base = `ART STYLE: ${styleDirective}. ${fantasyAnchor}Close-up portrait of a ${genderLabel} ${speciesDesc}${ageDirective}${career}. ${likenessDirective} Highly detailed facial features: expressive eyes with visible iris detail, defined nose and lips, skin imperfections, scars and character lines. Sharp focus on the face, intricate costume, moody atmospheric background, head and shoulders composition.${darkDirective}${seriousnessDirective}${emotionDirective} No text, no watermarks.`;
    return applyModelStyling(base, sdModel);
  }

  if (isSD) {
    return `ART STYLE: ${styleDirective}. ${fantasyAnchor}Close-up portrait of a ${genderLabel} ${speciesDesc}${ageDirective}${career}. ${likenessDirective} Highly detailed facial features: expressive eyes with visible iris detail, defined nose and lips, skin imperfections, scars and character lines. Sharp focus on the face, intricate costume, moody atmospheric background, head and shoulders composition.${darkDirective}${seriousnessDirective}${emotionDirective} No text, no watermarks.`;
  }

  if (isGemini) {
    return `Generate an image in this EXACT art style: ${styleDirective}. Portrait of a ${genderLabel} ${speciesDesc}${ageDirective}${career}. ${likenessDirective} Detailed face with expressive eyes, sharp focus, head and shoulders composition, dark atmospheric background.${darkDirective}${seriousnessDirective}${emotionDirective} Square 1:1 aspect ratio. No text, no watermarks.`;
  }

  if (provider === 'gpt-image') {
    return `ART STYLE: ${styleDirective}. Portrait of a ${genderLabel} ${speciesDesc}${ageDirective}${career}. ${likenessDirective} Highly detailed facial features: expressive eyes with visible iris detail, defined nose and lips, skin texture and character. Sharp focus on the face, intricate costume details, moody atmospheric background, head and shoulders composition.${darkDirective}${seriousnessDirective}${emotionDirective} No text, no watermarks.`;
  }

  return `ART STYLE: ${styleDirective}. Portrait of a ${genderLabel} ${speciesDesc}${ageDirective}${career}. Detailed face, expressive eyes, sharp focus, head and shoulders composition, dark atmospheric background.${darkDirective}${seriousnessDirective}${emotionDirective} No text, no watermarks, no borders.`;
}
