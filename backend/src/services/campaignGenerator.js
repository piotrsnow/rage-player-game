import { requireServerApiKey } from './apiKeyService.js';
import { parseProviderError } from './aiErrors.js';
import { config } from '../config.js';

export async function generateCampaignStream(settings, { provider = 'openai', model = null, language = 'en', userApiKeys = null } = {}, onEvent) {
  const resolvedProvider = provider === 'anthropic' ? 'anthropic' : 'openai';
  const apiKey = requireServerApiKey(resolvedProvider, userApiKeys, resolvedProvider === 'anthropic' ? 'Anthropic' : 'OpenAI');
  const resolvedModel = model || config.aiModels.premium[resolvedProvider];

  const systemPrompt = 'You are a master RPG campaign designer. Create rich, immersive campaign foundations that draw players into the story. Always respond with valid JSON only.';
  const userPrompt = buildCampaignCreationPrompt(settings, language);

  try {
    const streamFn = resolvedProvider === 'anthropic' ? callAnthropicStreaming : callOpenAIStreaming;
    const accumulated = await streamFn(
      systemPrompt,
      userPrompt,
      { model: resolvedModel, maxTokens: 8000, apiKey },
      (text) => onEvent({ type: 'chunk', text }),
    );

    const parsed = parseResponse(accumulated);
    onEvent({ type: 'complete', data: parsed });
  } catch (err) {
    onEvent({ type: 'error', error: err.message || 'Campaign generation failed', code: err.code || 'STREAM_ERROR' });
  }
}

function parseResponse(text) {
  if (!text) throw new Error('Empty AI response');
  // Anthropic likes wrapping responses in ```json ... ``` even when the
  // prompt asks for plain JSON. Strip both the opening fence and the
  // closing fence independently so we survive truncated outputs that
  // never reached the closing ```.
  let jsonStr = text.trim();
  jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, '');
  jsonStr = jsonStr.replace(/\n?```\s*$/, '');
  try {
    return JSON.parse(jsonStr);
  } catch (err) {
    // Give callers actionable context on a truncated-response failure
    // (happens when maxTokens is too low for the prompt). The raw
    // message from JSON.parse is useless without this framing.
    const suffix = jsonStr.slice(-80).replace(/\s+/g, ' ');
    const hint = `Model response failed to parse. Likely truncated mid-generation (maxTokens cap). Tail: "…${suffix}"`;
    throw new Error(`${hint} — ${err.message}`);
  }
}

async function callOpenAIStreaming(systemPrompt, userPrompt, { model, maxTokens = 8000, apiKey } = {}, onChunk) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.8,
      max_completion_tokens: maxTokens,
      response_format: { type: 'json_object' },
      stream: true,
    }),
  });

  if (!response.ok) await parseProviderError(response, 'openai');

  let accumulated = '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const rawLine of lines) {
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (!data || data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta;
        if (!delta) continue;
        let text = '';
        if (typeof delta.content === 'string') text = delta.content;
        else if (Array.isArray(delta.content)) {
          for (const part of delta.content) {
            if (typeof part === 'string') text += part;
            else if (part && typeof part.text === 'string') text += part.text;
          }
        }
        if (text) {
          accumulated += text;
          onChunk(text);
        }
      } catch { /* skip malformed */ }
    }
  }

  if (buffer.startsWith('data: ')) {
    const data = buffer.slice(6);
    if (data && data !== '[DONE]') {
      try {
        const parsed = JSON.parse(data);
        const text = parsed.choices?.[0]?.delta?.content;
        if (typeof text === 'string' && text) {
          accumulated += text;
          onChunk(text);
        }
      } catch { /* skip */ }
    }
  }

  return accumulated;
}

async function callAnthropicStreaming(systemPrompt, userPrompt, { model, maxTokens = 8000, apiKey } = {}, onChunk) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt + '\n\nRespond with ONLY valid JSON, no other text.' }],
      temperature: 0.8,
      stream: true,
    }),
  });

  if (!response.ok) await parseProviderError(response, 'anthropic');

  let accumulated = '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const rawLine of lines) {
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
      if (!line.startsWith('data: ')) continue;
      try {
        const parsed = JSON.parse(line.slice(6));
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          accumulated += parsed.delta.text;
          onChunk(parsed.delta.text);
        }
      } catch { /* skip */ }
    }
  }

  return accumulated;
}

// Scales quest/NPC/world density with the campaign-length slider.
// Medium mirrors the values the prompt used before the slider was wired in.
const LENGTH_PARAMS = {
  Short: {
    objectives: '5-7',
    npcs: '3-5',
    questItems: '2-3',
    worldFacts: '3-5',
    npcMeetings: 2,
    itemRetrieval: 1,
    locationExplore: 1,
    combat: 1,
    puzzle: 1,
    actsDescription: '3 acts: 5/7/3',
    actsJson: '[{"number": 1, "name": "Setup", "targetScenes": 5, "description": "Introduce the world, characters, and central conflict"},{"number": 2, "name": "Confrontation", "targetScenes": 7, "description": "Escalate the conflict, raise the stakes"},{"number": 3, "name": "Climax", "targetScenes": 3, "description": "Final confrontation and resolution"}]',
    totalScenes: 15,
  },
  Medium: {
    objectives: '9-12',
    npcs: '5-8',
    questItems: '3-5',
    worldFacts: '5-7',
    npcMeetings: 4,
    itemRetrieval: 2,
    locationExplore: 1,
    combat: 1,
    puzzle: 1,
    actsDescription: '3 acts: 8/12/5',
    actsJson: '[{"number": 1, "name": "Setup", "targetScenes": 8, "description": "Introduce the world, characters, and central conflict"},{"number": 2, "name": "Confrontation", "targetScenes": 12, "description": "Escalate the conflict, raise the stakes"},{"number": 3, "name": "Climax", "targetScenes": 5, "description": "Final confrontation and resolution"}]',
    totalScenes: 25,
  },
  Long: {
    objectives: '13-17',
    npcs: '7-10',
    questItems: '5-7',
    worldFacts: '8-10',
    npcMeetings: 6,
    itemRetrieval: 3,
    locationExplore: 2,
    combat: 2,
    puzzle: 2,
    actsDescription: '3 acts: 12/18/10',
    actsJson: '[{"number": 1, "name": "Setup", "targetScenes": 12, "description": "Introduce the world, characters, and central conflict"},{"number": 2, "name": "Confrontation", "targetScenes": 18, "description": "Escalate the conflict, raise the stakes"},{"number": 3, "name": "Climax", "targetScenes": 10, "description": "Final confrontation and resolution"}]',
    totalScenes: 40,
  },
};

function buildCampaignCreationPrompt(settings, language = 'en') {
  const lp = LENGTH_PARAMS[settings.length] || LENGTH_PARAMS.Medium;

  const langInstruction = language === 'pl'
    ? '\n\nIMPORTANT: Write ALL text content (name, worldDescription, hook, character backstory, narrative, quest names, quest descriptions, quest completion conditions, quest objectives, world facts, suggested actions) in Polish.'
    : '';

  const characterNameLine = settings.characterName?.trim()
    ? `- Player's character name: "${settings.characterName.trim()}" (use this exact name for the character)`
    : '- Player\'s character name: not specified (suggest a fitting name)';

  const speciesLine = settings.species
    ? `- Character species: ${settings.species}`
    : '- Character species: not specified (suggest a fitting species — Human, Halfling, Dwarf, High Elf, or Wood Elf)';

  const existingCharNote = settings.existingCharacter
    ? `\n\nIMPORTANT: The player is using a PRE-EXISTING character named "${settings.characterName?.trim() || settings.existingCharacter.name}". Do NOT rename this character or invent a different name. Use this exact name consistently in the firstScene dialogueSegments.`
    : '';

  const humorousToneGuidance = settings.tone === 'Humorous'
    ? `\n\nHUMOROUS TONE GUIDELINES: The humor must NOT rely on random absurdity, slapstick, or zaniness. Ground the campaign in a believable world and derive comedy from character flaws, social misunderstandings, irony, awkward situations, and moral dilemmas. Keep wit sharp but varied. Avoid repeating one joke template or one recurring comparison (for example constant tax/tax-collector jokes).`
    : '';

  // sceneGrid is only rendered when the user has `sceneVisualization: 'map'`
  // in app settings. Skip generating it otherwise — the field easily adds
  // 500-1000 output tokens (tiles + entities) and is discarded on the FE
  // for users on image/3d/canvas/none modes.
  const wantsSceneGrid = settings.sceneVisualization === 'map';
  const sceneGridSchema = wantsSceneGrid
    ? `,
    "sceneGrid": {
      "width": 12,
      "height": 12,
      "tiles": [["W","W","W","W"],["W","P","F","E"],["W","F","I","W"],["W","W","W","W"]],
      "entities": [
        {"name": "Player Name", "type": "player", "x": 1, "y": 1, "marker": "@"},
        {"name": "NPC Name", "type": "npc", "x": 2, "y": 2, "marker": "N"}
      ]
    }`
    : '';
  const sceneGridInstruction = wantsSceneGrid
    ? '\nThe firstScene.sceneGrid field is MANDATORY: include a coherent 2D board (8-16 width/height), valid tiles, and entity coordinates for player + visible NPCs.'
    : '';

  // G1 — encounter tier cap (passed from creator form / useGameState).
  // Maps to plainspoken guidance so the worldDescription/hook generator
  // avoids setting up boss-tier conflicts the scene pipeline will later
  // refuse to escalate. 'deadly' is unrestricted.
  const tierCap = settings.difficultyTier || 'low';
  const tierGuidance = {
    low: "'low' — enemies: bandyci/wilki/zbóje/drobne potwory. NO smoki, demony, lichowe, archmagowie, pradawne byty.",
    medium: "'medium' — adds trolle, dzikie bestie, niewielcy nieumarli, sekty kultystów. Smoki/archmagi as distant threats only.",
    high: "'high' — adds elitarni wrogowie, silne sekty, regionalni bossowie. Smoki/demony allowed but as climax encounters.",
    deadly: "'deadly' — unrestricted: smoki, archmagi, pradawne byty, lichowie.",
  }[tierCap] || "'low' — enemies: bandyci/wilki/zbóje.";

  return `Create a new RPGon campaign with these parameters:
- Genre: ${settings.genre}
- Tone: ${settings.tone}
- Play Style: ${settings.style}
- Difficulty: ${settings.difficulty}
- Campaign Length: ${settings.length}
- Encounter Tier: ${tierGuidance}
${characterNameLine}
${speciesLine}
- Player's story idea: "${settings.storyPrompt}"
${langInstruction}${existingCharNote}${humorousToneGuidance}

Generate the campaign foundation. The game uses the RPGon custom RPG system with 6 attributes (scale 1-25): Sila (Strength), Inteligencja (Intelligence), Charyzma (Charisma), Zrecznosc (Dexterity), Wytrzymalosc (Endurance), Szczescie (Luck). Plus Mana as a magic resource.

Respond with ONLY valid JSON:
{
  "name": "A compelling campaign name (3-5 words)",
  "worldDescription": "2-3 paragraphs describing the world, its history, and current state",
  "hook": "1-2 paragraphs presenting the story hook that draws the player into the adventure",
  "characterSuggestion": {
    "backstory": "2-3 sentences of character backstory tied to the campaign world (only if player didn't provide one)",
    "inventory": [{"id": "item_1", "name": "Lantern", "type": "gear", "description": "A brass miner's lantern with soot on the shutter.", "rarity": "common"}]
  },
  "firstScene": {
    "dialogueSegments": [
      {"type": "narration", "text": "Descriptive prose..."},
      {"type": "dialogue", "character": "NPC Name", "gender": "male", "text": "What they say..."}
    ],
    "soundEffect": "Short English ambient sound description or null",
    "musicPrompt": "Short English description of ideal instrumental background music for the opening scene",
    "imagePrompt": "Short ENGLISH visual description of the scene for AI image generation (max 200 chars)"${sceneGridSchema},
    "atmosphere": {
      "weather": "clear | rain | snow | storm | fog | fire",
      "particles": "magic_dust | sparks | embers | arcane | none",
      "mood": "mystical | dark | peaceful | tense | chaotic",
      "lighting": "natural | night | dawn | bright | rays | candlelight | moonlight",
      "transition": "fade"
    },
    "suggestedActions": ${language === 'pl' ? '["Rozglądam się i oceniam sytuację", "Witam najbliższą osobę i przedstawiam się", "Milczę i obserwuję", "Kieruję się w stronę najbardziej interesującego tropu"]' : '["I look around and take in the situation", "I greet the nearest person and introduce myself", "I keep quiet and observe", "I head toward the most interesting lead I can see"]'},
    "journalEntries": ["Concise 1-2 sentence summary of a key event from the opening scene"]
  },
  "initialQuest": {
    "name": "${language === 'pl' ? 'Nazwa głównego zadania' : 'Main quest name'}",
    "description": "${language === 'pl' ? 'Rozbudowany opis zadania z kontekstem fabularnym' : 'Detailed quest description with story context'}",
    "completionCondition": "${language === 'pl' ? 'Co trzeba zrobić, aby ukończyć to zadanie' : 'What must be done to complete this quest'}",
    "type": "main",
    "questGiverId": "${language === 'pl' ? 'Imię NPC zlecającego' : 'Quest giver NPC name'}",
    "turnInNpcId": "${language === 'pl' ? 'Imię NPC do zdania raportu' : 'NPC name to report completion to'}",
    "locationId": "${language === 'pl' ? 'Główna lokalizacja zadania' : 'Main quest location'}",
    "reward": {
      "xp": 200,
      "money": {"gold": 5, "silver": 10, "copper": 0},
      "items": [{"id": "reward_1", "name": "${language === 'pl' ? 'Nazwa nagrody' : 'Reward item name'}", "type": "weapon|armor|trinket|consumable", "description": "${language === 'pl' ? 'Opis nagrody' : 'Reward item description'}", "rarity": "uncommon"}]
    },
    "objectives": [
      {"id": "obj_1", "description": "${language === 'pl' ? 'Spotkaj się z NPC_1 w lokalizacji_1 — dowiedz się o problemie' : 'Meet NPC_1 at location_1 — learn about the problem'}"},
      {"id": "obj_2", "description": "${language === 'pl' ? 'Zbierz informacje od NPC_2 w lokalizacji_2' : 'Gather information from NPC_2 at location_2'}"},
      {"id": "obj_3", "description": "${language === 'pl' ? 'Zdobądź kluczowy przedmiot (qitem_1) z lokalizacji_3' : 'Obtain key item (qitem_1) from location_3'}"},
      {"id": "obj_4", "description": "${language === 'pl' ? 'Przeszukaj lokalizację_4 w poszukiwaniu wskazówek' : 'Search location_4 for clues'}"},
      {"id": "obj_5", "description": "${language === 'pl' ? 'Porozmawiaj z NPC_3 — przekonaj go do pomocy' : 'Talk to NPC_3 — convince them to help'}"},
      {"id": "obj_6", "description": "${language === 'pl' ? 'Dostarcz przedmiot (qitem_2) do NPC_4 w lokalizacji_5' : 'Deliver item (qitem_2) to NPC_4 at location_5'}"},
      {"id": "obj_7", "description": "${language === 'pl' ? 'Zmierz się z przeszkodą lub wrogiem w lokalizacji_6' : 'Face an obstacle or enemy at location_6'}"},
      {"id": "obj_8", "description": "${language === 'pl' ? 'Użyj zdobytej wiedzy/przedmiotu aby rozwiązać zagadkę' : 'Use acquired knowledge/item to solve the puzzle'}"},
      {"id": "obj_9", "description": "${language === 'pl' ? 'Wróć do zleceniodawcy z dowodem wykonania zadania' : 'Return to quest giver with proof of completion'}"}
    ],
    "questItems": [
      {"id": "qitem_1", "name": "${language === 'pl' ? 'Nazwa przedmiotu 1' : 'Item 1 name'}", "type": "key_item|document|artifact|tool|ingredient", "description": "${language === 'pl' ? 'Co to jest i dlaczego jest ważne' : 'What it is and why it matters'}", "relatedObjectiveId": "obj_3", "location": "${language === 'pl' ? 'Gdzie go znaleźć lub kto go posiada' : 'Where to find it or who has it'}"},
      {"id": "qitem_2", "name": "${language === 'pl' ? 'Nazwa przedmiotu 2' : 'Item 2 name'}", "type": "key_item|document|artifact|tool|ingredient", "description": "${language === 'pl' ? 'Co to jest i dlaczego jest ważne' : 'What it is and why it matters'}", "relatedObjectiveId": "obj_6", "location": "${language === 'pl' ? 'Gdzie go znaleźć lub kto go posiada' : 'Where to find it or who has it'}"},
      {"id": "qitem_3", "name": "${language === 'pl' ? 'Nazwa przedmiotu 3' : 'Item 3 name'}", "type": "key_item|document|artifact|tool|ingredient", "description": "${language === 'pl' ? 'Co to jest i dlaczego jest ważne' : 'What it is and why it matters'}", "relatedObjectiveId": "obj_8", "location": "${language === 'pl' ? 'Gdzie go znaleźć lub kto go posiada' : 'Where to find it or who has it'}"}
    ]
  },
  "initialNPCs": [
    {"name": "NPC_1 full name", "gender": "male|female", "role": "${language === 'pl' ? 'rola fabularna (np. zleceniodawca, informator, kupiec)' : 'story role (e.g. quest giver, informant, merchant)'}", "personality": "${language === 'pl' ? 'Krótki opis osobowości' : 'Brief personality description'}", "location": "${language === 'pl' ? 'Gdzie można go znaleźć' : 'Where they can be found'}", "attitude": "friendly|neutral|hostile|suspicious", "relatedObjectiveIds": ["obj_1"]},
    {"name": "NPC_2 full name", "gender": "male|female", "role": "...", "personality": "...", "location": "...", "attitude": "...", "relatedObjectiveIds": ["obj_2"]},
    {"name": "NPC_3 full name", "gender": "male|female", "role": "...", "personality": "...", "location": "...", "attitude": "...", "relatedObjectiveIds": ["obj_5"]},
    {"name": "NPC_4 full name", "gender": "male|female", "role": "...", "personality": "...", "location": "...", "attitude": "...", "relatedObjectiveIds": ["obj_6"]},
    {"name": "NPC_5 full name", "gender": "male|female", "role": "...", "personality": "...", "location": "...", "attitude": "...", "relatedObjectiveIds": ["obj_7"]}
  ],
  "initialWorldFacts": ["Fact 1 about the world", "Fact 2", "Fact 3", "Fact 4", "Fact 5"],
  "campaignStructure": {
    "acts": ${lp.actsJson},
    "currentAct": 1,
    "totalTargetScenes": ${lp.totalScenes}
  }
}

CAMPAIGN LENGTH: "${settings.length}" → target ~${lp.totalScenes} scenes (${lp.actsDescription}). All quest/NPC/world-fact counts below are scaled for this length.

IMPORTANT for campaignStructure:
- Use the act structure for length "${settings.length}": ${lp.actsDescription}, totalTargetScenes = ${lp.totalScenes}.
- Each act needs a name, target scene count, and brief description of its narrative purpose.
- totalTargetScenes must equal the sum of all act target scenes.

IMPORTANT for initialQuest and initialNPCs:
- The initialQuest MUST have ${lp.objectives} objectives forming a coherent multi-step story arc — NOT generic placeholders.
- Mix objective types: NPC conversations/meetings (at least ${lp.npcMeetings}), item retrieval (at least ${lp.itemRetrieval}), location exploration/investigation (at least ${lp.locationExplore}), combat/confrontation (at least ${lp.combat}), puzzle/skill challenge (at least ${lp.puzzle}).
- Each objective referencing an NPC meeting MUST correspond to a named NPC in initialNPCs. Use the NPC's actual name in the objective description.
- Each objective referencing an item MUST correspond to an entry in questItems. Use the item's actual name in the objective description.
- Objectives should follow a logical narrative order: early objectives involve gathering information and allies, middle objectives involve acquiring items and overcoming obstacles, late objectives involve confrontation and resolution.
- initialNPCs must contain ${lp.npcs} unique NPCs with distinct names, roles, personalities, and locations. Spread them across different locations in the starting area.
- Each NPC's relatedObjectiveIds must list the objective IDs they are involved in.
- questItems must contain ${lp.questItems} items that are central to the quest. Each item must have a relatedObjectiveId linking it to the objective where it's obtained or used.
- questItems represent things to find/acquire during the quest — they are NOT in the player's inventory at the start.
- reward.items should include at least one meaningful reward item (weapon, armor, trinket, or special item).
- initialWorldFacts should include ${lp.worldFacts} facts that establish the world context relevant to the quest.
- The quest giver NPC (questGiverId) MUST be one of the NPCs in initialNPCs.

IMPORTANT for characterSuggestion:
- The player already has a character with stats/skills/money. Do NOT generate attributes, skills, mana, or money.
- The player ALSO receives a fixed starter kit from the engine (hand weapon, leather jerkin armour, backpack, waterskin, 1 day rations). Do NOT include any of these — they are guaranteed.
- Inventory should contain 0-2 flavor items that tie the character to the campaign hook (e.g. miner's lantern, herbalist's pouch, letter of introduction, signet ring, masterwork chisel, spyglass). NOT weapons, NOT armour, NOT generic adventuring gear — those are already covered by the starter kit.
- If no flavor item fits the campaign naturally, return an empty inventory array. Quality over quantity.
- Include backstory ONLY if it adds campaign-specific context the player wouldn't have written themselves.

There is NO separate "narrative" field — all scene prose lives in dialogueSegments.
The dialogueSegments array must cover the full opening scene broken into narration and dialogue chunks. Narration segments must NEVER contain quoted speech — always split dialogue into separate "dialogue" segments. Every dialogue segment MUST have a "gender" field ("male" or "female").${sceneGridInstruction}

IMPORTANT for firstScene stateChanges (if included) or top-level initialMapMode: Include "mapMode" in the firstScene's context. The opening scene should establish the field-map mode: "trakt" (road/path), "pola" (open fields), "wnetrze" (interior), or "las" (forest). If the scene starts in a tavern, set "wnetrze"; if on a road, set "trakt"; if in a forest, set "las"; if in open countryside, set "pola".`;
}
