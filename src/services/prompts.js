export function buildSystemPrompt(gameState, dmSettings, language = 'en') {
  const { campaign, character, world, quests, scenes } = gameState;

  const recentScenes = scenes.slice(-10).map((s, i) => `Scene ${i + 1}: ${s.narrative?.substring(0, 200)}...`).join('\n');
  const activeQuests = quests.active.map((q) => `- ${q.name}: ${q.description}`).join('\n') || 'None';
  const worldFacts = world.facts.slice(-20).join('\n') || 'No known facts yet.';
  const journal = world.eventHistory?.length > 0
    ? world.eventHistory.map((e, i) => `${i + 1}. ${e}`).join('\n')
    : 'No entries yet.';
  const inventory = character?.inventory?.map((i) => `${i.name} (${i.type})`).join(', ') || 'Empty';
  const statuses = character?.statuses?.join(', ') || 'None';

  const difficultyLabel = dmSettings.difficulty < 25 ? 'Easy' : dmSettings.difficulty < 50 ? 'Normal' : dmSettings.difficulty < 75 ? 'Hard' : 'Expert';
  const narrativeLabel = dmSettings.narrativeStyle < 25 ? 'Predictable' : dmSettings.narrativeStyle < 50 ? 'Balanced' : dmSettings.narrativeStyle < 75 ? 'Chaotic' : 'Wild';
  const responseLabel = dmSettings.responseLength < 33 ? 'short (2-3 sentences)' : dmSettings.responseLength < 66 ? 'medium (1-2 paragraphs)' : 'long (3+ paragraphs)';

  const poeticismLabel = (dmSettings.narratorPoeticism ?? 50) < 25 ? 'dry and prosaic' : (dmSettings.narratorPoeticism ?? 50) < 50 ? 'moderately literary' : (dmSettings.narratorPoeticism ?? 50) < 75 ? 'poetic and evocative' : 'lushly lyrical, rich in metaphor and imagery';
  const grittinessLabel = (dmSettings.narratorGrittiness ?? 30) < 25 ? 'lighthearted and clean' : (dmSettings.narratorGrittiness ?? 30) < 50 ? 'moderately grounded' : (dmSettings.narratorGrittiness ?? 30) < 75 ? 'gritty and raw' : 'brutally dark, visceral and unflinching';
  const detailLabel = (dmSettings.narratorDetail ?? 50) < 25 ? 'minimal, only essential details' : (dmSettings.narratorDetail ?? 50) < 50 ? 'balanced descriptions' : (dmSettings.narratorDetail ?? 50) < 75 ? 'rich environmental detail' : 'lavishly detailed, painting every sensory element';
  const humorLabel = (dmSettings.narratorHumor ?? 20) < 25 ? 'completely serious' : (dmSettings.narratorHumor ?? 20) < 50 ? 'occasional dry wit' : (dmSettings.narratorHumor ?? 20) < 75 ? 'frequent humor woven into narration' : 'heavily comedic, irreverent and absurdist';
  const dramaLabel = (dmSettings.narratorDrama ?? 50) < 25 ? 'understated and subtle' : (dmSettings.narratorDrama ?? 50) < 50 ? 'measured dramatic pacing' : (dmSettings.narratorDrama ?? 50) < 75 ? 'heightened drama and tension' : 'maximally theatrical, grandiose and operatic';

  return `You are the Dungeon Master AI for "${campaign?.name || 'Unnamed Campaign'}".

CAMPAIGN SETTINGS:
- Genre: ${campaign?.genre || 'Fantasy'}
- Tone: ${campaign?.tone || 'Epic'}
- Play Style: ${campaign?.style || 'Hybrid'} (narrative + optional dice rolls)
- Difficulty: ${difficultyLabel}
- Narrative chaos: ${narrativeLabel}
- Response length: ${responseLabel}

NARRATOR VOICE & STYLE:
- Poeticism: ${poeticismLabel}
- Grittiness: ${grittinessLabel}
- Environmental detail: ${detailLabel}
- Humor: ${humorLabel}
- Drama: ${dramaLabel}
Adapt your narration prose style to match ALL of the above parameters simultaneously. They define your voice as the narrator — blend them consistently throughout every scene.

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

STORY JOURNAL (chronological log of key events — use this to maintain narrative consistency):
${journal}

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
8. Balance challenge with fun based on the difficulty setting.
9. Reference the STORY JOURNAL to recall past events, NPC encounters, unresolved threads, and consequences. Never contradict established journal entries.

CHARACTER SPEECH & LINGUISTIC IDENTITY:
Every NPC MUST have a distinctive, recognizable way of speaking that persists across all scenes. Assign each NPC their own linguistic fingerprint by combining several of these techniques:
- Signature phrases, greetings, or verbal tics they repeat (e.g. "mark my words", "by the old gods", ending sentences with "...yes?")
- Distinct vocabulary level: a scholar uses erudite, complex words; a street urchin uses slang and broken grammar; a noble speaks formally
- Speech rhythm: short clipped sentences vs. long rambling monologues vs. measured thoughtful pauses ("...")
- Accent markers or dialect: dropped letters, archaic forms ("thee", "methinks"), regional idioms, foreign words mixed in
- Personality reflected in speech: nervous stuttering, boastful exaggeration, melancholic sighs, sarcastic undertones
- Unique filler words or exclamations particular to that character
The player should be able to identify WHO is speaking purely from how they talk, without reading the character name. Be consistent — once an NPC's speech pattern is established, maintain it exactly in all future appearances.

DIALOGUE FORMAT:
In addition to the "narrative" field (full prose), you MUST provide a "dialogueSegments" array that breaks the narrative into ordered chunks. Each chunk is either:
- {"type": "narration", "text": "Descriptive prose..."} for narrator/environment text
- {"type": "dialogue", "character": "NPC Name", "gender": "male" or "female", "text": "What they say..."} for NPC speech
CRITICAL: The narration segments in dialogueSegments must contain the COMPLETE, VERBATIM narrative text — do NOT summarize, shorten, or paraphrase. The combined text of all narration segments must equal the full "narrative" field (minus any dialogue lines). Every sentence from "narrative" must appear in a narration segment.
CRITICAL: Narration segments must NEVER contain dialogue or quoted speech. Any spoken words by NPCs must ALWAYS be placed in a separate "dialogue" segment. Do NOT embed dialogue within narration text — split it out into its own dialogue segment every time.
IMPORTANT: Every dialogue segment MUST include a "gender" field ("male" or "female") matching the speaking character's gender. Be consistent — the same character must always have the same gender across all scenes.
Use consistent character names across scenes. The player character NEVER appears in dialogueSegments — only NPCs and narrator.

SOUND EFFECTS:
For impactful moments (combat, magic, environmental events, dramatic reveals), include a "soundEffect" field with a short English description for audio generation (e.g. "sword clashing against shield, metallic ringing"). Use null when no sound effect fits. Don't overuse — only for moments that truly benefit from audio atmosphere.

BACKGROUND MUSIC:
Include a "musicPrompt" field with a short English description of the ideal instrumental background music for the scene (e.g. "tense orchestral strings with low brass, dark dungeon atmosphere" or "peaceful acoustic guitar with birdsong, sunny meadow"). Focus on instruments, tempo, and emotional tone. Keep it under 200 characters. Use null only if the scene should be silent.

SCENE IMAGE PROMPT:
Include an "imagePrompt" field with a short ENGLISH description of the scene for AI image generation (max 200 characters). Describe the visual composition, key subjects, environment, lighting, and colors. Always write in English regardless of the narrative language. Example: "a lone warrior standing at the edge of a crumbling stone bridge over a misty chasm, torchlight, dark fantasy".`;
}

export function buildSceneGenerationPrompt(playerAction, isFirstScene = false) {
  if (isFirstScene) {
    return `Generate the opening scene of this campaign. Set the stage with an atmospheric description that draws the player in.

Respond with ONLY valid JSON in this exact format:
{
  "narrative": "A vivid 2-3 paragraph scene description setting the stage for the adventure...",
  "dialogueSegments": [
    {"type": "narration", "text": "Descriptive prose..."},
    {"type": "dialogue", "character": "NPC Name", "gender": "male", "text": "What they say..."},
    {"type": "narration", "text": "More prose..."}
  ],
  "soundEffect": "Short English description of ambient/atmospheric sound for this scene, or null",
  "musicPrompt": "Short English description of ideal instrumental background music for this scene, or null",
  "imagePrompt": "Short ENGLISH visual description of the scene for AI image generation (max 200 chars)",
  "atmosphere": {
    "weather": "rain | snow | storm | clear | fog | fire",
    "particles": "magic_dust | sparks | embers | arcane | none",
    "mood": "mystical | dark | peaceful | tense | chaotic",
    "transition": "dissolve | fade | arcane_wipe"
  },
  "suggestedActions": ["Action option 1", "Action option 2", "Action option 3", "Action option 4"],
  "stateChanges": {
    "journalEntries": ["Concise 1-2 sentence summary of a key event from this scene"]
  },
  "diceRoll": null
}

For stateChanges.journalEntries: provide 1-3 concise summaries of IMPORTANT events only — major plot developments, key NPC encounters, significant player decisions, discoveries, or combat outcomes. Each entry should be a self-contained 1-2 sentence summary. Do NOT log trivial details.

For atmosphere: choose weather, particles, mood, and transition that match the scene's environment and tone. weather describes the environmental condition, particles adds visual flair (magic_dust for mystical places, sparks for forges/tech, embers for fire/destruction, arcane for magical events), mood sets the overall feel, and transition is the visual transition into this scene (use "fade" for the opening scene).

For musicPrompt: describe the ideal instrumental background music — mention instruments, tempo, and emotional tone. Keep under 200 characters. Example: "slow strings with harp arpeggios, mysterious and enchanting". Use null only if the scene should be silent.

For imagePrompt: describe the visual scene composition in ENGLISH — subjects, environment, lighting, colors, atmosphere. Keep under 200 characters. Always English regardless of narrative language.

The dialogueSegments array must cover the full narrative broken into narration and dialogue chunks — narration segments must contain the COMPLETE text from "narrative" (verbatim, not summarized). Narration segments must NEVER contain quoted speech — always split dialogue into separate "dialogue" segments. Use consistent NPC names. Every dialogue segment MUST have a "gender" field.`;
  }

  return `The player chose: "${playerAction}"

Resolve this action and advance the story. Determine outcomes, describe the consequences, and set up the next decision point.

If a skill check is appropriate for the action, include a dice roll. Roll a D20 and add the relevant modifier from the character's stats.

Respond with ONLY valid JSON in this exact format:
{
  "narrative": "2-3 paragraphs describing what happens as a result of the player's action and setting up the next beat...",
  "dialogueSegments": [
    {"type": "narration", "text": "Descriptive prose..."},
    {"type": "dialogue", "character": "NPC Name", "gender": "male", "text": "What they say..."},
    {"type": "narration", "text": "More prose..."}
  ],
  "soundEffect": "Short English description of a sound effect for impactful moments, or null",
  "musicPrompt": "Short English description of ideal instrumental background music for this scene, or null",
  "imagePrompt": "Short ENGLISH visual description of the scene for AI image generation (max 200 chars)",
  "atmosphere": {
    "weather": "rain | snow | storm | clear | fog | fire",
    "particles": "magic_dust | sparks | embers | arcane | none",
    "mood": "mystical | dark | peaceful | tense | chaotic",
    "transition": "dissolve | fade | arcane_wipe"
  },
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
    "journalEntries": ["Concise 1-2 sentence summary of a key event from this scene"],
    "statuses": null
  },
  "diceRoll": null
}

For atmosphere: choose weather, particles, mood, and transition that best match the current scene's environment. Pick ONE value for each field. weather = environmental condition (clear/rain/snow/storm/fog/fire). particles = visual flair (magic_dust/sparks/embers/arcane/none). mood = overall feel (mystical/dark/peaceful/tense/chaotic). transition = how the scene visually transitions in (dissolve/fade/arcane_wipe — use arcane_wipe for magical events, dissolve for abrupt changes, fade for calm transitions).

For diceRoll, use null if no roll needed, or: {"type": "D20", "roll": <number 1-20>, "modifier": <number>, "total": <number>, "skill": "<skill name>", "dc": <number>, "success": <boolean>}

For stateChanges: hp/mana/xp are DELTAS (can be negative). newItems should be objects with {id, name, type, description, rarity}. newQuests should be objects with {id, name, description}. worldFacts are strings of new information. journalEntries are 1-3 concise summaries of IMPORTANT events only — major plot developments, key NPC encounters, significant decisions, discoveries, or combat outcomes. Each entry: 1-2 sentences, self-contained. Do NOT log trivial details. Set any field to null/empty to skip it.

For imagePrompt: describe the visual scene composition in ENGLISH — subjects, environment, lighting, colors, atmosphere. Keep under 200 characters. Always English regardless of narrative language.

The dialogueSegments array must cover the full narrative broken into narration and dialogue chunks — narration segments must contain the COMPLETE text from "narrative" (verbatim, not summarized or shortened). Narration segments must NEVER contain quoted speech — always split dialogue into separate "dialogue" segments. Use consistent NPC names across scenes. Every dialogue segment MUST have a "gender" field ("male" or "female").`;
}

export function buildCampaignCreationPrompt(settings, language = 'en') {
  const langInstruction = language === 'pl'
    ? '\n\nIMPORTANT: Write ALL text content (name, worldDescription, hook, character backstory, narrative, quest names, quest descriptions, world facts, suggested actions) in Polish.'
    : '';

  const characterNameLine = settings.characterName?.trim()
    ? `- Player's character name: "${settings.characterName.trim()}" (use this exact name for the character)`
    : '- Player\'s character name: not specified (suggest a fitting name)';

  return `Create a new RPG campaign with these parameters:
- Genre: ${settings.genre}
- Tone: ${settings.tone}
- Play Style: ${settings.style}
- Difficulty: ${settings.difficulty}
- Campaign Length: ${settings.length}
${characterNameLine}
- Player's story idea: "${settings.storyPrompt}"

Generate the campaign foundation. Respond with ONLY valid JSON:
{
  "name": "A compelling campaign name (3-5 words)",
  "worldDescription": "2-3 paragraphs describing the world, its history, factions, and current state",
  "hook": "1-2 paragraphs presenting the story hook that draws the player into the adventure",
  "characterSuggestion": {
    "name": "${settings.characterName?.trim() || 'A fitting character name'}",
    "class": "A character class that fits the genre",
    "backstory": "2-3 sentences of character backstory tied to the world"
  },
  "firstScene": {
    "narrative": "2-3 vivid paragraphs of the opening scene",
    "dialogueSegments": [
      {"type": "narration", "text": "Descriptive prose..."},
      {"type": "dialogue", "character": "NPC Name", "gender": "male", "text": "What they say..."}
    ],
    "soundEffect": "Short English ambient sound description or null",
    "musicPrompt": "Short English description of ideal instrumental background music for the opening scene",
    "imagePrompt": "Short ENGLISH visual description of the scene for AI image generation (max 200 chars)",
    "atmosphere": {
      "weather": "clear | rain | snow | storm | fog | fire",
      "particles": "magic_dust | sparks | embers | arcane | none",
      "mood": "mystical | dark | peaceful | tense | chaotic",
      "transition": "fade"
    },
    "suggestedActions": ["Action 1", "Action 2", "Action 3", "Action 4"],
    "journalEntries": ["Concise 1-2 sentence summary of a key event from the opening scene"]
  },
  "initialQuest": {
    "name": "Main quest name",
    "description": "Brief quest description"
  },
  "initialWorldFacts": ["Fact 1 about the world", "Fact 2", "Fact 3"]
}${langInstruction}`;
}

export function buildImagePrompt(narrative, genre, tone, imagePrompt, provider = 'dalle') {
  const isSD = provider === 'stability';

  const styleMap = isSD
    ? {
        Fantasy: 'photorealistic fantasy scene, cinematic photograph, realistic lighting, RAW photo, 8k uhd, dslr',
        'Sci-Fi': 'photorealistic sci-fi scene, cinematic photograph, futuristic, realistic neon lighting, RAW photo, 8k uhd',
        Horror: 'photorealistic horror scene, cinematic photograph, eerie realistic lighting, RAW photo, 8k uhd',
      }
    : {
        Fantasy: 'dark fantasy oil painting, medieval, magical atmosphere',
        'Sci-Fi': 'cinematic sci-fi concept art, futuristic, neon-lit',
        Horror: 'dark horror illustration, atmospheric, eerie lighting',
      };

  const toneMap = isSD
    ? {
        Dark: 'moody, desaturated colors, deep shadows, film grain',
        Epic: 'grand scale, dramatic golden-hour lighting, heroic composition, cinematic depth of field',
        Humorous: 'bright natural lighting, vivid colors, warm tones',
      }
    : {
        Dark: 'moody, desaturated, ominous shadows',
        Epic: 'grand scale, dramatic lighting, heroic composition',
        Humorous: 'whimsical, colorful, lighthearted',
      };

  const style = styleMap[genre] || styleMap.Fantasy;
  const mood = toneMap[tone] || toneMap.Epic;

  const sceneDesc = imagePrompt || narrative.substring(0, 300);

  return `${style}, ${mood}. Scene: ${sceneDesc}. No text, no UI elements, no watermarks. High quality, detailed environment, atmospheric lighting.`;
}

export function buildRecapPrompt() {
  return `Based on the scene history in the system context, generate a brief "Previously on..." recap summarizing the key events, decisions, and their consequences. Write it in a dramatic, narrative style (2-3 sentences). Respond with ONLY valid JSON: {"recap": "The recap text..."}`;
}
