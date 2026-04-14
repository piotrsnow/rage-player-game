import { callAIJson, parseJsonOrNull } from './aiJsonCall.js';

function buildObjectiveVerificationPrompt(storyContext, questName, questDescription, objectiveDescription, language) {
  const lang = language === 'pl' ? 'Polish' : 'English';
  return {
    system: 'You are an impartial story analyst for a tabletop RPG game. Your job is to determine whether a specific quest objective has been fulfilled based on the events that occurred in the story. Analyze the provided story context carefully and objectively. Respond with ONLY valid JSON.',
    user: `Analyze the following story to determine if the quest objective has been fulfilled.

STORY CONTEXT:
${storyContext}

QUEST: ${questName}
Quest description: ${questDescription}

OBJECTIVE TO VERIFY: "${objectiveDescription}"

Has this specific objective been fulfilled based on the story events? Consider partial or indirect fulfillment as well — if the spirit of the objective has been met, it counts as fulfilled.

Respond with ONLY valid JSON:
{"fulfilled": true or false, "reasoning": "A brief 1-2 sentence explanation in ${lang} of why the objective is or is not fulfilled based on story events."}`,
  };
}

export async function verifyObjective({
  storyContext,
  questName,
  questDescription,
  objectiveDescription,
  language = 'en',
  provider = 'openai',
  model = null,
  modelTier = 'premium',
  userApiKeys = null,
}) {
  const prompts = buildObjectiveVerificationPrompt(storyContext, questName, questDescription, objectiveDescription, language);
  const { text, usage } = await callAIJson({
    provider,
    model,
    modelTier,
    systemPrompt: prompts.system,
    userPrompt: prompts.user,
    maxTokens: 500,
    temperature: 0.3,
    userApiKeys,
  });

  const parsed = parseJsonOrNull(text);
  if (parsed && typeof parsed === 'object' && typeof parsed.fulfilled === 'boolean') {
    return {
      result: {
        fulfilled: parsed.fulfilled,
        reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
      },
      usage,
    };
  }

  return {
    result: {
      fulfilled: false,
      reasoning: language === 'pl'
        ? 'Tryb degradacji: nie udało się bezpiecznie zweryfikować celu.'
        : 'Degraded mode: objective could not be safely verified.',
      meta: { degraded: true, reason: 'objective_schema_validation_failed' },
    },
    usage,
  };
}
