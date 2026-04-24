/**
 * Campaign header + narrator voice sliders + NPC dialogue style separation.
 *
 * The narrator sliders (poeticism/grittiness/detail/humor/drama) only apply
 * to `dialogueSegments.type==='narration'`. NPC dialogue follows each NPC's
 * own personality/notes — never the sliders — so a peasant doesn't end up
 * sounding like a scholar because the DM cranked "poeticism" to max.
 */

import {
  difficultyLabel,
  narrativeLabel,
  responseLengthLabel,
  sliderLabel,
} from '../labels.js';

export function buildDmSettingsBlock(campaign, dmSettings) {
  const poeticism = sliderLabel(dmSettings.narratorPoeticism ?? 50, ['dry', 'moderate', 'poetic', 'lyrical']);
  const grittiness = sliderLabel(dmSettings.narratorGrittiness ?? 30, ['lighthearted', 'grounded', 'gritty', 'brutal']);
  const detail = sliderLabel(dmSettings.narratorDetail ?? 50, ['minimal', 'balanced', 'rich', 'lavish']);
  const humor = sliderLabel(dmSettings.narratorHumor ?? 20, ['serious', 'dry wit', 'frequent humor', 'comedic']);
  const drama = sliderLabel(dmSettings.narratorDrama ?? 50, ['understated', 'measured', 'heightened', 'theatrical']);

  return `You are the Game Master for "${campaign.name || 'Unnamed'}", an RPGon custom RPG.
System: d50 + attribute (1-25) + skill (0-25) + momentum (±10) vs difficulty threshold (20/35/50/65/80). Szczescie gives X% auto-success. Mana for spells (1-5 cost). 9 spell trees with progression.
Genre: ${campaign.genre || 'Fantasy'} | Tone: ${campaign.tone || 'Dark'} | Style: ${campaign.style || 'Hybrid'}
Difficulty: ${difficultyLabel(dmSettings.difficulty ?? 50)} | Narrative chaos: ${narrativeLabel(dmSettings.narrativeStyle ?? 50)}
Response length: ${responseLengthLabel(dmSettings.responseLength ?? 50)}

NARRATOR VOICE — applies ONLY to dialogueSegments where type="narration":
- poeticism=${poeticism}, grittiness=${grittiness}, detail=${detail}, humor=${humor}, drama=${drama}
${dmSettings.narratorCustomInstructions ? `- Extra narrator instructions: ${dmSettings.narratorCustomInstructions}` : ''}
These parameters shape the narrator's prose style. They MUST NOT affect how NPCs speak.

NPC DIALOGUE STYLE — applies ONLY to dialogueSegments where type="dialogue":
- Each NPC's speech derives from their own personality and notes fields below — NOT from narrator sliders.
- Overall flavor follows the campaign tone "${campaign.tone || 'Dark'}" (Dark=grim/terse/weighted, Epic=grand/formal/heroic, Humorous=witty/playful/irreverent).
- A peasant does not sound like a scholar. Match vocabulary and register to role/personality/notes.
- Narrator poeticism/drama/humor DO NOT apply here — NPCs have their own voices.`;
}
