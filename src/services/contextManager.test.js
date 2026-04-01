import { describe, expect, it } from 'vitest';
import { contextManager } from './contextManager';

describe('contextManager.retrieveRelevantKnowledge', () => {
  it('prioritizes recent critical entries tied to current action', () => {
    const gameState = {
      scenes: new Array(20).fill(null).map((_, idx) => ({ id: idx + 1 })),
      world: {
        npcs: [{ id: 'npc_1', name: 'Roch', relatedQuestIds: ['q1'] }],
      },
      quests: { active: [{ id: 'q1', name: 'Lost Sigil' }] },
    };
    const knowledgeBase = {
      events: [
        { summary: 'Old tavern rumor', tags: ['tavern'], importance: 'minor', sceneIndex: 2 },
        { summary: 'Roch revealed sigil location', tags: ['roch', 'sigil'], importance: 'critical', sceneIndex: 19 },
      ],
      decisions: [],
      plotThreads: [],
      characters: {},
      locations: {},
    };

    const result = contextManager.retrieveRelevantKnowledge(
      knowledgeBase,
      'You stand near Roch in the market.',
      'I ask Roch about the sigil',
      gameState,
      5
    );

    expect(result).toContain('Roch revealed sigil location');
    expect(result).not.toContain('Old tavern rumor');
  });
});

