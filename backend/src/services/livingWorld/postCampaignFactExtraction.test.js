import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock aiJsonCall BEFORE importing the module under test. The module pulls
// `callAIJson` at import time via ES module binding; we swap the export here
// so each test can control the LLM response shape.
vi.mock('../aiJsonCall.js', () => ({
  callAIJson: vi.fn(),
  parseJsonOrNull: (text) => {
    if (!text) return null;
    try { return JSON.parse(text); } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) { try { return JSON.parse(m[0]); } catch { return null; } }
      return null;
    }
  },
}));

import { callAIJson } from '../aiJsonCall.js';
import {
  buildFactExtractionInput,
  parseFactExtractionOutput,
  extractWorldFacts,
} from './postCampaignFactExtraction.js';

beforeEach(() => {
  callAIJson.mockReset();
});

describe('buildFactExtractionInput', () => {
  it('returns empty slice when coreState is null/undefined', () => {
    expect(buildFactExtractionInput(null)).toEqual({
      gameStateSummary: [], journalEntries: [], keyPlotFacts: [], campaign: null, shadowDiffSummary: null,
    });
    expect(buildFactExtractionInput(undefined)).toMatchObject({ gameStateSummary: [] });
  });

  it('normalizes gameStateSummary items — both legacy string[] and {fact} objects', () => {
    const coreState = {
      gameStateSummary: [
        'legacy plain fact',
        { fact: 'new shape fact', sceneIndex: 3 },
        { fact: '', sceneIndex: 4 }, // empty fact — filtered
        { sceneIndex: 5 }, // no fact field — filtered
      ],
    };
    const input = buildFactExtractionInput(coreState);
    expect(input.gameStateSummary).toEqual(['legacy plain fact', 'new shape fact']);
  });

  it('pulls keyPlotFacts from world.keyPlotFacts', () => {
    const coreState = { world: { keyPlotFacts: ['king is alive', 'dragon sleeps under keep'] } };
    expect(buildFactExtractionInput(coreState).keyPlotFacts).toHaveLength(2);
  });

  it('skips non-string journal and plot entries defensively', () => {
    const coreState = {
      journalEntries: ['valid entry', null, 42, 'another'],
      world: { keyPlotFacts: ['ok', undefined, { something: 'else' }] },
    };
    const input = buildFactExtractionInput(coreState);
    expect(input.journalEntries).toEqual(['valid entry', 'another']);
    expect(input.keyPlotFacts).toEqual(['ok']);
  });

  it('passes through campaign metadata and shadow diff summary', () => {
    const coreState = { campaign: { name: 'Mroczna Przysięga', genre: 'dark_fantasy', tone: 'grim' } };
    const shadowDiff = { npcsWithChanges: 2, fieldCounts: { alive: 1, location: 1 } };
    const input = buildFactExtractionInput(coreState, shadowDiff);
    expect(input.campaign).toEqual({ name: 'Mroczna Przysięga', genre: 'dark_fantasy', tone: 'grim' });
    expect(input.shadowDiffSummary).toBe(shadowDiff);
  });
});

describe('parseFactExtractionOutput', () => {
  const validChange = {
    kind: 'npcDeath',
    targetHint: 'Kapitan Gerent',
    newValue: 'zabity przez gracza w walce w twierdzy',
    confidence: 0.9,
    reason: 'memory fact #3 says Gerent died at keep',
  };

  it('accepts well-formed output', () => {
    const { changes } = parseFactExtractionOutput({ worldChanges: [validChange] });
    expect(changes).toEqual([validChange]);
  });

  it('returns empty changes when raw is null or non-object', () => {
    expect(parseFactExtractionOutput(null)).toEqual({ changes: [] });
    expect(parseFactExtractionOutput('not json')).toEqual({ changes: [] });
    expect(parseFactExtractionOutput({ nothing: 'here' })).toEqual({ changes: [] });
  });

  it('salvages valid entries and drops malformed ones individually', () => {
    const raw = {
      worldChanges: [
        validChange,
        { ...validChange, kind: 'unknownKind' }, // bad enum → dropped
        { ...validChange, confidence: 2 }, // out of range → dropped
        { ...validChange, targetHint: '' }, // empty hint → dropped
        { ...validChange, kind: 'newRumor', targetHint: 'Arcykapłanka Lyana', newValue: 'widziana w Świetłogaju' },
      ],
    };
    const { changes } = parseFactExtractionOutput(raw);
    expect(changes).toHaveLength(2);
    expect(changes.map((c) => c.kind)).toEqual(['npcDeath', 'newRumor']);
  });

  it('caps at MAX_CHANGES (10)', () => {
    const many = Array.from({ length: 15 }, (_, i) => ({
      ...validChange,
      targetHint: `NPC_${i}`,
    }));
    const { changes } = parseFactExtractionOutput({ worldChanges: many });
    expect(changes).toHaveLength(10);
  });

  it('caps long string fields via Zod max()', () => {
    const longHint = 'x'.repeat(200); // 200 > 150 max → entry dropped
    const { changes } = parseFactExtractionOutput({
      worldChanges: [{ ...validChange, targetHint: longHint }],
    });
    expect(changes).toHaveLength(0);
  });
});

describe('extractWorldFacts', () => {
  const coreState = {
    campaign: { name: 'Test', genre: 'fantasy', tone: 'heroic' },
    gameStateSummary: [{ fact: 'Kapitan Gerent zginął pod bramą.', sceneIndex: 5 }],
    world: { keyPlotFacts: ['Wioska Świetłogaj spalona przez bandytów.'] },
    journalEntries: ['Gracz odzyskał miecz dynastii.'],
  };

  it('skips the call when no memory content is present', async () => {
    const result = await extractWorldFacts({ campaignId: 'c1', coreState: {} });
    expect(result).toEqual({ changes: [], warning: 'no_memory' });
    expect(callAIJson).not.toHaveBeenCalled();
  });

  it('returns parsed changes on happy path', async () => {
    callAIJson.mockResolvedValue({
      text: JSON.stringify({
        worldChanges: [
          {
            kind: 'npcDeath',
            targetHint: 'Kapitan Gerent',
            newValue: 'zabity pod bramą',
            confidence: 0.85,
            reason: 'summary fact #1',
          },
        ],
      }),
      usage: null,
    });
    const result = await extractWorldFacts({ campaignId: 'c1', coreState });
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].kind).toBe('npcDeath');
  });

  it('forwards modelTier + provider + userApiKeys to callAIJson', async () => {
    callAIJson.mockResolvedValue({ text: '{"worldChanges":[]}' });
    await extractWorldFacts({
      campaignId: 'c1',
      coreState,
      modelTier: 'standard',
      provider: 'anthropic',
      userApiKeys: { anthropic: 'sk-test' },
    });
    expect(callAIJson).toHaveBeenCalledWith(expect.objectContaining({
      modelTier: 'standard',
      provider: 'anthropic',
      userApiKeys: { anthropic: 'sk-test' },
      temperature: 0,
    }));
  });

  it('includes shadow diff summary in the user prompt when provided', async () => {
    callAIJson.mockResolvedValue({ text: '{"worldChanges":[]}' });
    await extractWorldFacts({
      campaignId: 'c1',
      coreState,
      shadowDiffSummary: { npcsWithChanges: 3, fieldCounts: { alive: 2, location: 1 } },
    });
    const userPrompt = callAIJson.mock.calls[0][0].userPrompt;
    expect(userPrompt).toContain('Shadow diff already detected');
    expect(userPrompt).toContain('alive=2');
    expect(userPrompt).toContain('location=1');
  });

  it('returns warning on provider error (non-throwing)', async () => {
    callAIJson.mockRejectedValue(new Error('rate limit'));
    const result = await extractWorldFacts({ campaignId: 'c1', coreState });
    expect(result).toEqual({ changes: [], warning: 'provider_error' });
  });

  it('returns warning on unparseable JSON', async () => {
    callAIJson.mockResolvedValue({ text: 'this is not json at all' });
    const result = await extractWorldFacts({ campaignId: 'c1', coreState });
    expect(result).toEqual({ changes: [], warning: 'invalid_json' });
  });

  it('drops malformed entries but still returns valid ones', async () => {
    callAIJson.mockResolvedValue({
      text: JSON.stringify({
        worldChanges: [
          { kind: 'npcDeath', targetHint: 'Gerent', newValue: 'dead', confidence: 0.9, reason: 'fact 1' },
          { kind: 'invalidKind', targetHint: 'X', newValue: 'y', confidence: 0.5, reason: 'z' },
        ],
      }),
    });
    const result = await extractWorldFacts({ campaignId: 'c1', coreState });
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].targetHint).toBe('Gerent');
  });
});
