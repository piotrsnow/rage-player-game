import { describe, it, expect } from 'vitest';
import {
  selectRelevantOpportunities,
  enrichOpportunityWithRelations,
  gameTimeAgoLabel,
  preparePendingHooksForPrompt,
} from './questEmergence.js';

const day = (n) => new Date(Date.UTC(2026, 0, n));
const hours = (h) => new Date(Date.UTC(2026, 0, 1, h));

function ev({ id, hours: h = 0, day: d = 1, payload, worldNpcId = 'wn1' }) {
  return {
    hookId: id,
    worldNpcId,
    gameTime: new Date(Date.UTC(2026, 0, d, h)),
    payload: { questGiverName: 'X', pitch: 'Help', involvedNpcs: [], ...(payload || {}) },
  };
}

describe('selectRelevantOpportunities', () => {
  it('drops materialized hooks', () => {
    const events = [
      ev({ id: 1 }),
      ev({ id: 2, payload: { materializedAs: 'q1' } }),
    ];
    const out = selectRelevantOpportunities(events, { currentGameTime: day(2) });
    expect(out.map((e) => e.hookId)).toEqual([1]);
  });

  it('respects maxAgeDays cutoff', () => {
    const events = [
      // gametime conversion: ratio domyślnie 24 nie wpływa na select
      // (filter używa surowych Date) — test sprawdza tylko że stare są wyrzucone.
      ev({ id: 1, day: 1 }),    // bardzo stary
      ev({ id: 2, day: 25 }),   // świeży
    ];
    // currentGameTime = day 30, cutoff 7 days back = day 23
    const out = selectRelevantOpportunities(events, { currentGameTime: day(30), maxAgeDays: 7 });
    expect(out.map((e) => e.hookId)).toEqual([2]);
  });

  it('caps to maxCount', () => {
    const events = Array.from({ length: 10 }, (_, i) => ev({ id: i, day: 28 }));
    const out = selectRelevantOpportunities(events, { currentGameTime: day(30), maxCount: 3 });
    expect(out).toHaveLength(3);
  });
});

describe('enrichOpportunityWithRelations', () => {
  it('adds relations for source NPCs in hook scope', () => {
    const opp = {
      hookId: 1,
      payload: { questGiverName: 'Marek', involvedNpcs: ['Olek'], pitch: '...' },
    };
    const rels = [
      { sourceName: 'Marek', targetName: 'Olek', relation: 'brother of', strength: 80 },
      { sourceName: 'Olek', targetName: 'Marek', relation: 'brother of', strength: 80 },
      { sourceName: 'OutOfScope', targetName: 'NoOne', relation: 'rival of', strength: -50 },
    ];
    const enriched = enrichOpportunityWithRelations(opp, rels);
    expect(enriched.relations).toHaveLength(2);  // OutOfScope filtered
    expect(enriched.relations[0]).toContain('brother of');
    expect(enriched.relations[0]).toContain('<->');  // both in scope
  });

  it('uses --> arrow when target outside hook scope', () => {
    const opp = {
      hookId: 1,
      payload: { questGiverName: 'Marek', involvedNpcs: [], pitch: '...' },
    };
    const rels = [
      { sourceName: 'Marek', targetName: 'Outsider', relation: 'rival of', strength: -50 },
    ];
    const enriched = enrichOpportunityWithRelations(opp, rels);
    expect(enriched.relations[0]).toContain('-->');
    expect(enriched.relations[0]).not.toContain('<->');
  });

  it('handles missing payload safely', () => {
    expect(enrichOpportunityWithRelations(null, [])).toEqual(null);
    expect(enrichOpportunityWithRelations({}, [])).toEqual({});
  });
});

describe('gameTimeAgoLabel', () => {
  it('returns recently within game-day cutoff', () => {
    expect(gameTimeAgoLabel(hours(0), hours(1), 24)).toBe('recently');
  });
  it('returns 1 day for ~24h game-time gap', () => {
    expect(gameTimeAgoLabel(day(1), day(2), 24)).toBe('1 day ago');
  });
  it('marks stale beyond a week', () => {
    expect(gameTimeAgoLabel(day(1), day(15), 24)).toContain('days ago (stale)');
  });
});

describe('preparePendingHooksForPrompt — integration', () => {
  it('select + enrich + label end-to-end', () => {
    const events = [
      ev({ id: 1, day: 28, payload: { questGiverName: 'Marek', pitch: 'Pomóż mi', involvedNpcs: ['Olek'] } }),
    ];
    const rels = [{ sourceName: 'Marek', targetName: 'Olek', relation: 'brother of', strength: 80 }];
    const prepared = preparePendingHooksForPrompt({
      events,
      npcRelationships: rels,
      currentGameTime: day(30),
      maxAgeDays: 7,
    });
    expect(prepared).toHaveLength(1);
    const hook = prepared[0];
    expect(hook.questGiverName).toBe('Marek');
    expect(hook.relations).toHaveLength(1);
    expect(hook.gameTimeAgoLabel).toMatch(/days ago/);
  });
});
