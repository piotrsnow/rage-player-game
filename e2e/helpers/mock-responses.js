/**
 * Mock AI responses conforming to the Zod schemas in aiResponseValidator.js.
 * Used via Playwright route interception to avoid real AI API calls.
 */

export function mockCampaignCreationResponse() {
  return {
    name: 'The Shadowed Keep',
    worldDescription: 'A dark fantasy world where ancient evils stir beneath crumbling fortresses.',
    hook: 'A mysterious letter summons you to the ruins of Greyhold Keep, where shadows move of their own accord.',
    characterSuggestion: {
      name: 'E2E Tester',
      species: 'Human',
      attributes: { sila: 14, inteligencja: 10, charyzma: 8, zrecznosc: 12, wytrzymalosc: 13, szczescie: 5 },
      skills: {},
      backstory: 'A veteran of countless skirmishes.',
      inventory: [
        { id: 'sword-1', name: 'Hand Weapon', type: 'weapon', quantity: 1 },
        { id: 'shield-1', name: 'Shield', type: 'armour', quantity: 1 },
      ],
      money: { gold: 2, silver: 5, copper: 0 },
    },
    firstScene: {
      narrative: 'You stand before the crumbling gates of Greyhold Keep. The wind howls through broken stone as ravens circle overhead. A faint light flickers in the tower window above.',
      dialogueSegments: [
        { type: 'narration', text: 'You stand before the crumbling gates of Greyhold Keep.' },
        { type: 'narration', text: 'The wind howls through broken stone as ravens circle overhead.' },
      ],
      suggestedActions: [
        'Enter through the main gate',
        'Search for a side entrance',
        'Call out to whoever lit the tower light',
      ],
      soundEffect: 'wind_howl',
      musicPrompt: 'dark ambient medieval dungeon exploration',
      imagePrompt: 'crumbling medieval stone keep at dusk with ravens',
      atmosphere: {
        weather: 'overcast',
        particles: 'dust',
        mood: 'ominous',
        lighting: 'dim',
        transition: 'fade',
      },
      journalEntries: ['Arrived at Greyhold Keep'],
    },
    initialQuest: {
      id: 'quest-1',
      name: 'The Mystery of Greyhold',
      description: 'Investigate the strange occurrences at the abandoned keep.',
      completionCondition: 'Discover the source of the shadows.',
      objectives: [
        { id: 'obj-1', description: 'Enter the keep' },
        { id: 'obj-2', description: 'Find the source of the light in the tower' },
      ],
      type: 'main',
      reward: { xp: 100, money: { gold: 5, silver: 0, copper: 0 } },
      deadline: null,
      questItems: [],
    },
    initialNPCs: [
      {
        name: 'Old Markel',
        gender: 'male',
        role: 'guide',
        personality: 'nervous but helpful',
        location: 'Keep entrance',
        attitude: 'friendly',
      },
    ],
    initialWorldFacts: ['Greyhold Keep was abandoned 50 years ago after a mysterious plague.'],
  };
}

export function mockSceneResponse() {
  return {
    narrative: 'You push open the heavy iron door and step into the dimly lit hall. Cobwebs hang from the ceiling like tattered curtains. The air is thick with the scent of decay.',
    scenePacing: 'exploration',
    dialogueSegments: [
      { type: 'narration', text: 'You push open the heavy iron door and step into the dimly lit hall.' },
      { type: 'narration', text: 'Cobwebs hang from the ceiling like tattered curtains.' },
      { type: 'dialogue', text: 'Be careful, traveler. These halls hold many secrets.', character: 'Old Markel', gender: 'male' },
    ],
    soundEffect: 'door_creak',
    musicPrompt: 'tense dungeon exploration ambient',
    imagePrompt: 'dark medieval hall interior with cobwebs and dim torchlight',
    atmosphere: {
      weather: 'indoor',
      particles: 'dust',
      mood: 'tense',
      lighting: 'dim',
      transition: 'dissolve',
    },
    suggestedActions: [
      'Explore the hall cautiously',
      'Light a torch to see better',
      'Ask Old Markel about the keep\'s history',
      'Search for traps',
    ],
    stateChanges: {
      worldFacts: ['The main hall of Greyhold is in ruins but structurally sound.'],
      journalEntries: ['Entered the main hall of Greyhold Keep'],
      timeAdvance: { hoursElapsed: 0.5, newDay: false },
      npcs: [],
      newItems: [],
      removeItems: [],
      newQuests: [],
      completedQuests: [],
      questUpdates: [],
      mapChanges: [],
      activeEffects: [],
      codexUpdates: [],
      narrativeSeeds: [],
      resolvedSeeds: [],
      npcAgendas: [],
      pendingCallbacks: [],
    },
    diceRoll: null,
    cutscene: null,
    dilemma: null,
    questOffers: [],
    sceneGrid: null,
  };
}

export function mockStoryPromptResponse() {
  return {
    prompt: 'In a war-torn borderland province, a mysterious plague transforms the dead into restless undead.',
  };
}

export function mockImageGenerationResponse() {
  return {
    artifacts: [{ base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' }],
  };
}

export function mockRecapResponse() {
  return {
    recap: 'Our hero ventured into the ruins of Greyhold Keep, guided by the nervous Old Markel. Within the crumbling halls, they discovered signs of an ancient and terrible presence.',
  };
}

/**
 * Wraps a mock response in the format expected from OpenAI chat completions API.
 */
export function wrapAsOpenAIChatResponse(content) {
  return {
    id: 'chatcmpl-e2e-mock',
    object: 'chat.completion',
    created: Date.now(),
    model: 'gpt-4o',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: JSON.stringify(content),
        },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
  };
}

/**
 * Wraps a mock response in the format expected from Anthropic messages API.
 */
export function wrapAsAnthropicResponse(content) {
  return {
    id: 'msg-e2e-mock',
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: JSON.stringify(content),
      },
    ],
    model: 'claude-sonnet-4-6-20250514',
    stop_reason: 'end_turn',
    usage: { input_tokens: 100, output_tokens: 200 },
  };
}
