import { callAIJson, parseJsonOrNull } from './aiJsonCall.js';

const RECAP_SCENE_CHUNK_SIZE = 25;
const RECAP_MAX_TOKENS = 4000;

function stringifyScene(scene, index) {
  const narr = typeof scene?.narrative === 'string' ? scene.narrative : '';
  const action = typeof scene?.chosenAction === 'string' ? scene.chosenAction : '';
  const dialogue = Array.isArray(scene?.dialogueSegments)
    ? scene.dialogueSegments.map((seg) => {
        if (!seg) return '';
        if (seg.type === 'dialogue') return `${seg.character || 'NPC'}: ${seg.text || ''}`;
        return seg.text || '';
      }).filter(Boolean).join(' ')
    : '';
  const body = dialogue || narr;
  const actionLine = action ? `> ${action}\n` : '';
  return `SCENE ${index + 1}:\n${actionLine}${body}`.trim();
}

function chunkScenes(scenes, chunkSize) {
  if (!Array.isArray(scenes) || scenes.length === 0) return [];
  const chunks = [];
  for (let i = 0; i < scenes.length; i += chunkSize) {
    chunks.push(scenes.slice(i, i + chunkSize));
  }
  return chunks;
}

function normalizeRecapNarrative(text) {
  const raw = typeof text === 'string' ? text.trim() : '';
  if (!raw) return '';
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const listPattern = /^([-*•]|\d+[.)])\s+/;
  const headingPattern = /^#{1,6}\s+/;
  const hasListFormatting = lines.some((line) => listPattern.test(line) || headingPattern.test(line));
  if (!hasListFormatting) return raw;
  return lines
    .map((line) => line.replace(headingPattern, '').replace(listPattern, '').trim())
    .filter(Boolean)
    .join('\n\n');
}

function buildRecapSystemPrompt(language, sceneChunk, startIndex) {
  const header = `You are a master storyteller generating a recap for a tabletop RPG campaign.
Your job is to summarize the events below into a narrative recap in the requested style.

${language === 'pl' ? 'Napisz streszczenie w języku polskim.' : 'Write the recap in English.'}

SCENE HISTORY:`;
  const body = sceneChunk.map((s, i) => stringifyScene(s, startIndex + i)).join('\n\n---\n\n');
  return `${header}\n\n${body}`;
}

function buildRecapUserPrompt(language, options, sceneCount) {
  const sentencesPerSceneRaw = Number(options.sentencesPerScene);
  const sentencesPerScene = Number.isFinite(sentencesPerSceneRaw)
    ? Math.max(0.25, Math.min(4, sentencesPerSceneRaw))
    : 1;
  const summaryStyle = options.summaryStyle && typeof options.summaryStyle === 'object' ? options.summaryStyle : {};
  const mode = ['story', 'dialogue', 'poem', 'report'].includes(summaryStyle.mode) ? summaryStyle.mode : 'story';
  const literaryStyle = Math.max(0, Math.min(100, Number(summaryStyle.literaryStyle ?? 50)));
  const dramaticity = Math.max(0, Math.min(100, Number(summaryStyle.dramaticity ?? 50)));
  const factuality = Math.max(0, Math.min(100, Number(summaryStyle.factuality ?? 50)));
  const dialogueParticipants = Math.max(2, Math.min(6, Math.round(Number(summaryStyle.dialogueParticipants ?? 3))));
  const targetSentenceCount = Math.max(1, Math.round(sceneCount * sentencesPerScene));
  const poemTargetLineCount = Math.max(2, targetSentenceCount * 2);

  const modeRule = mode === 'dialogue'
    ? `MODE: Dialogue recap. Write the recap as a conversation between exactly ${dialogueParticipants} distinct speakers discussing what happened. Keep speaker names short (e.g., "A:", "B:") and preserve chronological order.`
    : mode === 'poem'
      ? `MODE: Strongly rhymed poem. Write the recap as a playful, energetic poem preserving facts and chronology. Use clear end-rhymes in almost every line.`
      : mode === 'report'
        ? 'MODE: Report. Write a concise factual report: fact after fact, minimal embellishment, clear causal links.'
        : 'MODE: Story. Write as a flowing narrative recap.';

  const lengthRule = mode === 'poem'
    ? `Write exactly ${poemTargetLineCount} non-empty poetic lines in total. Scene count: ${sceneCount}. Density: ${sentencesPerScene} line(s) per scene.`
    : `Write exactly ${targetSentenceCount} sentences. Scene count: ${sceneCount}. Density: ${sentencesPerScene} sentence(s) per scene.`;

  return `Generate a "Previously on..." recap of the campaign so far.

STYLE:
${modeRule}
- Literary style intensity: ${literaryStyle}/100.
- Dramaticity: ${dramaticity}/100.
- Factuality: ${factuality}/100.
- Preserve key facts, outcomes, and timeline continuity.

LENGTH:
${lengthRule}

Respond with ONLY valid JSON: {"recap": "The recap text..."}`;
}

function buildRecapMergePrompt(language, partialRecaps, options, totalSceneCount) {
  const base = buildRecapUserPrompt(language, options, totalSceneCount);
  const partsBlock = partialRecaps
    .map((part, idx) => `PART ${idx + 1}:\n${part}`)
    .join('\n\n');
  return `${base}

You are combining partial recaps generated from sequential scene chunks.
- Merge all parts into one cohesive recap.
- Keep strict chronological flow from PART 1 to the last PART.
- Remove duplicated events when they overlap between neighboring parts.

PARTIAL RECAPS (in chronological order):
${partsBlock}`;
}

export async function generateRecap({
  scenes,
  language = 'en',
  provider = 'openai',
  model = null,
  modelTier = 'premium',
  sentencesPerScene = 1,
  summaryStyle = null,
  userApiKeys = null,
}) {
  const allScenes = Array.isArray(scenes) ? scenes : [];
  const totalSceneCount = allScenes.length;

  if (totalSceneCount === 0) {
    return {
      result: {
        recap: language === 'pl'
          ? 'Historia dopiero się zaczyna — jeszcze nic się nie wydarzyło.'
          : 'The story is only beginning — nothing has happened yet.',
      },
      usage: null,
    };
  }

  const runSingleRecap = async (sceneChunk, startIndex, chunkCount) => {
    const systemPrompt = buildRecapSystemPrompt(language, sceneChunk, startIndex);
    const userPrompt = buildRecapUserPrompt(language, { sentencesPerScene, summaryStyle }, chunkCount);
    const { text, usage } = await callAIJson({
      provider,
      model,
      modelTier,
      systemPrompt,
      userPrompt,
      maxTokens: RECAP_MAX_TOKENS,
      temperature: 0.7,
      userApiKeys,
    });
    const parsed = parseJsonOrNull(text);
    const recap = parsed && typeof parsed.recap === 'string'
      ? normalizeRecapNarrative(parsed.recap)
      : '';
    return { recap, usage };
  };

  if (totalSceneCount <= RECAP_SCENE_CHUNK_SIZE) {
    const { recap, usage } = await runSingleRecap(allScenes, 0, totalSceneCount);
    if (recap) return { result: { recap }, usage };
    return {
      result: {
        recap: language === 'pl'
          ? 'Dotąd: bohater przemierza niebezpieczny świat, a konsekwencje decyzji zaczynają się kumulować.'
          : 'So far: the hero moves through a dangerous world, and consequences of prior choices are mounting.',
        meta: { degraded: true, reason: 'recap_schema_validation_failed' },
      },
      usage,
    };
  }

  // Chunked path.
  const chunks = chunkScenes(allScenes, RECAP_SCENE_CHUNK_SIZE);
  const partialRecaps = [];
  let combinedUsage = null;
  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    const startIndex = i * RECAP_SCENE_CHUNK_SIZE;
    const { recap, usage } = await runSingleRecap(chunk, startIndex, chunk.length);
    combinedUsage = mergeUsage(combinedUsage, usage);
    if (!recap) {
      return {
        result: {
          recap: language === 'pl'
            ? `Nie udało się wygenerować streszczenia dla paczki scen ${i + 1}/${chunks.length}.`
            : `Failed to generate recap for scene chunk ${i + 1}/${chunks.length}.`,
          meta: { degraded: true, reason: `recap_chunk_${i + 1}_failed` },
        },
        usage: combinedUsage,
      };
    }
    partialRecaps.push(recap);
  }

  if (partialRecaps.length === 1) {
    return { result: { recap: partialRecaps[0] }, usage: combinedUsage };
  }

  // Merge step.
  const mergeSystem = 'You are a master storyteller combining partial RPG campaign recaps into one cohesive narrative.';
  const mergeUser = buildRecapMergePrompt(language, partialRecaps, { sentencesPerScene, summaryStyle }, totalSceneCount);
  const { text, usage } = await callAIJson({
    provider,
    model,
    modelTier,
    systemPrompt: mergeSystem,
    userPrompt: mergeUser,
    maxTokens: RECAP_MAX_TOKENS,
    temperature: 0.7,
    userApiKeys,
  });
  combinedUsage = mergeUsage(combinedUsage, usage);

  const parsed = parseJsonOrNull(text);
  const merged = parsed && typeof parsed.recap === 'string' ? normalizeRecapNarrative(parsed.recap) : '';
  if (merged) return { result: { recap: merged }, usage: combinedUsage };

  return {
    result: {
      recap: partialRecaps.join('\n\n'),
      meta: { degraded: true, reason: 'recap_merge_failed_using_concat' },
    },
    usage: combinedUsage,
  };
}

function mergeUsage(a, b) {
  if (!a) return b;
  if (!b) return a;
  const out = { ...a };
  for (const key of Object.keys(b)) {
    if (typeof b[key] === 'number') {
      out[key] = (a[key] || 0) + b[key];
    }
  }
  return out;
}
