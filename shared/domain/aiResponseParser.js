// Shared JSON extraction + lean parser for AI responses.
// Used by FE (src/services/aiResponse/parse.js) and BE (sceneGenerator/streamingClient.js).

/**
 * Safely extract a JSON object from raw AI output.
 * Accepts: already-parsed object, raw JSON string, or text with an embedded {...} block.
 */
export function safeParseJSON(raw) {
  if (typeof raw === 'object' && raw !== null) return { ok: true, data: raw };
  try {
    return { ok: true, data: JSON.parse(raw) };
  } catch {
    const jsonMatch = String(raw).match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return { ok: true, data: JSON.parse(jsonMatch[0]) };
      } catch {
        return { ok: false, error: 'Failed to extract JSON from response' };
      }
    }
    return { ok: false, error: 'Response is not valid JSON' };
  }
}

/**
 * Strip markdown code fences (```json ... ``` or ``` ... ```) and return the inner text.
 * Returns the original text if no fence is present.
 */
export function stripMarkdownFences(text) {
  const match = String(text || '').match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  return match ? match[1] : String(text || '');
}

/**
 * Lean parser for scene-generation streaming responses.
 * Strips markdown fences, parses JSON, fills default fields.
 * Throws on empty input or invalid JSON.
 */
export function parseAIResponseLean(text) {
  if (!text) throw new Error('Empty AI response');

  const jsonStr = stripMarkdownFences(text);

  let parsed;
  try {
    parsed = JSON.parse(jsonStr.trim());
  } catch (err) {
    throw new Error(`Failed to parse AI response as JSON: ${err.message}\nResponse: ${String(text).slice(0, 500)}`);
  }

  const derivedNarrative = Array.isArray(parsed.dialogueSegments)
    ? parsed.dialogueSegments
      .filter((s) => s && s.type === 'narration' && typeof s.text === 'string')
      .map((s) => s.text.trim())
      .filter(Boolean)
      .join(' ')
    : '';

  return {
    narrative: derivedNarrative || parsed.narrative || '',
    suggestedActions: parsed.suggestedActions || ['Look around', 'Move forward', 'Wait'],
    stateChanges: parsed.stateChanges || {},
    dialogueSegments: parsed.dialogueSegments || [],
    scenePacing: parsed.scenePacing || 'exploration',
    diceRoll: parsed.diceRoll || null,
    diceRolls: Array.isArray(parsed.diceRolls) ? parsed.diceRolls : undefined,
    creativityBonus: Number.isFinite(parsed.creativityBonus) ? parsed.creativityBonus : 0,
    atmosphere: parsed.atmosphere || { weather: 'clear', mood: 'peaceful', lighting: 'natural' },
    sceneGrid: parsed.sceneGrid || null,
    imagePrompt: parsed.imagePrompt || null,
    soundEffect: parsed.soundEffect || null,
    musicPrompt: parsed.musicPrompt || null,
    questOffers: parsed.questOffers || [],
    cutscene: parsed.cutscene || null,
    dilemma: parsed.dilemma || null,
  };
}
