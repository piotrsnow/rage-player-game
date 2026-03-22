import { resolveApiKey } from './apiKeyService.js';
import { config } from '../config.js';

function buildMultiplayerSystemPrompt(gameState, settings, players, language = 'en') {
  const needsEnabled = settings.needsSystemEnabled === true;
  const playerList = players
    .map((p) => `- ${p.name} (${p.gender}, ${p.isHost ? 'host' : 'player'})`)
    .join('\n');

  const sceneHistory = (gameState.scenes || [])
    .slice(-10)
    .map((s, i) => `Scene ${i + 1}: ${s.narrative?.substring(0, 200)}...`)
    .join('\n') || 'No scenes yet - this is the beginning of the story.';

  const campaign = gameState.campaign || {};
  const world = gameState.world || {};
  const worldFacts = (world.facts || []).slice(-20).join('\n') || 'No known facts yet.';

  const npcs = world.npcs || [];
  const npcSection = npcs.length > 0
    ? npcs.map((n) => `- ${n.name} (${n.role || 'unknown'}, ${n.gender || '?'}): ${n.personality || '?'}, attitude=${n.attitude || 'neutral'}`).join('\n')
    : 'No NPCs encountered yet.';

  const currentLoc = world.currentLocation || 'Unknown';

  const charLines = (gameState.characters || []).map((c) => {
    let line = `- ${c.name} (${c.class || 'Adventurer'} Lv.${c.level || 1}): HP ${c.hp}/${c.maxHp}, Mana ${c.mana}/${c.maxMana}`;
    if (needsEnabled && c.needs) {
      const n = c.needs;
      const fmt = (k, v) => `${k}: ${v ?? 100}/100${(v ?? 100) < 15 ? ' [CRITICAL]' : (v ?? 100) < 30 ? ' [LOW]' : ''}`;
      line += `\n  Needs: ${fmt('Hunger', n.hunger)}, ${fmt('Thirst', n.thirst)}, ${fmt('Bladder', n.bladder)}, ${fmt('Hygiene', n.hygiene)}, ${fmt('Rest', n.rest)}`;
    }
    return line;
  }).join('\n') || 'No characters defined yet.';

  const needsBlock = needsEnabled ? `
NEEDS SYSTEM: ENABLED. Each character has biological needs (hunger, thirst, bladder, hygiene, rest) on a 0-100 scale (100=fully satisfied, 0=critical). Low needs should affect narrative and character behavior. When characters eat, drink, rest, bathe, or use a toilet, include needsChanges in their perCharacter entry.` : '';

  return `You are the Dungeon Master AI for a MULTIPLAYER campaign: "${campaign.name || 'Unnamed Campaign'}".

CAMPAIGN SETTINGS:
- Genre: ${settings.genre || 'Fantasy'}
- Tone: ${settings.tone || 'Epic'}
- Play Style: ${settings.style || 'Hybrid'}
- Difficulty: ${settings.difficulty || 'Normal'}

PLAYERS IN THIS SESSION:
${playerList}

WORLD DESCRIPTION:
${campaign.worldDescription || 'A mysterious world awaits discovery.'}

STORY HOOK:
${campaign.hook || 'An adventure begins...'}

CHARACTERS:
${charLines}

NPC REGISTRY:
${npcSection}

CURRENT LOCATION: ${currentLoc}

WORLD KNOWLEDGE:
${worldFacts}

SCENE HISTORY:
${sceneHistory}

LANGUAGE: Write all narrative in ${language === 'pl' ? 'Polish' : 'English'}.
${needsBlock}
MULTIPLAYER INSTRUCTIONS:
1. You are running a MULTIPLAYER session. Multiple players act simultaneously each round.
2. When resolving actions, consider ALL submitted actions together and resolve them simultaneously.
3. Describe what happens to each character individually.
4. Include per-character stateChanges so each player's HP/mana/XP/inventory can be updated independently.
5. All players see the same scene narrative.
6. Maintain fairness — give each player meaningful consequences for their actions.
7. Generate suggested actions that are generic enough for any player to take.
8. Always respond with valid JSON.`;
}

function buildMultiplayerScenePrompt(actions, isFirstScene = false, language = 'en', { needsSystemEnabled = false } = {}) {
  const langReminder = `\n\nLANGUAGE: Write narrative, dialogueSegments, suggestedActions in ${language === 'pl' ? 'Polish' : 'English'}. soundEffect, musicPrompt, imagePrompt stay in English.`;
  const needsPerCharHint = needsSystemEnabled
    ? ', "needsChanges": {"hunger": 60}'
    : '';
  const needsPerCharDoc = needsSystemEnabled
    ? '\nFor perCharacter needsChanges: use when a character satisfies a biological need (eating, drinking, toilet, bathing, resting). Value is an object of DELTAS: {"hunger": 60, "thirst": 40} means +60 hunger, +40 thirst. Typical: full meal +50-70 hunger, snack +20-30, drink +40-60 thirst, toilet +80-100 bladder, bath +60-80 hygiene, full sleep +70-90 rest, nap +20-30 rest. Omit needsChanges if no needs changed for that character.'
    : '';

  if (isFirstScene) {
    return `Generate the opening scene of this multiplayer campaign. Introduce all player characters and set the stage.

Respond with ONLY valid JSON:
{
  "narrative": "2-3 paragraphs setting the stage, introducing all characters...",
  "dialogueSegments": [
    {"type": "narration", "text": "Prose..."},
    {"type": "dialogue", "character": "NPC or Player Name", "gender": "male", "text": "..."}
  ],
  "soundEffect": "ambient sound or null",
  "musicPrompt": "background music description or null",
  "imagePrompt": "ENGLISH visual scene description (max 200 chars)",
  "atmosphere": {
    "weather": "clear",
    "particles": "none",
    "mood": "mystical",
    "transition": "fade"
  },
  "suggestedActions": ["Action 1", "Action 2", "Action 3", "Action 4"],
  "stateChanges": {
    "perCharacter": {},
    "timeAdvance": {"hoursElapsed": 0.5},
    "currentLocation": "Starting Location",
    "npcs": [],
    "worldFacts": [],
    "journalEntries": ["Opening scene summary"]
  }
}

For stateChanges.perCharacter: an object keyed by character name, each containing {hp, mana, xp, newItems, removeItems${needsPerCharHint ? ', needsChanges' : ''}} deltas. Example: {"Aldric": {"hp": -5, "xp": 10}, "Lyra": {"mana": -15, "xp": 10}}. Use empty object {} if no per-character changes.${needsPerCharDoc}

CRITICAL: The dialogueSegments array must cover the FULL narrative broken into narration and dialogue chunks. Narration segments must contain the COMPLETE, VERBATIM narrative text — do NOT summarize, shorten, or paraphrase. The combined text of all narration segments must equal the full "narrative" field (minus any dialogue lines). Every sentence from "narrative" must appear in a narration segment. Narration segments must NEVER contain quoted speech — always split dialogue into separate "dialogue" segments. Every dialogue segment MUST include a "gender" field ("male" or "female"). When a player character speaks, include their dialogue as a dialogue segment with their character name and gender.${langReminder}`;
  }

  const actionLines = actions
    .map((a) => `- ${a.name} (${a.gender}): "${a.action}"`)
    .join('\n');

  return `The players' actions this round:
${actionLines}

Resolve ALL player actions simultaneously. Describe what happens to each character.

Respond with ONLY valid JSON:
{
  "narrative": "2-3 paragraphs resolving all actions and setting up the next decision...",
  "dialogueSegments": [
    {"type": "narration", "text": "Prose..."},
    {"type": "dialogue", "character": "NPC or Player Name", "gender": "male", "text": "..."}
  ],
  "soundEffect": "sound description or null",
  "musicPrompt": "music description or null",
  "imagePrompt": "ENGLISH visual scene description (max 200 chars)",
  "atmosphere": {
    "weather": "clear",
    "particles": "none",
    "mood": "tense",
    "transition": "dissolve"
  },
  "suggestedActions": ["Action 1", "Action 2", "Action 3", "Action 4"],
  "stateChanges": {
    "perCharacter": {
      "CharacterName": {"hp": 0, "mana": 0, "xp": 0, "newItems": [], "removeItems": []${needsPerCharHint}}
    },
    "timeAdvance": {"hoursElapsed": 0.5},
    "currentLocation": "Location Name",
    "npcs": [],
    "worldFacts": [],
    "journalEntries": ["Summary of key events"]
  },
  "diceRoll": null
}

For perCharacter: include an entry for each character that is affected. hp/mana/xp are deltas.${needsPerCharDoc}

CRITICAL: The dialogueSegments array must cover the FULL narrative broken into narration and dialogue chunks. Narration segments must contain the COMPLETE, VERBATIM narrative text — do NOT summarize, shorten, or paraphrase. The combined text of all narration segments must equal the full "narrative" field (minus any dialogue lines). Every sentence from "narrative" must appear in a narration segment. Narration segments must NEVER contain quoted speech — always split dialogue into separate "dialogue" segments. Every dialogue segment MUST include a "gender" field ("male" or "female"). When a player character speaks, include their dialogue as a dialogue segment with their character name and gender.${langReminder}`;
}

async function callAI(messages, encryptedApiKeys) {
  const openaiKey = resolveApiKey(encryptedApiKeys, 'openai');
  const anthropicKey = resolveApiKey(encryptedApiKeys, 'anthropic');

  if (openaiKey) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages,
        temperature: 0.8,
        response_format: { type: 'json_object' },
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `OpenAI API error: ${response.status}`);
    }
    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);
  }

  if (anthropicKey) {
    const systemMsg = messages.find((m) => m.role === 'system');
    const userMsgs = messages.filter((m) => m.role !== 'system');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemMsg?.content || '',
        messages: userMsgs,
        temperature: 0.8,
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `Anthropic API error: ${response.status}`);
    }
    const data = await response.json();
    const text = data.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Failed to parse AI response as JSON');
    return JSON.parse(jsonMatch[0]);
  }

  throw new Error('No API key configured. The host must have an OpenAI or Anthropic API key.');
}

export async function generateMultiplayerCampaign(settings, players, encryptedApiKeys, language = 'en') {
  const playerList = players.map((p) => `- ${p.name} (${p.gender})`).join('\n');

  const prompt = `Create a new MULTIPLAYER RPG campaign with these parameters:
- Genre: ${settings.genre}
- Tone: ${settings.tone}
- Play Style: ${settings.style}
- Difficulty: ${settings.difficulty}
- Campaign Length: ${settings.length}
- Story prompt: "${settings.storyPrompt}"

PLAYERS:
${playerList}

Generate the campaign foundation with characters for each player. Respond with ONLY valid JSON:
{
  "name": "Campaign name (3-5 words)",
  "worldDescription": "2-3 paragraphs describing the world",
  "hook": "1-2 paragraphs story hook",
  "characters": [
    {
      "playerName": "Player name from the list above",
      "name": "Same as playerName",
      "class": "A fitting character class",
      "level": 1,
      "hp": 100, "maxHp": 100,
      "mana": 50, "maxMana": 50,
      "xp": 0,
      "stats": {"str": 10, "dex": 10, "con": 10, "int": 10, "wis": 10, "cha": 10},
      "inventory": [],
      "statuses": [],
      "backstory": "2-3 sentences backstory"
    }
  ],
  "firstScene": {
    "narrative": "2-3 paragraphs of the opening scene introducing all characters",
    "dialogueSegments": [{"type": "narration", "text": "..."}],
    "soundEffect": null,
    "musicPrompt": "background music description",
    "imagePrompt": "ENGLISH visual scene description (max 200 chars)",
    "atmosphere": {"weather": "clear", "particles": "none", "mood": "mystical", "transition": "fade"},
    "suggestedActions": ["Action 1", "Action 2", "Action 3", "Action 4"],
    "journalEntries": ["Opening scene summary"]
  },
  "initialQuest": {"name": "Quest name", "description": "Quest description"},
  "initialWorldFacts": ["Fact 1", "Fact 2", "Fact 3"]
}

${language === 'pl' ? 'Write ALL text in Polish.' : ''}`;

  const messages = [
    { role: 'system', content: `You are a creative RPG campaign designer. Create immersive multiplayer campaigns. Always respond with valid JSON. Write in ${language === 'pl' ? 'Polish' : 'English'}.` },
    { role: 'user', content: prompt },
  ];

  const result = await callAI(messages, encryptedApiKeys);

  const characters = (result.characters || []).map((c) => {
    const matchedPlayer = players.find((p) => p.name === c.playerName) || players.find((p) => p.name === c.name);
    return {
      ...c,
      odId: matchedPlayer?.odId || null,
      hp: c.hp ?? 100,
      maxHp: c.maxHp ?? 100,
      mana: c.mana ?? 50,
      maxMana: c.maxMana ?? 50,
      level: c.level ?? 1,
      xp: c.xp ?? 0,
      stats: c.stats ?? { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      inventory: c.inventory ?? [],
      statuses: c.statuses ?? [],
      needs: { hunger: 100, thirst: 100, bladder: 100, hygiene: 100, rest: 100 },
    };
  });

  const sceneId = `scene_mp_${Date.now()}`;
  const firstScene = {
    id: sceneId,
    narrative: result.firstScene?.narrative || 'The adventure begins...',
    dialogueSegments: result.firstScene?.dialogueSegments || [],
    actions: result.firstScene?.suggestedActions || [],
    soundEffect: result.firstScene?.soundEffect || null,
    musicPrompt: result.firstScene?.musicPrompt || null,
    imagePrompt: result.firstScene?.imagePrompt || null,
    atmosphere: result.firstScene?.atmosphere || {},
    timestamp: Date.now(),
  };

  const dmMessage = {
    id: `msg_${Date.now()}`,
    role: 'dm',
    content: firstScene.narrative,
    dialogueSegments: firstScene.dialogueSegments,
    timestamp: Date.now(),
  };

  return {
    campaign: {
      name: result.name || 'Multiplayer Campaign',
      genre: settings.genre,
      tone: settings.tone,
      style: settings.style,
      difficulty: settings.difficulty,
      length: settings.length,
      worldDescription: result.worldDescription || '',
      hook: result.hook || '',
    },
    characters,
    world: {
      locations: [],
      facts: result.initialWorldFacts || [],
      eventHistory: result.firstScene?.journalEntries || [],
      npcs: [],
      mapState: [],
      mapConnections: [],
      currentLocation: '',
      timeState: { day: 1, timeOfDay: 'morning', hour: 6, season: 'unknown' },
      activeEffects: [],
      compressedHistory: '',
    },
    quests: {
      active: result.initialQuest ? [{ id: `quest_${Date.now()}`, ...result.initialQuest }] : [],
      completed: [],
    },
    scenes: [firstScene],
    chatHistory: [dmMessage],
  };
}

export async function generateMidGameCharacter(gameState, settings, playerName, playerGender, encryptedApiKeys, language = 'en') {
  const existingChars = (gameState.characters || [])
    .map((c) => `- ${c.name} (${c.class} Lv.${c.level}, HP ${c.hp}/${c.maxHp})`)
    .join('\n') || 'None';

  const avgLevel = gameState.characters?.length
    ? Math.round(gameState.characters.reduce((s, c) => s + (c.level || 1), 0) / gameState.characters.length)
    : 1;

  const campaign = gameState.campaign || {};

  const prompt = `A new player is joining a MULTIPLAYER RPG campaign mid-game.

CAMPAIGN: "${campaign.name || 'Unnamed'}"
- Genre: ${settings.genre || 'Fantasy'}
- Tone: ${settings.tone || 'Epic'}
- Difficulty: ${settings.difficulty || 'Normal'}
- World: ${campaign.worldDescription?.substring(0, 300) || 'A mysterious world'}

EXISTING CHARACTERS:
${existingChars}

NEW PLAYER: ${playerName} (${playerGender})

Create a character for this new player that fits the campaign. The character should be at level ${avgLevel} to match existing party members.

Respond with ONLY valid JSON:
{
  "name": "${playerName}",
  "class": "A fitting class different from existing characters if possible",
  "level": ${avgLevel},
  "hp": 100, "maxHp": 100,
  "mana": 50, "maxMana": 50,
  "xp": 0,
  "stats": {"str": 10, "dex": 10, "con": 10, "int": 10, "wis": 10, "cha": 10},
  "inventory": [],
  "statuses": [],
  "backstory": "2-3 sentences explaining how they arrive mid-adventure",
  "arrivalNarrative": "1-2 sentences describing the character appearing/arriving in the current scene"
}

${language === 'pl' ? 'Write ALL text in Polish.' : ''}`;

  const messages = [
    { role: 'system', content: `You are an RPG character designer. Create balanced characters that fit existing campaigns. Write in ${language === 'pl' ? 'Polish' : 'English'}. Always respond with valid JSON.` },
    { role: 'user', content: prompt },
  ];

  const result = await callAI(messages, encryptedApiKeys);

  return {
    character: {
      playerName,
      name: result.name || playerName,
      class: result.class || 'Adventurer',
      level: result.level ?? avgLevel,
      hp: result.hp ?? 100,
      maxHp: result.maxHp ?? 100,
      mana: result.mana ?? 50,
      maxMana: result.maxMana ?? 50,
      xp: result.xp ?? 0,
      stats: result.stats ?? { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      inventory: result.inventory ?? [],
      statuses: result.statuses ?? [],
      backstory: result.backstory || '',
    },
    arrivalNarrative: result.arrivalNarrative || `${playerName} joins the adventure.`,
  };
}

export async function generateMultiplayerScene(gameState, settings, players, actions, encryptedApiKeys, language = 'en') {
  const systemPrompt = buildMultiplayerSystemPrompt(gameState, settings, players, language);
  const scenePrompt = buildMultiplayerScenePrompt(actions, false, language, { needsSystemEnabled: settings.needsSystemEnabled === true });

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: scenePrompt },
  ];

  const result = await callAI(messages, encryptedApiKeys);

  const sceneId = `scene_mp_${Date.now()}`;
  const scene = {
    id: sceneId,
    narrative: result.narrative || '',
    dialogueSegments: result.dialogueSegments || [],
    actions: result.suggestedActions || [],
    soundEffect: result.soundEffect || null,
    musicPrompt: result.musicPrompt || null,
    imagePrompt: result.imagePrompt || null,
    atmosphere: result.atmosphere || {},
    diceRoll: result.diceRoll || null,
    playerActions: actions.map((a) => ({ name: a.name, action: a.action })),
    timestamp: Date.now(),
  };

  const chatMessages = [];
  for (const a of actions) {
    chatMessages.push({
      id: `msg_${Date.now()}_${a.odId}`,
      role: 'player',
      playerName: a.name,
      content: a.action,
      timestamp: Date.now(),
    });
  }
  chatMessages.push({
    id: `msg_dm_${Date.now()}`,
    role: 'dm',
    content: scene.narrative,
    dialogueSegments: scene.dialogueSegments,
    timestamp: Date.now(),
  });

  return {
    scene,
    chatMessages,
    stateChanges: result.stateChanges || {},
  };
}
