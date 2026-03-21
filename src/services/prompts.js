export function buildSystemPrompt(gameState, dmSettings, language = 'en') {
  const { campaign, character, world, quests, scenes } = gameState;

  const recentScenes = scenes.slice(-10).map((s, i) => `Scene ${i + 1}: ${s.narrative?.substring(0, 200)}...`).join('\n');
  const activeQuests = quests.active.map((q) => `- ${q.name}: ${q.description}`).join('\n') || 'None';
  const worldFacts = world.facts.slice(-20).join('\n') || 'No known facts yet.';
  const inventory = character?.inventory?.map((i) => `${i.name} (${i.type})`).join(', ') || 'Empty';
  const statuses = character?.statuses?.join(', ') || 'None';

  const difficultyLabel = dmSettings.difficulty < 25 ? 'Easy' : dmSettings.difficulty < 50 ? 'Normal' : dmSettings.difficulty < 75 ? 'Hard' : 'Expert';
  const narrativeLabel = dmSettings.narrativeStyle < 25 ? 'Predictable' : dmSettings.narrativeStyle < 50 ? 'Balanced' : dmSettings.narrativeStyle < 75 ? 'Chaotic' : 'Wild';
  const responseLabel = dmSettings.responseLength < 33 ? 'short (2-3 sentences)' : dmSettings.responseLength < 66 ? 'medium (1-2 paragraphs)' : 'long (3+ paragraphs)';

  return `You are the Dungeon Master AI for "${campaign?.name || 'Unnamed Campaign'}".

CAMPAIGN SETTINGS:
- Genre: ${campaign?.genre || 'Fantasy'}
- Tone: ${campaign?.tone || 'Epic'}
- Play Style: ${campaign?.style || 'Hybrid'} (narrative + optional dice rolls)
- Difficulty: ${difficultyLabel}
- Narrative chaos: ${narrativeLabel}
- Response length: ${responseLabel}

WORLD DESCRIPTION:
${campaign?.worldDescription || 'A mysterious world awaits discovery.'}

STORY HOOK:
${campaign?.hook || 'An adventure begins...'}

CHARACTER STATE:
- Name: ${character?.name || 'Unknown'}, ${character?.class || 'Adventurer'} Level ${character?.level || 1}
- HP: ${character?.hp}/${character?.maxHp}, Mana: ${character?.mana}/${character?.maxMana}
- Stats: STR ${character?.stats?.str}, DEX ${character?.stats?.dex}, CON ${character?.stats?.con}, INT ${character?.stats?.int}, WIS ${character?.stats?.wis}, CHA ${character?.stats?.cha}
- Inventory: ${inventory}
- Statuses: ${statuses}

WORLD KNOWLEDGE:
${worldFacts}

ACTIVE QUESTS:
${activeQuests}

RECENT SCENE HISTORY:
${recentScenes || 'No scenes yet - this is the beginning of the story.'}

LANGUAGE INSTRUCTION:
Write ALL narrative text, dialogue, descriptions, quest names, item names, and suggested actions in ${language === 'pl' ? 'Polish' : 'English'}.

INSTRUCTIONS:
1. Stay in character as a skilled, atmospheric Dungeon Master.
2. Maintain narrative consistency with established world facts and events.
3. In hybrid mode, suggest dice rolls for uncertain outcomes (D20 + modifier).
4. Track consequences of player decisions across scenes.
5. Generate vivid, immersive scene descriptions matching the campaign's genre and tone.
6. Always respond with valid JSON matching the requested format.
7. Make the story feel like decisions matter—actions have consequences.
8. Balance challenge with fun based on the difficulty setting.`;
}

export function buildSceneGenerationPrompt(playerAction, isFirstScene = false) {
  if (isFirstScene) {
    return `Generate the opening scene of this campaign. Set the stage with an atmospheric description that draws the player in.

Respond with ONLY valid JSON in this exact format:
{
  "narrative": "A vivid 2-3 paragraph scene description setting the stage for the adventure...",
  "suggestedActions": ["Action option 1", "Action option 2", "Action option 3", "Action option 4"],
  "stateChanges": {},
  "diceRoll": null
}`;
  }

  return `The player chose: "${playerAction}"

Resolve this action and advance the story. Determine outcomes, describe the consequences, and set up the next decision point.

If a skill check is appropriate for the action, include a dice roll. Roll a D20 and add the relevant modifier from the character's stats.

Respond with ONLY valid JSON in this exact format:
{
  "narrative": "2-3 paragraphs describing what happens as a result of the player's action and setting up the next beat...",
  "suggestedActions": ["Action option 1", "Action option 2", "Action option 3", "Action option 4"],
  "stateChanges": {
    "hp": 0,
    "mana": 0,
    "xp": 0,
    "newItems": [],
    "removeItems": [],
    "newQuests": [],
    "completedQuests": [],
    "worldFacts": [],
    "statuses": null
  },
  "diceRoll": null
}

For diceRoll, use null if no roll needed, or: {"type": "D20", "roll": <number 1-20>, "modifier": <number>, "total": <number>, "skill": "<skill name>", "dc": <number>, "success": <boolean>}

For stateChanges: hp/mana/xp are DELTAS (can be negative). newItems should be objects with {id, name, type, description, rarity}. newQuests should be objects with {id, name, description}. worldFacts are strings of new information. Set any field to null/empty to skip it.`;
}

export function buildCampaignCreationPrompt(settings, language = 'en') {
  const langInstruction = language === 'pl'
    ? '\n\nIMPORTANT: Write ALL text content (name, worldDescription, hook, character backstory, narrative, quest names, quest descriptions, world facts, suggested actions) in Polish.'
    : '';

  return `Create a new RPG campaign with these parameters:
- Genre: ${settings.genre}
- Tone: ${settings.tone}
- Play Style: ${settings.style}
- Difficulty: ${settings.difficulty}
- Campaign Length: ${settings.length}
- Player's story idea: "${settings.storyPrompt}"

Generate the campaign foundation. Respond with ONLY valid JSON:
{
  "name": "A compelling campaign name (3-5 words)",
  "worldDescription": "2-3 paragraphs describing the world, its history, factions, and current state",
  "hook": "1-2 paragraphs presenting the story hook that draws the player into the adventure",
  "characterSuggestion": {
    "name": "A fitting character name",
    "class": "A character class that fits the genre",
    "backstory": "2-3 sentences of character backstory tied to the world"
  },
  "firstScene": {
    "narrative": "2-3 vivid paragraphs of the opening scene",
    "suggestedActions": ["Action 1", "Action 2", "Action 3", "Action 4"]
  },
  "initialQuest": {
    "name": "Main quest name",
    "description": "Brief quest description"
  },
  "initialWorldFacts": ["Fact 1 about the world", "Fact 2", "Fact 3"]
}${langInstruction}`;
}

export function buildImagePrompt(narrative, genre, tone) {
  const styleMap = {
    Fantasy: 'dark fantasy oil painting, medieval, magical atmosphere',
    'Sci-Fi': 'cinematic sci-fi concept art, futuristic, neon-lit',
    Horror: 'dark horror illustration, atmospheric, eerie lighting',
  };

  const toneMap = {
    Dark: 'moody, desaturated, ominous shadows',
    Epic: 'grand scale, dramatic lighting, heroic composition',
    Humorous: 'whimsical, colorful, lighthearted',
  };

  const style = styleMap[genre] || styleMap.Fantasy;
  const mood = toneMap[tone] || toneMap.Epic;

  const sceneSummary = narrative.substring(0, 300);

  return `${style}, ${mood}. Scene: ${sceneSummary}. No text, no UI elements, no watermarks. High quality, detailed environment, atmospheric lighting.`;
}

export function buildRecapPrompt() {
  return `Based on the scene history in the system context, generate a brief "Previously on..." recap summarizing the key events, decisions, and their consequences. Write it in a dramatic, narrative style (2-3 sentences). Respond with ONLY valid JSON: {"recap": "The recap text..."}`;
}
