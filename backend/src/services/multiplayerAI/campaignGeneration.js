import { callAI } from './aiClient.js';
import { repairDialogueSegments } from '../../../../shared/domain/dialogueRepair.js';
import { ensureSuggestedActions } from '../../../../shared/domain/fallbackActions.js';

export async function generateMultiplayerCampaign(settings, players, _encryptedApiKeys, language = 'en') {
  const playerCharList = players.map((p) => {
    if (p.characterData) {
      const cd = p.characterData;
      const career = cd.career || {};
      return `- ${cd.name} (${cd.species || 'Human'} ${career.name || 'Adventurer'}, ${p.gender})`;
    }
    return `- ${p.name} (${p.gender})`;
  }).join('\n');

  const humorousToneGuidance = settings.tone === 'Humorous'
    ? `\n\nHUMOROUS TONE GUIDELINES: The humor must NOT rely on random absurdity, slapstick, or zaniness. Instead, ground the campaign in a believable world and derive comedy from 1-2 genuinely controversial, provocative, or morally ambiguous elements — corrupt institutions, taboo customs, ethically questionable practices, morally grey factions, or politically charged conflicts. Comedy should emerge from how characters earnestly navigate these uncomfortable realities: dark irony, social satire, awkward moral dilemmas, characters taking absurd stances on serious issues. Sharp wit about real controversies, not random nonsense.\n`
    : '';

  const prompt = `Create a new MULTIPLAYER RPGon campaign with these parameters:
- Genre: ${settings.genre}
- Tone: ${settings.tone}
- Play Style: ${settings.style}
- Difficulty: ${settings.difficulty}
- Campaign Length: ${settings.length}
- Story prompt: "${settings.storyPrompt}"
${humorousToneGuidance}
PLAYERS (characters already created by players):
${playerCharList}

Generate the campaign foundation. The characters are already pre-created by the players — do NOT generate new characters. Respond with ONLY valid JSON:
{
  "name": "Campaign name (3-5 words)",
  "worldDescription": "2-3 paragraphs describing the world",
  "hook": "1-2 paragraphs story hook",
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
  "initialQuest": {"name": "Quest name", "description": "Quest description", "completionCondition": "Main goal to finish the quest", "objectives": [{"id": "obj_1", "description": "First milestone"}, {"id": "obj_2", "description": "Second milestone"}]},
  "initialWorldFacts": ["Fact 1", "Fact 2", "Fact 3"]
}

${language === 'pl' ? 'Write ALL text in Polish.' : ''}`;

  const messages = [
    { role: 'system', content: `You are a creative RPGon campaign designer. Create immersive multiplayer campaigns. Players already have pre-created characters — do not generate characters. Always respond with valid JSON. Write in ${language === 'pl' ? 'Polish' : 'English'}.` },
    { role: 'user', content: prompt },
  ];

  const result = await callAI(messages);

  const characters = players.map((p) => {
    const cd = p.characterData || {};
    return {
      playerName: p.name,
      odId: p.odId,
      name: cd.name || p.name,
      gender: cd.gender || p.gender || 'male',
      species: cd.species || 'Human',
      attributes: cd.attributes || { sila: 12, inteligencja: 12, charyzma: 12, zrecznosc: 12, wytrzymalosc: 12, szczescie: 5 },
      wounds: cd.wounds ?? cd.maxWounds ?? 12,
      maxWounds: cd.maxWounds ?? 12,
      mana: cd.mana ?? 0,
      maxMana: cd.maxMana ?? 0,
      skills: cd.skills || {},
      inventory: cd.inventory || [],
      money: cd.money || { gold: 0, silver: 5, copper: 0 },
      statuses: cd.statuses || [],
      backstory: cd.backstory || '',
      xp: cd.xp ?? 0,
      xpSpent: cd.xpSpent ?? 0,
      needs: { hunger: 100, thirst: 100, bladder: 100, hygiene: 100, rest: 100 },
    };
  });

  const sceneId = `scene_mp_${Date.now()}`;
  const firstSceneNarrative = result.firstScene?.narrative || 'The adventure begins...';
  const firstSceneSegments = repairDialogueSegments(
    firstSceneNarrative,
    result.firstScene?.dialogueSegments || [],
    []
  );
  const firstScene = {
    id: sceneId,
    narrative: firstSceneNarrative,
    dialogueSegments: firstSceneSegments,
    actions: ensureSuggestedActions(result.firstScene, {
      language,
      currentLocation: '',
      npcsHere: [],
      previousActions: [],
      sceneIndex: 1,
    }),
    soundEffect: result.firstScene?.soundEffect || null,
    musicPrompt: result.firstScene?.musicPrompt || null,
    imagePrompt: result.firstScene?.imagePrompt || null,
    atmosphere: result.firstScene?.atmosphere || {},
    timestamp: Date.now(),
  };

  const dmMessage = {
    id: `msg_${Date.now()}`,
    role: 'dm',
    sceneId: firstScene.id,
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
      exploredLocations: [],
      timeState: { day: 1, timeOfDay: 'morning', hour: 6, season: 'unknown' },
      weather: { type: 'clear', intensity: 'mild', description: '' },
      factions: {},
      knowledgeBase: { characters: {}, locations: {}, events: [], decisions: [], plotThreads: [] },
      activeEffects: [],
      compressedHistory: '',
      codex: {},
    },
    quests: {
      active: result.initialQuest ? [{
        id: `quest_${Date.now()}`,
        ...result.initialQuest,
        objectives: (result.initialQuest.objectives || []).map((obj) => ({
          ...obj,
          completed: obj.completed ?? false,
        })),
      }] : [],
      completed: [],
    },
    scenes: [firstScene],
    chatHistory: [dmMessage],
    characterMomentum: {},
  };
}
