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

// Per-model SDXL rendering presets — research-backed sampler/steps/cfg/size
// picks from each model's Civitai card plus community consensus. Keys match
// the `model_name` field (no file extension or hash) returned by A1111's
// /sd-models endpoint. Backend mirror lives in backend/src/services/sdPresets.js
// — keep both in sync when tuning.
//
// Style tokens do NOT live here anymore. Prompt styling goes through
// IMAGE_STYLE_PROMPTS[*].sdTag (a compact ≤6-word tail appended by
// buildSdPrompt). The old qualityHead/qualityTail fields were confusing SDXL
// by bloating prompts past its ~75-token CLIP window — they're gone.
//
//   asgardSDXLHybrid_v12FP32MainModel — https://civitai.com/models/273751
//     "Hybrid" (Turbo-ish but not full Turbo). DPM++ 2M Karras at ~28–32 steps
//     with CFG 5–7. Most versatile of the trio — default scene model.
//
//   starlightXLAnimated_v3 — https://civitai.com/models/143043
//     2.5D anime. DPM++ 3M SDE Karras, CFG 3–5 (sweet spot ~3.6), ~40–50
//     steps. HIGH CFG ruins this model (artifacts, overcooked colors).
//
//   paintersCheckpointOilPaint_v11 — https://civitai.com/models/240154
//     Alla prima oil painting look. v1.1 has SAI's Offset LoRA built in —
//     do NOT stack an external Offset LoRA. DPM++ 2M Karras at ~30–38 steps,
//     CFG 5–6.
//
//   illustriousXL_v01 — Illustrious XL base (anime / illustration). Community
//     sweet spot: DPM++ 2M SDE Karras or Euler a, ~25–30 steps, CFG ~5–7.
//
//   bigaspV25_v25 — bigASP v2.5 (SDXL-family; Civitai / HF suggest moderate CFG;
//     DPM++ 2M Karras @ ~28–32 steps as a safe A1111 starting point).
export const SD_MODEL_PRESETS = {
  asgardSDXLHybrid_v12FP32MainModel: {
    sampler: 'DPM++ 2M Karras',
    steps: 30,
    cfg: 6,
    width: 1344,
    height: 768,
    portraitWidth: 832,
    portraitHeight: 1216,
    negative: 'low quality, blurry, pixelated, distorted, extra limbs, watermark, text, deformed hands, illustration, cartoon, anime, sketch',
  },
  starlightXLAnimated_v3: {
    sampler: 'DPM++ 3M SDE Karras',
    steps: 45,
    cfg: 3.6,
    width: 1344,
    height: 768,
    portraitWidth: 832,
    portraitHeight: 1216,
    negative: 'low quality, worst quality, blurry, bad anatomy, extra limbs, deformed hands, watermark, text, photorealistic, 3d render, realistic photo, overexposed, noisy, oversaturated',
  },
  paintersCheckpointOilPaint_v11: {
    sampler: 'DPM++ 2M Karras',
    steps: 35,
    cfg: 5.5,
    width: 1344,
    height: 768,
    portraitWidth: 832,
    portraitHeight: 1216,
    negative: 'low quality, blurry, pixelated, distorted, extra limbs, watermark, text, deformed hands, photograph, photorealistic, 3d render, cartoon, anime, flat colors, digital art, smooth plastic shading',
  },
  illustriousXL_v01: {
    sampler: 'DPM++ 2M SDE Karras',
    steps: 28,
    cfg: 6,
    width: 1344,
    height: 768,
    portraitWidth: 832,
    portraitHeight: 1216,
    negative: 'low quality, worst quality, jpeg artifacts, blurry, bad anatomy, extra limbs, deformed hands, watermark, text, photorealistic, 3d render, realistic photo, oversaturated, noise',
  },
  bigaspV25_v25: {
    sampler: 'DPM++ 2M Karras',
    steps: 30,
    cfg: 5,
    width: 1344,
    height: 768,
    portraitWidth: 832,
    portraitHeight: 1216,
    negative: 'low quality, worst quality, blurry, distorted, bad anatomy, extra limbs, deformed hands, watermark, text, oversaturated, jpeg artifacts',
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

// `prompt` / `portrait` are verbose natural-language scaffolds for cloud
// providers (DALL-E, Gemini, Stability, gpt-image) whose safety/instruction
// layers actually read the English description.
//
// `sdTag` is the compact (≤6-word) style tail used ONLY by the sd-webui branch.
// SDXL's CLIP encoder loses focus past ~75 tokens, so stuffing the whole
// natural-language prompt in front of the scene was making the model hallucinate
// architecture/props from the style scaffolding instead of drawing the scene.
// The compact tail sits at the very END of the SD prompt; the scene leads.
const IMAGE_STYLE_PROMPTS = {
  illustration: {
    prompt: 'digital illustration, clean defined linework, vibrant saturated colors, fantasy book illustration, detailed ink-and-color art style',
    portrait: 'detailed character illustration, clean linework, vibrant colors, fantasy book art style',
    sdTag: 'illustration, bold lines, vibrant',
    negative: 'photograph, photorealistic, 3d render, blurry',
  },
  pencil: {
    prompt: 'pencil sketch on textured paper, graphite drawing, expressive crosshatching, delicate shading, monochrome pencil art, hand-drawn feel',
    portrait: 'graphite pencil portrait, crosshatching, paper texture, monochrome sketch, detailed shading',
    sdTag: 'pencil sketch, crosshatch, monochrome',
    negative: 'color, photograph, photorealistic, digital art, painting',
  },
  noir: {
    prompt: 'film noir style, stark high-contrast black and white, dramatic deep shadows, chiaroscuro lighting, 1940s hard-boiled detective aesthetic, venetian blind light',
    portrait: 'film noir portrait, high contrast black and white, dramatic shadow across face, chiaroscuro, smoky atmosphere',
    sdTag: 'film noir, high contrast, b&w',
    negative: 'color, bright, cheerful, cartoon, anime',
  },
  anime: {
    prompt: 'anime art style, cel-shaded, vivid colors, expressive eyes, dynamic composition, detailed anime background, Studio Ghibli quality',
    portrait: 'anime character portrait, cel-shaded, large expressive eyes, vivid colors, clean lines, detailed anime style',
    sdTag: 'anime style, cel-shaded, vivid',
    negative: 'photorealistic, photograph, 3d render, western cartoon',
  },
  painting: {
    prompt: 'classical oil painting, rich impasto brushstrokes, chiaroscuro, deep warm palette, canvas texture visible',
    portrait: 'oil painting portrait, rich brushwork, warm candlelight, Renaissance master style, deep colors, visible canvas texture',
    sdTag: 'oil painting, impasto, painterly',
    negative: 'photograph, digital art, cartoon, anime, sketch, flat colors',
  },
  watercolor: {
    prompt: 'delicate watercolor painting, soft translucent washes, wet-on-wet bleeding edges, visible paper grain, gentle pastel palette, impressionistic atmosphere',
    portrait: 'watercolor portrait, soft translucent washes, bleeding edges, visible paper texture, pastel tones, impressionistic',
    sdTag: 'watercolor, soft washes, paper grain',
    negative: 'photograph, photorealistic, digital art, sharp lines, anime',
  },
  comic: {
    prompt: 'comic book art style, bold black outlines, flat cel colors, halftone dot shading, dynamic panel composition, action-packed graphic novel aesthetic',
    portrait: 'comic book character portrait, bold ink outlines, flat cel colors, halftone shading, dynamic superhero comic style',
    sdTag: 'comic style, bold outlines, halftone',
    negative: 'photorealistic, photograph, watercolor, oil painting, soft',
  },
  darkFantasy: {
    prompt: 'dark fantasy art, Beksinski-inspired eldritch atmosphere, oppressive gothic architecture, sickly muted palette, visceral organic textures, nightmarish surreal composition',
    portrait: 'dark fantasy portrait, haunted hollow eyes, scarred weathered face, gothic atmosphere, sickly palette, nightmarish eldritch details',
    sdTag: 'dark fantasy, grim, eldritch',
    negative: 'bright, cheerful, cartoon, anime, clean, happy',
  },
  vanGogh: {
    prompt: 'post-impressionist painting in the style of Van Gogh, expressive swirling brushstrokes, thick impasto texture, luminous night-sky colors, emotional dramatic movement, vivid painterly energy',
    portrait: 'post-impressionist portrait inspired by Van Gogh, swirling brushwork, thick impasto texture, vivid expressive colors, emotional painterly lighting',
    sdTag: 'van gogh, swirling impasto',
    negative: 'photograph, photorealistic, 3d render, flat shading, smooth digital art',
  },
  photoreal: {
    prompt: 'photorealistic cinematic photograph, shallow depth of field, RAW photo quality, 8K UHD, DSLR, natural film grain, realistic lighting and materials',
    portrait: 'photorealistic portrait photograph, DSLR quality, shallow depth of field, natural skin texture, cinematic lighting, 8K detail',
    sdTag: 'photorealistic, dslr, cinematic',
    negative: 'painting, drawing, illustration, cartoon, anime, sketch, watercolor, digital art',
  },
  retro: {
    prompt: '16-bit pixel art, retro SNES-era RPG scene, limited color palette, dithering, nostalgic low-resolution aesthetic, crisp individual pixels visible',
    portrait: '16-bit pixel art character portrait, retro RPG style, limited palette, clean pixel work, nostalgic SNES aesthetic',
    sdTag: '16-bit pixel art, retro rpg',
    negative: 'photorealistic, photograph, high resolution, smooth, blurry, 3d render',
  },
  gothic: {
    prompt: 'gothic fantasy artwork, towering cathedral arches, ornate stonework, candlelit gloom, medieval illuminated detail, solemn dramatic composition, sacred and ominous atmosphere',
    portrait: 'gothic portrait, cathedral-lit face, ornate medieval costume details, candlelit shadows, solemn sacred atmosphere, dramatic old-world elegance',
    sdTag: 'gothic art, candlelit, medieval',
    negative: 'modern, sci-fi, cartoon, anime, cheerful, bright daylight',
  },
  hiphop: {
    prompt: 'urban hip-hop graffiti art style, bold spray-paint strokes, vibrant neon colors on concrete, street art murals, dripping paint, boombox culture aesthetic, thick outlines, stylized lettering accents',
    portrait: 'hip-hop street art portrait, spray-paint on brick wall, bold outlines, vibrant neon colors, graffiti style, urban swagger, dripping paint details',
    sdTag: 'graffiti, neon, street art',
    negative: 'photorealistic, photograph, watercolor, oil painting, soft, pastel, delicate',
  },
  crayon: {
    prompt: 'child-like crayon drawing on white paper, waxy texture, uneven coloring, playful naive art style, visible paper grain, bright primary colors, simple bold shapes, charming imperfect lines',
    portrait: 'crayon portrait drawing, waxy colorful strokes, child-like naive art style, uneven coloring, white paper background, playful and charming',
    sdTag: 'crayon, naive, waxy',
    negative: 'photorealistic, photograph, digital art, clean lines, professional, polished, 3d render',
  },
};

// Compact single-word tags for the sd-webui branch. The verbose equivalents
// in TONE_MODIFIERS / SERIOUSNESS_MODIFIERS stay — cloud providers still use
// them — but SD gets just the essence so the scene keeps CLIP's attention.
const SD_TONE_TAGS = {
  Dark: 'moody',
  Epic: 'cinematic',
  Humorous: 'whimsical',
};

const SD_SERIOUSNESS_TAGS = {
  silly: 'goofy',
  lighthearted: 'playful',
  serious: 'solemn',
  grave: 'grim, somber',
};

function getSdSeriousnessTag(seriousness) {
  const val = seriousness ?? 50;
  if (val < 25) return SD_SERIOUSNESS_TAGS.silly;
  if (val < 50) return SD_SERIOUSNESS_TAGS.lighthearted;
  if (val < 75) return SD_SERIOUSNESS_TAGS.serious;
  return SD_SERIOUSNESS_TAGS.grave;
}

// Scene/portrait/item prompt assembler for sd-webui. Puts the concrete
// subject first (so SDXL's CLIP attention burns on the actual content),
// then UI-controlled modifiers as 1-2-word tags, then the per-style compact
// tail at the very end. Total output is typically 20-40 words — down from
// 100+ in the old ART-STYLE-prefix template.
function buildSdPrompt({
  subject,
  tone,
  darkPalette = false,
  seriousness = null,
  age = null,
  gender = null,
  hasPortraitRef = false,
  imageStyle = 'painting',
  extraTags = [],
}) {
  const attrs = [];
  if (hasPortraitRef) attrs.push('same character as reference');
  const parsedAge = Number(age);
  if (Number.isFinite(parsedAge)) attrs.push(`${Math.max(1, Math.round(parsedAge))}yo`);
  if (gender === 'female' || gender === 'male') attrs.push(gender);
  if (tone && SD_TONE_TAGS[tone]) attrs.push(SD_TONE_TAGS[tone]);
  if (seriousness != null) attrs.push(getSdSeriousnessTag(seriousness));
  if (darkPalette) attrs.push('dark palette');
  if (Array.isArray(extraTags)) {
    for (const tag of extraTags) {
      if (tag && typeof tag === 'string') attrs.push(tag.trim());
    }
  }
  const tail = (IMAGE_STYLE_PROMPTS[imageStyle] || IMAGE_STYLE_PROMPTS.painting).sdTag
    || IMAGE_STYLE_PROMPTS.painting.sdTag;
  const cleanSubject = String(subject || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,;:\s]+$/, '');
  const attrStr = attrs.filter(Boolean).join(', ');
  return attrStr ? `${cleanSubject}, ${attrStr}. ${tail}` : `${cleanSubject}. ${tail}`;
}

// Compact likeness tag for sd-webui img2img. Mirrors the natural-language
// buildLikenessDirective, but boiled down to one tag (or nothing for very
// low likeness where the fantasy reinterpretation dominates).
function getSdLikenessTag(hasReferenceImage, likeness) {
  if (!hasReferenceImage) return '';
  const val = Number.isFinite(Number(likeness)) ? Number(likeness) : 70;
  const v = Math.max(0, Math.min(100, Math.round(val)));
  if (v < 20) return '';
  if (v < 50) return 'loose reference';
  if (v < 80) return 'same face, fantasy look';
  return 'identical face';
}

// Compact emotion tags for sd-webui. Strips the verbose parenthetical cues
// and emits one short phrase per non-zero slider.
const SD_EMOTION_TAGS = {
  anger: 'angry',
  joy: 'joyful',
  mockery: 'mocking smirk',
  sadness: 'sad',
  nostalgia: 'nostalgic gaze',
};

function getSdEmotionTags(emotions) {
  if (!emotions || typeof emotions !== 'object') return [];
  const out = [];
  for (const [key, tag] of Object.entries(SD_EMOTION_TAGS)) {
    const raw = Number(emotions[key]);
    if (!Number.isFinite(raw) || raw <= 0) continue;
    out.push(tag);
  }
  return out;
}

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

  const rawDesc = imagePrompt || narrative.substring(0, 300);
  const sceneDesc = sanitizeForImageGen(rawDesc, provider);

  // sd-webui: scene first, compact attribute tags, short style tail at the
  // very end. Skips the model preset's old qualityHead/Tail — those are now
  // dead fields (backend still reads sampler/steps/cfg/size/negative).
  if (isSdWebui) {
    return buildSdPrompt({
      subject: sceneDesc,
      tone,
      darkPalette,
      seriousness,
      age: characterAge,
      gender: characterGender,
      hasPortraitRef,
      imageStyle,
    });
  }

  const styleDirective = getImageStyleDirective(imageStyle, 'prompt');
  const mood = TONE_MODIFIERS[tone] || TONE_MODIFIERS.Epic;
  const darkDirective = darkPalette ? ' Use a dark, moody color palette with deep shadows, low-key lighting, muted desaturated tones, and dark atmospheric hues.' : '';
  const seriousnessDirective = seriousness != null ? ` Mood/tone: ${getSeriousnessDirective(seriousness)}.` : '';
  const portraitRefDirective = hasPortraitRef
    ? ' The main character from the reference portrait image must appear in the scene, maintaining their visual identity, face, and likeness.'
    : '';

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
  const itemName = sanitizeForImageGen(item?.name || 'Unknown item', provider);
  const itemType = sanitizeForImageGen(item?.type || 'misc', provider);
  const itemRarity = sanitizeForImageGen(item?.rarity || 'common', provider);
  const itemDescription = sanitizeForImageGen(item?.description || `${itemName}, ${itemType}`, provider);
  const worldContext = sanitizeForImageGen(genre || 'Fantasy', provider);

  if (isSdWebui) {
    const sdSubject = `inventory artwork of ${itemName} (${itemType}, ${itemRarity}), ${itemDescription}, ${worldContext} setting, centered, single item`;
    return buildSdPrompt({
      subject: sdSubject,
      tone,
      darkPalette,
      seriousness,
      age: null,
      gender: null,
      hasPortraitRef: false,
      imageStyle,
    });
  }

  const styleDirective = getImageStyleDirective(imageStyle, 'prompt');
  const mood = TONE_MODIFIERS[tone] || TONE_MODIFIERS.Epic;
  const darkDirective = darkPalette ? ' Use a dark, moody color palette with deep shadows, low-key lighting, muted desaturated tones.' : '';
  const seriousnessDirective = seriousness != null ? ` Mood/tone: ${getSeriousnessDirective(seriousness)}.` : '';

  if (isGemini) {
    return `Generate an image in this EXACT art style: ${styleDirective}. Mood: ${mood}.${darkDirective}${seriousnessDirective} Subject: a fantasy inventory icon-style artwork of "${itemName}" (${itemType}, rarity: ${itemRarity}) in a ${worldContext} world. Visual details: ${itemDescription}. Single item in focus, centered composition, clean readable silhouette, no characters, no text, no UI elements, no watermark, high detail.`;
  }

  return `ART STYLE: ${styleDirective}. ${mood}.${darkDirective}${seriousnessDirective} Subject: a fantasy inventory artwork of "${itemName}" (${itemType}, rarity: ${itemRarity}) from a ${worldContext} setting. Visual details: ${itemDescription}. Single item in focus, centered composition, clean readable silhouette, no characters, no text, no UI elements, no watermark, high detail.`;
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
    // Subject-first compact form. Fantasy anchors (img2img bleed guard) stay
    // as a weighted prefix — they're technical not stylistic and SD reads the
    // :weight syntax. Age/gender are already baked into the subject string,
    // so we skip the extra tags for those.
    const sdAnchor = hasReferenceImage ? '(fantasy character:1.3), (fantasy armor:1.2), ' : '';
    const sdSubject = `${sdAnchor}close-up portrait of a ${genderLabel} ${speciesDesc}${ageDirective}${career}, head and shoulders`;
    const extraTags = [
      getSdLikenessTag(hasReferenceImage, extras.likeness),
      ...getSdEmotionTags(extras.emotions),
    ].filter(Boolean);
    return buildSdPrompt({
      subject: sdSubject,
      tone: null,
      darkPalette,
      seriousness,
      age: null,
      gender: null,
      hasPortraitRef: false,
      imageStyle,
      extraTags,
    });
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
