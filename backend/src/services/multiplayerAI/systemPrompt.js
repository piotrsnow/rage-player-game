const NEEDS_LABELS = {
  hunger: { low: 'hungry, distracted', critical: 'weak, dizzy, stomach pains' },
  thirst: { low: 'thirsty, dry mouth', critical: 'parched, cracked lips, fading' },
  bladder: { low: 'uncomfortable, fidgeting', critical: 'desperate, about to lose control', zero: 'lost control!' },
  hygiene: { low: 'smelly, NPCs wrinkle noses', critical: 'terrible stench, NPCs recoil' },
  rest: { low: 'tired, yawning, slower reactions', critical: 'can barely keep eyes open, stumbling', zero: 'collapses from exhaustion' },
};

export function buildMultiplayerUnmetNeedsBlock(characters) {
  if (!characters || characters.length === 0) return '';
  const charLines = [];
  for (const c of characters) {
    if (!c.needs) continue;
    const parts = [];
    for (const [key, labels] of Object.entries(NEEDS_LABELS)) {
      const val = c.needs[key] ?? 100;
      if (val <= 0 && labels.zero) {
        parts.push(`${key.charAt(0).toUpperCase() + key.slice(1)} ${val}/100 [${key === 'bladder' ? 'ACCIDENT' : 'COLLAPSE'}]`);
      } else if (val < 15) {
        parts.push(`${key.charAt(0).toUpperCase() + key.slice(1)} ${val}/100 [CRITICAL]`);
      } else if (val < 30) {
        parts.push(`${key.charAt(0).toUpperCase() + key.slice(1)} ${val}/100 [LOW]`);
      }
    }
    if (parts.length > 0) {
      charLines.push(`- ${c.name}: ${parts.join(', ')}`);
    }
  }
  if (charLines.length === 0) return '';
  return `UNMET CHARACTER NEEDS (factor these into the scene — affect narration, NPC reactions, and outcomes):\n${charLines.join('\n')}\n\n`;
}

export function buildMultiplayerSystemPrompt(gameState, settings, players, language = 'en', dmSettings = null) {
  const needsEnabled = settings.needsSystemEnabled === true;
  const playerList = players
    .map((p) => `- ${p.name} (${p.gender}, ${p.isHost ? 'host' : 'player'})`)
    .join('\n');

  const scenes = gameState.scenes || [];
  const total = scenes.length;
  const FULL_COUNT = 3;
  const MEDIUM_COUNT = 5;
  const parts = [];
  const compressedHistory = (gameState.world || {}).compressedHistory;
  if (compressedHistory) {
    parts.push(`ARCHIVED HISTORY (summary of earliest scenes):\n${compressedHistory}`);
  }
  const medStart = Math.max(0, total - FULL_COUNT - MEDIUM_COUNT);
  const medEnd = Math.max(0, total - FULL_COUNT);
  const medScenes = scenes.slice(medStart, medEnd);
  if (medScenes.length > 0) {
    parts.push('EARLIER SCENES (summaries):\n' + medScenes.map((s, i) => {
      const idx = medStart + i + 1;
      const actions = (s.playerActions || []).map((a) => a.action).join('; ');
      return `Scene ${idx}${actions ? ` [Actions: ${actions}]` : ''}: ${(s.narrative || '').substring(0, 500)}...`;
    }).join('\n'));
  }
  const fullScenes = scenes.slice(-FULL_COUNT);
  if (fullScenes.length > 0) {
    parts.push('RECENT SCENES (full):\n' + fullScenes.map((s, i) => {
      const idx = total - FULL_COUNT + i + 1;
      const actions = (s.playerActions || []).map((a) => a.action).join('; ');
      return `Scene ${idx}${actions ? ` [Actions: ${actions}]` : ''}:\n${s.narrative}`;
    }).join('\n\n'));
  }
  const sceneHistory = parts.join('\n\n') || 'No scenes yet - this is the beginning of the story.';

  const campaign = gameState.campaign || {};
  const world = gameState.world || {};
  const worldFacts = (world.facts || []).slice(-20).join('\n') || 'No known facts yet.';

  const npcs = world.npcs || [];
  const npcSection = npcs.length > 0
    ? npcs.map((n) => `- ${n.name} (${n.role || 'unknown'}, ${n.gender || '?'}): ${n.personality || '?'}, attitude=${n.attitude || 'neutral'}, disposition=${n.disposition || 0}`).join('\n')
    : 'No NPCs encountered yet.';

  const currentLoc = world.currentLocation || 'Unknown';

  const npcsHere = npcs.filter((n) => n.alive !== false && n.lastLocation && currentLoc && n.lastLocation.toLowerCase() === currentLoc.toLowerCase());
  const npcsHereSection = npcsHere.length > 0
    ? npcsHere.map((n) => `- ${n.name} (${n.role || 'unknown'})`).join('\n')
    : 'No known NPCs at this location.';
  const mapState = world.mapState || [];
  const mapSection = mapState.length > 0
    ? mapState.map((loc) => {
        const isCurrent = loc.name?.toLowerCase() === currentLoc?.toLowerCase();
        const mods = (loc.modifications || []).map((m) => `  · [${m.type}] ${m.description}`).join('\n');
        return `- ${loc.name}${isCurrent ? ' ← CURRENT' : ''}${loc.description ? `: ${loc.description}` : ''}${mods ? '\n' + mods : ''}`;
      }).join('\n')
    : 'No locations mapped yet.';

  const charLines = (gameState.characters || []).map((c) => {
    const attrs = c.attributes || {};
    const attrStr = Object.entries(attrs).map(([k, v]) => `${k.toUpperCase()}:${v}`).join(' ');
    let line = `- ${c.name} (${c.species || 'Human'}): Wounds ${c.wounds}/${c.maxWounds}`;
    line += `\n  Attributes: ${attrStr || 'unknown'}`;
    if (c.mana != null) line += `\n  Mana: ${c.mana}/${c.maxMana || c.mana}`;
    const skillStr = Object.entries(c.skills || {}).map(([s, v]) => `${s}:${v}`).join(', ');
    if (skillStr) line += `\n  Skills: ${skillStr}`;
    const inv = (c.inventory || []).map((i) => (typeof i === 'string' ? i : i.name)).join(', ');
    line += `\n  Inventory: ${inv || 'Empty'}`;
    const m = c.money || { gold: 0, silver: 0, copper: 0 };
    const moneyParts = [];
    if (m.gold) moneyParts.push(`${m.gold} GC`);
    if (m.silver) moneyParts.push(`${m.silver} SS`);
    if (m.copper) moneyParts.push(`${m.copper} CP`);
    line += `\n  Money: ${moneyParts.length > 0 ? moneyParts.join(' ') : '0 CP'}`;
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
- Play Style: ${settings.style || 'Hybrid'} (narrative + optional dice rolls)
- Difficulty: ${dmSettings ? (dmSettings.difficulty < 25 ? 'Easy' : dmSettings.difficulty < 50 ? 'Normal' : dmSettings.difficulty < 75 ? 'Hard' : 'Expert') : (settings.difficulty || 'Normal')}
- Dice roll frequency: ${(() => { const tf = dmSettings?.testsFrequency ?? 50; return tf < 20 ? 'rarely (only critical moments)' : tf < 40 ? 'occasionally (important actions only)' : tf < 60 ? 'regularly (most meaningful actions)' : tf < 80 ? 'frequently (most actions, including minor ones)' : 'almost always (even trivial actions)'; })() } (~${dmSettings?.testsFrequency ?? 50}% of actions should require a roll)
${dmSettings ? `- Narrative chaos: ${dmSettings.narrativeStyle < 25 ? 'Predictable' : dmSettings.narrativeStyle < 50 ? 'Balanced' : dmSettings.narrativeStyle < 75 ? 'Chaotic' : 'Wild'}
- Response length: ${dmSettings.responseLength < 33 ? 'short (2-3 sentences)' : dmSettings.responseLength < 66 ? 'medium (1-2 paragraphs)' : 'long (3+ paragraphs)'}

NARRATOR VOICE & STYLE:
- Poeticism: ${(dmSettings.narratorPoeticism ?? 50) < 25 ? 'dry and prosaic' : (dmSettings.narratorPoeticism ?? 50) < 50 ? 'moderately literary' : (dmSettings.narratorPoeticism ?? 50) < 75 ? 'poetic and evocative' : 'lushly lyrical, rich in metaphor and imagery'}
- Grittiness: ${(dmSettings.narratorGrittiness ?? 30) < 25 ? 'lighthearted and clean' : (dmSettings.narratorGrittiness ?? 30) < 50 ? 'moderately grounded' : (dmSettings.narratorGrittiness ?? 30) < 75 ? 'gritty and raw' : 'brutally dark, visceral and unflinching'}
- Environmental detail: ${(dmSettings.narratorDetail ?? 50) < 25 ? 'minimal, only essential details' : (dmSettings.narratorDetail ?? 50) < 50 ? 'balanced descriptions' : (dmSettings.narratorDetail ?? 50) < 75 ? 'rich environmental detail' : 'lavishly detailed, painting every sensory element'}
- Humor: ${(dmSettings.narratorHumor ?? 20) < 25 ? 'completely serious' : (dmSettings.narratorHumor ?? 20) < 50 ? 'occasional dry wit' : (dmSettings.narratorHumor ?? 20) < 75 ? 'frequent humor woven into narration, comedy grounded in controversial or morally ambiguous situations' : 'heavily comedic and irreverent — humor drawn from controversial topics, provocative characters, social satire, and dark irony rather than pure absurdity (think Pratchett/Monty Python: sharp wit about real uncomfortable issues)'}
- Drama: ${(dmSettings.narratorDrama ?? 50) < 25 ? 'understated and subtle' : (dmSettings.narratorDrama ?? 50) < 50 ? 'measured dramatic pacing' : (dmSettings.narratorDrama ?? 50) < 75 ? 'heightened drama and tension' : 'maximally theatrical, grandiose and operatic'}
Adapt your narration prose style to match ALL of the above parameters simultaneously.` : ''}

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

NPCs PRESENT AT CURRENT LOCATION (only these NPCs can be directly interacted with unless summoned or newly arriving):
${npcsHereSection}

CURRENT LOCATION: ${currentLoc}

MAP STATE (explored locations):
${mapSection}

ACTIVE EFFECTS (traps, spells, environmental changes — check before resolving actions in a location):
${(world.activeEffects || []).filter((e) => e.active !== false).map((e) => `- [${e.type}] ${e.description} at ${e.location || 'unknown'}${e.placedBy ? ` (by ${e.placedBy})` : ''}`).join('\n') || 'None'}

ACTIVE QUESTS:
${(gameState.quests?.active || []).map((q) => {
    let line = `- ${q.name}: ${q.description}`;
    if (q.completionCondition) line += `\n  Goal: ${q.completionCondition}`;
    if (q.objectives?.length > 0) {
      line += '\n  Objectives:';
      for (const obj of q.objectives) {
        line += `\n    [${obj.completed ? 'X' : ' '}] ${obj.description}`;
      }
    }
    return line;
  }).join('\n') || 'None'}

WORLD KNOWLEDGE:
${worldFacts}
${(() => {
  const codex = world.codex;
  if (!codex || Object.keys(codex).length === 0) return '';
  const entries = Object.values(codex).slice(0, 10);
  const lines = entries.map((e) => {
    const frags = e.fragments.map((f) => `  - [${f.aspect || 'info'}] ${f.content} (source: ${f.source})`).join('\n');
    return `* ${e.name} [${e.category}]:\n${frags}`;
  });
  return `\nPLAYER CODEX (knowledge already discovered — do NOT repeat, reveal NEW information):\n${lines.join('\n')}\n`;
})()}
SCENE HISTORY:
${sceneHistory}

LANGUAGE: Write all narrative in ${language === 'pl' ? 'Polish' : 'English'}.
${needsBlock}
NPC DISPOSITION MODIFIERS (apply when a dice roll involves direct interaction with a known NPC):
When a player attempts a social, trade, persuasion, or other interpersonal skill test involving a known NPC, look up that NPC's disposition value from the NPC REGISTRY and apply the corresponding modifier to the dice target:
  disposition >= 30 (strong ally): +15 to target
  disposition >= 15 (friendly): +10 to target
  disposition >= 5 (warm): +5 to target
  disposition -5 to +5 (neutral): no modifier
  disposition <= -5 (cool): -5 to target
  disposition <= -15 (hostile): -10 to target
  disposition <= -30 (enemy): -15 to target
When this modifier applies, include "dispositionBonus" in the diceRoll entry with the modifier value. Keep it separate from "difficultyModifier".

MULTIPLAYER INSTRUCTIONS:
1. You are running a MULTIPLAYER session using the RPGon system (d50-based). Multiple players act simultaneously each round.
2. When resolving actions, consider ALL submitted actions together and resolve them simultaneously.
3. Describe what happens to each character individually.
4. Include per-character stateChanges so each player's wounds/XP/inventory/skills can be updated independently. Use RPGon mechanics (wounds, attributes, skills).
5. All players see the same scene narrative.
6. Maintain fairness — give each player meaningful consequences for their actions.
7. Generate suggested actions that are generic enough for any player to take.
8. Update stateChanges.currentLocation when the party moves to a new location.
9. Always respond with valid JSON.
10. ITEM FORMAT: When giving items to characters via perCharacter newItems, each item MUST be an object: {"id": "item_unique_id", "name": "Item Display Name", "type": "weapon|armor|potion|scroll|tool|food|clothing|key|book|ring|ammunition|trinket|shield|misc", "description": "Short flavor text", "rarity": "common|uncommon|rare|exotic"}. NEVER omit name or description — these are displayed to players.
11. ITEM VALIDATION: Characters can ONLY use items currently listed in their inventory above. If a player's action references using an item they do not possess, the action MUST fail or the narrative should reflect they don't have it. Only include items in removeItems that the character actually has in their inventory.
12. QUEST OBJECTIVE TRACKING (CRITICAL): After writing the narrative, cross-reference ALL unchecked ACTIVE QUESTS objectives against what happened. If ANY objective was fulfilled (even partially or indirectly), you MUST include the corresponding questUpdates entry. Do NOT narrate fulfillment of an objective without marking it in questUpdates.

ACTION FEASIBILITY (MANDATORY — applies BEFORE dice roll decision):
- IMPOSSIBLE ACTIONS (auto-fail, NO dice roll): If a player attempts something physically impossible or targets someone/something not present in the scene (e.g., talking to an NPC who is not at the current location, using a feature that doesn't exist here, attacking an enemy not in combat), do NOT include a diceRolls entry for that action and narrate the failure — the character looks around but the person isn't here, reaches for something that isn't there, etc.
- TRIVIAL ACTIONS (auto-success, NO dice roll): If the action is trivially easy with no meaningful chance of failure (e.g., walking a short distance on flat ground, picking up an object at your feet, opening an unlocked door, sitting down), do NOT include a diceRolls entry and narrate the success directly.
- UNCERTAIN ACTIONS (normal dice roll): Only use dice rolls for actions with genuinely uncertain outcomes where both success and failure are plausible.
- EXCEPTIONS: A character may summon a companion/familiar, or an NPC may arrive as part of the narrative — but this should be contextually justified, not a way to bypass presence rules.
- suggestedActions MUST only include actions that are feasible given who and what is present at the current location. Do not suggest talking to NPCs who are elsewhere.

CODEX SYSTEM (detailed lore and knowledge discovery):
When any player asks about, investigates, or learns about something specific, generate a detailed codex fragment via stateChanges.codexUpdates. Each NPC reveals only ONE fragment per interaction based on their role (scholars know history, peasants know rumors, soldiers know weaknesses/locations). Check the PLAYER CODEX above — never repeat known information. Format:
{"codexUpdates": [{"id": "unique-slug", "name": "Subject Name", "category": "artifact|person|place|event|faction|creature|concept", "fragment": {"content": "2-4 sentences of specific detail...", "source": "Who revealed this", "aspect": "history|description|location|weakness|rumor|technical|political"}, "tags": ["relevant", "tags"], "relatedEntries": []}]}

CURRENCY SYSTEM:
The game uses three denominations: Gold Crown (GC), Silver Shilling (SS), Copper Penny (CP). 1 GC = 10 SS = 100 CP.
- When a character BUYS or PAYS, deduct via perCharacter moneyChange (negative deltas). If a character cannot afford the purchase, it MUST FAIL.
- When a character RECEIVES money (loot, payment, selling, rewards), use positive deltas.
- The system auto-normalizes coins.

REFERENCE PRICE LIST (adjust contextually):
Food/Drink: bread 2 CP, ale 3 CP, hot meal 8 CP, fine wine 3 SS
Lodging: common room 5 CP/night, private room 2 SS/night
Weapons: dagger 1 SS, hand weapon 1 GC, crossbow 2 GC 5 SS
Armor: leather jerkin 1 GC 2 SS, mail shirt 6 GC
Gear: rope 4 CP, torch 1 CP, lantern 5 SS, healing draught 3 SS, lockpicks 5 SS
Services: healer 5 SS, blacksmith repair 3 SS, ferry 2 CP
Animals: riding horse 50 GC, mule 15 GC`;
}
