export const QUALITY_SD_PARAMS = {
  speed: { steps: 6, cfg: 2 },
  balanced: { steps: 20, cfg: 5 },
  quality: { steps: 35, cfg: 7 },
};

export const RESOLUTION_PRESETS = {
  low: 0.5,
  base: 1.0,
  high: 1.5,
};

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
    height: 512,
    portraitWidth: 832,
    portraitHeight: 1216,
    negative: 'low quality, blurry, pixelated, distorted, extra limbs, watermark, text, deformed hands, illustration, cartoon, anime, sketch',
  },
  starlightXLAnimated_v3: {
    sampler: 'DPM++ 3M SDE Karras',
    steps: 45,
    cfg: 3.6,
    width: 1344,
    height: 512,
    portraitWidth: 832,
    portraitHeight: 1216,
    negative: 'low quality, worst quality, blurry, bad anatomy, extra limbs, deformed hands, watermark, text, photorealistic, 3d render, realistic photo, overexposed, noisy, oversaturated',
  },
  paintersCheckpointOilPaint_v11: {
    sampler: 'DPM++ 2M Karras',
    steps: 35,
    cfg: 5.5,
    width: 1344,
    height: 512,
    portraitWidth: 832,
    portraitHeight: 1216,
    negative: 'low quality, blurry, pixelated, distorted, extra limbs, watermark, text, deformed hands, photograph, photorealistic, 3d render, cartoon, anime, flat colors, digital art, smooth plastic shading',
  },
  illustriousXL_v01: {
    sampler: 'DPM++ 2M SDE Karras',
    steps: 28,
    cfg: 6,
    width: 1344,
    height: 512,
    portraitWidth: 832,
    portraitHeight: 1216,
    negative: 'low quality, worst quality, jpeg artifacts, blurry, bad anatomy, extra limbs, deformed hands, watermark, text, photorealistic, 3d render, realistic photo, oversaturated, noise',
  },
  bigaspV25_v25: {
    sampler: 'DPM++ 2M Karras',
    steps: 30,
    cfg: 5,
    width: 1344,
    height: 512,
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
// `sdTag` is the style tail used ONLY by the sd-webui branch. It sits at the
// END of the SD prompt so the scene subject leads. Kept under ~10 tokens —
// enough for SDXL CLIP to parse without drowning the scene content.
//
// `sdNeg` is extra negative prompt merged only for this style on sd-webui.
// The model-preset negative (deformed hands, blurry, etc.) is always applied
// on top, so sdNeg only needs style-specific exclusions.
const IMAGE_STYLE_PROMPTS = {
  illustration: {
    prompt: 'digital illustration, clean defined linework, vibrant saturated colors, fantasy book illustration, detailed ink-and-color art style',
    portrait: 'detailed character illustration, clean linework, vibrant colors, fantasy book art style',
    sdTag: 'digital illustration, bold linework, vibrant flat colors, fantasy art',
    sdNeg: 'photograph, photorealistic, 3d render, oil painting, soft focus',
    negative: 'photograph, photorealistic, 3d render, blurry',
  },
  pencil: {
    prompt: 'pencil sketch on textured paper, graphite drawing, expressive crosshatching, delicate shading, monochrome pencil art, hand-drawn feel',
    portrait: 'graphite pencil portrait, crosshatching, paper texture, monochrome sketch, detailed shading',
    sdTag: 'graphite pencil drawing, crosshatching, paper texture, monochrome',
    sdNeg: 'color, colorful, painting, photograph, digital art, saturated',
    negative: 'color, photograph, photorealistic, digital art, painting',
  },
  noir: {
    prompt: 'film noir style, stark high-contrast black and white, dramatic deep shadows, chiaroscuro lighting, 1940s hard-boiled detective aesthetic, venetian blind light',
    portrait: 'film noir portrait, high contrast black and white, dramatic shadow across face, chiaroscuro, smoky atmosphere',
    sdTag: 'film noir, high contrast black and white, dramatic shadows, chiaroscuro',
    sdNeg: 'color, colorful, bright, cheerful, cartoon, anime, saturated',
    negative: 'color, bright, cheerful, cartoon, anime',
  },
  anime: {
    prompt: 'anime art style, cel-shaded, vivid colors, expressive eyes, dynamic composition, detailed anime background, Studio Ghibli quality',
    portrait: 'anime character portrait, cel-shaded, large expressive eyes, vivid colors, clean lines, detailed anime style',
    sdTag: 'anime artwork, cel shading, clean lines, vivid colors, detailed',
    sdNeg: 'photorealistic, photograph, 3d render, western cartoon, realistic skin texture',
    negative: 'photorealistic, photograph, 3d render, western cartoon',
  },
  painting: {
    prompt: 'classical oil painting, rich impasto brushstrokes, chiaroscuro, deep warm palette, canvas texture visible',
    portrait: 'oil painting portrait, rich brushwork, warm candlelight, Renaissance master style, deep colors, visible canvas texture',
    sdTag: 'oil painting, visible brushstrokes, impasto, rich warm palette, canvas texture',
    sdNeg: 'photograph, digital art, cartoon, anime, sketch, flat colors, smooth shading',
    negative: 'photograph, digital art, cartoon, anime, sketch, flat colors',
  },
  watercolor: {
    prompt: 'delicate watercolor painting, soft translucent washes, wet-on-wet bleeding edges, visible paper grain, gentle pastel palette, impressionistic atmosphere',
    portrait: 'watercolor portrait, soft translucent washes, bleeding edges, visible paper texture, pastel tones, impressionistic',
    sdTag: 'watercolor painting, soft washes, wet on wet, paper texture, translucent',
    sdNeg: 'photograph, photorealistic, digital art, sharp hard edges, anime, oil painting',
    negative: 'photograph, photorealistic, digital art, sharp lines, anime',
  },
  comic: {
    prompt: 'comic book art style, bold black outlines, flat cel colors, halftone dot shading, dynamic panel composition, action-packed graphic novel aesthetic',
    portrait: 'comic book character portrait, bold ink outlines, flat cel colors, halftone shading, dynamic superhero comic style',
    sdTag: 'comic book art, bold ink outlines, flat cel colors, halftone dots',
    sdNeg: 'photorealistic, photograph, watercolor, oil painting, soft shading, gradient',
    negative: 'photorealistic, photograph, watercolor, oil painting, soft',
  },
  darkFantasy: {
    prompt: 'dark fantasy art, Beksinski-inspired eldritch atmosphere, oppressive gothic architecture, sickly muted palette, visceral organic textures, nightmarish surreal composition',
    portrait: 'dark fantasy portrait, haunted hollow eyes, scarred weathered face, gothic atmosphere, sickly palette, nightmarish eldritch details',
    sdTag: 'dark fantasy art, grim atmosphere, muted sickly palette, eldritch, ominous',
    sdNeg: 'bright, cheerful, cartoon, clean, happy, pastel, vibrant saturated',
    negative: 'bright, cheerful, cartoon, anime, clean, happy',
  },
  vanGogh: {
    prompt: 'post-impressionist painting in the style of Van Gogh, expressive swirling brushstrokes, thick impasto texture, luminous night-sky colors, emotional dramatic movement, vivid painterly energy',
    portrait: 'post-impressionist portrait inspired by Van Gogh, swirling brushwork, thick impasto texture, vivid expressive colors, emotional painterly lighting',
    sdTag: 'post-impressionist, swirling brushstrokes, thick impasto, vivid expressive colors',
    sdNeg: 'photograph, photorealistic, 3d render, flat shading, smooth digital art, clean lines',
    negative: 'photograph, photorealistic, 3d render, flat shading, smooth digital art',
  },
  photoreal: {
    prompt: 'photorealistic cinematic photograph, shallow depth of field, RAW photo quality, 8K UHD, DSLR, natural film grain, realistic lighting and materials',
    portrait: 'photorealistic portrait photograph, DSLR quality, shallow depth of field, natural skin texture, cinematic lighting, 8K detail',
    sdTag: 'RAW photo, photorealistic, cinematic lighting, shallow depth of field, 8k uhd',
    sdNeg: 'painting, drawing, illustration, cartoon, anime, sketch, watercolor, digital art, unrealistic',
    negative: 'painting, drawing, illustration, cartoon, anime, sketch, watercolor, digital art',
  },
  retro: {
    prompt: '16-bit pixel art, retro SNES-era RPG scene, limited color palette, dithering, nostalgic low-resolution aesthetic, crisp individual pixels visible',
    portrait: '16-bit pixel art character portrait, retro RPG style, limited palette, clean pixel work, nostalgic SNES aesthetic',
    sdTag: 'pixel art, 16-bit retro RPG style, limited palette, crisp pixels, dithering',
    sdNeg: 'photorealistic, photograph, high resolution, smooth, blurry, 3d render, anti-aliased',
    negative: 'photorealistic, photograph, high resolution, smooth, blurry, 3d render',
  },
  gothic: {
    prompt: 'gothic fantasy artwork, towering cathedral arches, ornate stonework, candlelit gloom, medieval illuminated detail, solemn dramatic composition, sacred and ominous atmosphere',
    portrait: 'gothic portrait, cathedral-lit face, ornate medieval costume details, candlelit shadows, solemn sacred atmosphere, dramatic old-world elegance',
    sdTag: 'gothic art, candlelit, ornate medieval detail, cathedral atmosphere, solemn',
    sdNeg: 'modern, sci-fi, cartoon, anime, cheerful, bright daylight, neon, minimalist',
    negative: 'modern, sci-fi, cartoon, anime, cheerful, bright daylight',
  },
  hiphop: {
    prompt: 'urban hip-hop graffiti art style, bold spray-paint strokes, vibrant neon colors on concrete, street art murals, dripping paint, boombox culture aesthetic, thick outlines, stylized lettering accents',
    portrait: 'hip-hop street art portrait, spray-paint on brick wall, bold outlines, vibrant neon colors, graffiti style, urban swagger, dripping paint details',
    sdTag: 'graffiti street art, spray paint, neon colors on concrete, bold outlines, drips',
    sdNeg: 'photorealistic, photograph, watercolor, oil painting, soft, pastel, delicate, medieval',
    negative: 'photorealistic, photograph, watercolor, oil painting, soft, pastel, delicate',
  },
  crayon: {
    prompt: 'child-like crayon drawing on white paper, waxy texture, uneven coloring, playful naive art style, visible paper grain, bright primary colors, simple bold shapes, charming imperfect lines',
    portrait: 'crayon portrait drawing, waxy colorful strokes, child-like naive art style, uneven coloring, white paper background, playful and charming',
    sdTag: 'crayon drawing, waxy texture, naive childlike art, bright primary colors, paper',
    sdNeg: 'photorealistic, photograph, digital art, clean lines, professional, polished, 3d render, detailed',
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

export function getImageStyleSdNegative(imageStyle) {
  const entry = IMAGE_STYLE_PROMPTS[imageStyle] || IMAGE_STYLE_PROMPTS.painting;
  return entry.sdNeg || entry.negative || '';
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

  const rarityTraits = {
    common: '',
    uncommon: 'well-crafted, slightly ornate',
    rare: 'ornate, faintly glowing, masterwork',
    legendary: 'radiant glow, intricate engravings, legendary craftsmanship',
  };
  const rarityVisual = rarityTraits[itemRarity] || '';

  // Extract only visual adjectives from the description — strip narrative
  // context (where found, who made it, story references) that would confuse
  // image generators into producing scenes instead of a single object.
  const rawDesc = sanitizeForImageGen(item?.description || '', provider);
  const visualTraits = rawDesc
    .replace(/[.!?]+/g, ',')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 40)
    .slice(0, 4)
    .join(', ');

  const traitParts = [rarityVisual, visualTraits].filter(Boolean).join(', ');

  if (isSdWebui) {
    const sdSubject = `single ${itemType} on solid black background, ${itemName}${traitParts ? `, ${traitParts}` : ''}, centered object, inventory icon, no person, no hands, no character, no scene, no environment`;
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
  const darkDirective = darkPalette ? ' Dark moody palette.' : '';
  const seriousnessDirective = seriousness != null ? ` ${getSeriousnessDirective(seriousness)}.` : '';
  const traitsClause = traitParts ? ` Visual traits: ${traitParts}.` : '';

  if (isGemini) {
    return `Generate an image in this EXACT art style: ${styleDirective}.${darkDirective}${seriousnessDirective} Product-shot style showcase of a single "${itemName}" (${itemType}), presented alone on a solid BLACK background as if displayed in a catalog.${traitsClause} Exactly one isolated object, centered in frame, clean silhouette, no other objects, no characters, no hands, no scene, no environment, no text, no UI, no watermark.`;
  }

  return `ART STYLE: ${styleDirective}.${darkDirective}${seriousnessDirective} Product-shot style showcase of a single "${itemName}" (${itemType}), presented alone on a solid BLACK background as if displayed in a catalog.${traitsClause} Exactly one isolated object, centered in frame, clean silhouette, no other objects, no characters, no hands, no scene, no environment, no text, no UI, no watermark.`;
}

export function buildSpellImagePrompt(spell, { genre = 'Fantasy', tone = 'Epic', provider = 'dalle', imageStyle = 'painting', darkPalette = false, seriousness = null, sdModel = null } = {}) {
  const isGemini = provider === 'gemini';
  const isSdWebui = provider === 'sd-webui';
  const spellName = sanitizeForImageGen(spell?.name || 'Unknown spell', provider);
  const spellSchool = sanitizeForImageGen(spell?.school || spell?.treeName || 'arcane', provider);
  const spellDescription = sanitizeForImageGen(spell?.description || `${spellName}, magical energy`, provider);

  if (isSdWebui) {
    const sdSubject = `SOLO spell effect only, abstract magical energy, ${spellName} (${spellSchool} magic), ${spellDescription}, glowing arcane energy on solid black background, centered composition, spell icon, no people`;
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

  const noCharacterClause = 'absolutely no people, no person, no human figure, no face, no hands, no body parts, no characters, no silhouettes';

  if (isGemini) {
    return `Generate an image in this EXACT art style: ${styleDirective}. Mood: ${mood}.${darkDirective}${seriousnessDirective} Subject: a magical spell visualization of "${spellName}" (${spellSchool} magic) on a solid BLACK background. Visual: ${spellDescription}. Glowing magical energy, centered composition, dramatic lighting, ${noCharacterClause}, no items, no text, no UI elements, no watermark, high detail.`;
  }

  return `ART STYLE: ${styleDirective}. ${mood}.${darkDirective}${seriousnessDirective} Subject: a magical spell effect "${spellName}" (${spellSchool} magic) on a solid BLACK background. Visual: ${spellDescription}. Centered glowing arcane energy, dramatic lighting, ${noCharacterClause}, no items, no text, no UI elements, no watermark, high detail.`;
}

// Humanoid species recognised by the portrait pipeline. Anything else routes
// through the creature-mode branch in buildPortraitPrompt — without that
// branch a non-humanoid race ("legendarny ptak", "smok") would silently fall
// back to "human" and the image would render a person.
const HUMANOID_SPECIES_TRAITS = {
  Human: 'human, weathered skin, visible pores and skin texture',
  Halfling: 'halfling, short stature, round cheerful face, rosy cheeks, bright eyes',
  Dwarf: 'dwarf, stocky build, strong jaw, thick brow ridge, deep-set eyes, braided beard',
  'High Elf': 'high elf, pointed ears, high cheekbones, slender refined features, luminous eyes, ethereal complexion',
  'Wood Elf': 'wood elf, pointed ears, angular sharp features, intense wild eyes, sun-kissed weathered skin',
};

export function isHumanoidSpecies(species) {
  return typeof species === 'string' && Object.prototype.hasOwnProperty.call(HUMANOID_SPECIES_TRAITS, species);
}

export function buildPortraitPrompt(species, gender, age, careerName, genre = 'Fantasy', provider = 'stability', imageStyle = 'painting', hasReferenceImage = false, darkPalette = false, seriousness = null, extras = {}, sdModel = null, subjectOverride = null) {
  const genderLabel = gender === 'female' ? 'female' : 'male';
  const isSD = provider === 'stability';
  const isSdWebui = provider === 'sd-webui';
  const isGemini = provider === 'gemini';

  const styleDirective = getImageStyleDirective(imageStyle, 'portrait');
  const likenessDirective = buildLikenessDirective(hasReferenceImage, extras.likeness);
  const emotionDirective = buildEmotionDirective(extras.emotions);
  const darkDirective = darkPalette ? ' Dark moody color palette, deep shadows, low-key lighting, muted desaturated tones.' : '';
  const seriousnessDirective = seriousness != null ? ` ${getSeriousnessDirective(seriousness)}.` : '';
  // Canonical NPC appearance text (already translated to English upstream).
  // Used as the authoritative description so retries stay visually consistent
  // — without it, every regeneration would produce a different face.
  const appearanceDirective = typeof extras.appearance === 'string' && extras.appearance.trim()
    ? ` Distinctive appearance: ${extras.appearance.trim()}.`
    : '';

  // LLM-built subject mode (NPC portraits). The caller prepared an English
  // subject; species/career templating is skipped, but we prefix explicit
  // gender and/or age when known — SD models otherwise drift on archetypes
  // (hermit = old man, ageless witch, etc.).
  const trimmedOverride = typeof subjectOverride === 'string' ? subjectOverride.trim() : '';
  if (trimmedOverride) {
    const parsedAnchorAge = Number(age);
    const anchorAgeYears = Number.isFinite(parsedAnchorAge)
      ? Math.max(1, Math.round(parsedAnchorAge))
      : null;
    const anchorTokens = [];
    if (gender === 'female' || gender === 'male') {
      anchorTokens.push(gender === 'female' ? 'female' : 'male');
    }
    if (anchorAgeYears != null) {
      anchorTokens.push(`approximately ${anchorAgeYears} years old`);
    }
    const anchoredSubject =
      anchorTokens.length > 0
        ? `${anchorTokens.join(', ')}, ${trimmedOverride}`
        : trimmedOverride;
    if (isSdWebui) {
      const extraTags = [...getSdEmotionTags(extras.emotions)].filter(Boolean);
      return buildSdPrompt({
        subject: `close-up portrait of ${anchoredSubject}, head and shoulders`,
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
    const compositionTail = ' Sharp focus on the subject, intricate detail, moody atmospheric background, head and shoulders composition.';
    if (isSD) {
      return `ART STYLE: ${styleDirective}. Close-up portrait of ${anchoredSubject}.${appearanceDirective}${compositionTail}${darkDirective}${seriousnessDirective}${emotionDirective} No text, no watermarks.`;
    }
    if (isGemini) {
      return `Generate an image in this EXACT art style: ${styleDirective}. Portrait of ${anchoredSubject}.${appearanceDirective}${compositionTail} Square 1:1 aspect ratio.${darkDirective}${seriousnessDirective}${emotionDirective} No text, no watermarks.`;
    }
    if (provider === 'gpt-image') {
      return `ART STYLE: ${styleDirective}. Portrait of ${anchoredSubject}.${appearanceDirective}${compositionTail}${darkDirective}${seriousnessDirective}${emotionDirective} No text, no watermarks.`;
    }
    return `ART STYLE: ${styleDirective}. Portrait of ${anchoredSubject}.${appearanceDirective}${compositionTail}${darkDirective}${seriousnessDirective}${emotionDirective} No text, no watermarks, no borders.`;
  }

  const isHumanoid = isHumanoidSpecies(species);
  const speciesDesc = isHumanoid ? HUMANOID_SPECIES_TRAITS[species] : (typeof species === 'string' ? species.trim() : '') || 'mysterious creature';
  const parsedAge = Number(age);
  const ageDirective = Number.isFinite(parsedAge) ? `, approximately ${Math.max(1, Math.round(parsedAge))} years old` : '';
  // Creature mode skips clothing/gear since non-humanoid creatures don't wear
  // human gear; the role/career still rides in as a flavour phrase ("herald
  // of change") rather than a wardrobe directive.
  const career = careerName
    ? (isHumanoid ? `, dressed as a ${careerName} with appropriate gear and attire` : `, ${careerName}`)
    : '';

  if (!isHumanoid) {
    const creatureSubject = `fantasy creature: ${speciesDesc}${ageDirective}${career}, head and shoulders portrait, no humanoid figure unless inherent to the species`;

    if (isSdWebui) {
      const extraTags = [
        'fantasy creature',
        ...getSdEmotionTags(extras.emotions),
      ].filter(Boolean);
      return buildSdPrompt({
        subject: `close-up portrait of a ${speciesDesc}${ageDirective}${career}, head and shoulders`,
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
      return `ART STYLE: ${styleDirective}. Close-up portrait of a ${creatureSubject}. Sharp focus on the subject, intricate natural detail, moody atmospheric background.${darkDirective}${seriousnessDirective}${emotionDirective} No text, no watermarks.`;
    }

    if (isGemini) {
      return `Generate an image in this EXACT art style: ${styleDirective}. Portrait of a ${creatureSubject}. Sharp focus, dark atmospheric background. Square 1:1 aspect ratio.${darkDirective}${seriousnessDirective}${emotionDirective} No text, no watermarks.`;
    }

    if (provider === 'gpt-image') {
      return `ART STYLE: ${styleDirective}. Portrait of a ${creatureSubject}. Sharp focus on the subject, intricate natural detail, moody atmospheric background.${darkDirective}${seriousnessDirective}${emotionDirective} No text, no watermarks.`;
    }

    return `ART STYLE: ${styleDirective}. Portrait of a ${creatureSubject}. Sharp focus, dark atmospheric background.${darkDirective}${seriousnessDirective}${emotionDirective} No text, no watermarks, no borders.`;
  }

  // When we have a reference photo going into plain img2img (A1111 / Stability
  // without IP-Adapter), the init image pulls the result toward the uploaded
  // photo's styling — modern clothes, phone-photo lighting, indoor background.
  // Prepend weighted fantasy anchors (A1111 weighting syntax works on both
  // sd-webui and Stability SDXL) to keep the final image squarely in genre.
  const fantasyAnchor = hasReferenceImage
    ? `(fantasy character portrait:1.4), (epic fantasy illustration:1.3), (fantasy ${careerName || 'adventurer'} in character:1.2), (fantasy armor and costume:1.2), `
    : '';

  if (isSdWebui) {
    // With IP-Adapter active the reference photo feeds through a separate
    // conditioning pathway — no init image bleed, so fantasy anchors and
    // likeness tags in the prompt are unnecessary. When IP-Adapter is NOT
    // available the backend falls back to img2img and these tags are still
    // harmless, so we simply skip them unconditionally for cleaner prompts.
    const sdAppearance = typeof extras.appearance === 'string' && extras.appearance.trim()
      ? `, ${extras.appearance.trim()}`
      : '';
    const sdSubject = `close-up portrait of a ${genderLabel} ${speciesDesc}${ageDirective}${career}${sdAppearance}, head and shoulders`;
    const extraTags = [
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
    return `ART STYLE: ${styleDirective}. ${fantasyAnchor}Close-up portrait of a ${genderLabel} ${speciesDesc}${ageDirective}${career}.${appearanceDirective} ${likenessDirective} Highly detailed facial features: expressive eyes with visible iris detail, defined nose and lips, skin imperfections, scars and character lines. Sharp focus on the face, intricate costume, moody atmospheric background, head and shoulders composition.${darkDirective}${seriousnessDirective}${emotionDirective} No text, no watermarks.`;
  }

  if (isGemini) {
    return `Generate an image in this EXACT art style: ${styleDirective}. Portrait of a ${genderLabel} ${speciesDesc}${ageDirective}${career}.${appearanceDirective} ${likenessDirective} Detailed face with expressive eyes, sharp focus, head and shoulders composition, dark atmospheric background.${darkDirective}${seriousnessDirective}${emotionDirective} Square 1:1 aspect ratio. No text, no watermarks.`;
  }

  if (provider === 'gpt-image') {
    return `ART STYLE: ${styleDirective}. Portrait of a ${genderLabel} ${speciesDesc}${ageDirective}${career}.${appearanceDirective} ${likenessDirective} Highly detailed facial features: expressive eyes with visible iris detail, defined nose and lips, skin texture and character. Sharp focus on the face, intricate costume details, moody atmospheric background, head and shoulders composition.${darkDirective}${seriousnessDirective}${emotionDirective} No text, no watermarks.`;
  }

  return `ART STYLE: ${styleDirective}. Portrait of a ${genderLabel} ${speciesDesc}${ageDirective}${career}.${appearanceDirective} Detailed face, expressive eyes, sharp focus, head and shoulders composition, dark atmospheric background.${darkDirective}${seriousnessDirective}${emotionDirective} No text, no watermarks, no borders.`;
}
