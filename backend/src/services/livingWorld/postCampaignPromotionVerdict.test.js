import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../aiJsonCall.js', () => ({
  callAIJson: vi.fn(),
  parseJsonOrNull: (text) => {
    if (!text) return null;
    try { return JSON.parse(text); } catch { return null; }
  },
}));

import { callAIJson } from '../aiJsonCall.js';
import {
  classifyVerdict,
  parseVerdictOutput,
  getVerdictForCandidate,
  runVerdictForCandidates,
} from './postCampaignPromotionVerdict.js';

beforeEach(() => {
  callAIJson.mockReset();
});

describe('classifyVerdict (pure)', () => {
  it('returns pending with no auto-reason when verdict is null', () => {
    expect(classifyVerdict(null)).toEqual({ status: 'pending', autoReason: null });
  });

  it('rejects when recommend=no', () => {
    const out = classifyVerdict({
      recommend: 'no', uniqueness: 8, worldFit: 9, reasons: ['tonally off'],
    });
    expect(out.status).toBe('rejected');
    expect(out.autoReason).toContain('tonally off');
  });

  it('rejects when uniqueness<5 even with recommend=yes', () => {
    const out = classifyVerdict({
      recommend: 'yes', uniqueness: 4, worldFit: 9, reasons: ['generic archetype'],
    });
    expect(out.status).toBe('rejected');
    expect(out.autoReason).toContain('generic archetype');
  });

  it('keeps pending when recommend=yes AND uniqueness>=5', () => {
    const out = classifyVerdict({
      recommend: 'yes', uniqueness: 7, worldFit: 8, reasons: ['distinct voice'],
    });
    expect(out).toEqual({ status: 'pending', autoReason: null });
  });

  it('keeps pending when recommend=unsure AND uniqueness>=5 (admin decides)', () => {
    const out = classifyVerdict({
      recommend: 'unsure', uniqueness: 6, worldFit: 5, reasons: [],
    });
    expect(out.status).toBe('pending');
  });

  it('synthesises a generic auto-reason when reasons array is empty', () => {
    const out = classifyVerdict({
      recommend: 'no', uniqueness: 3, worldFit: 3, reasons: [],
    });
    expect(out.autoReason).toMatch(/auto-reject/i);
  });
});

describe('parseVerdictOutput (pure)', () => {
  it('accepts a valid payload', () => {
    const v = parseVerdictOutput({
      recommend: 'yes', uniqueness: 7, worldFit: 8, reasons: ['a', 'b'],
    });
    expect(v.recommend).toBe('yes');
  });

  it('rejects invalid recommend value', () => {
    expect(parseVerdictOutput({
      recommend: 'maybe', uniqueness: 5, worldFit: 5, reasons: [],
    })).toBeNull();
  });

  it('rejects out-of-range scores', () => {
    expect(parseVerdictOutput({
      recommend: 'yes', uniqueness: 15, worldFit: 8, reasons: [],
    })).toBeNull();
  });

  it('rejects non-integer scores', () => {
    expect(parseVerdictOutput({
      recommend: 'yes', uniqueness: 5.5, worldFit: 8, reasons: [],
    })).toBeNull();
  });
});

describe('getVerdictForCandidate (I/O)', () => {
  const baseInput = () => ({
    npc: { name: 'Gerent', role: 'guard captain', personality: 'stern veteran' },
    stats: { interactionCount: 5, score: 18 },
    dialogSample: 'Halt!\nWho goes there?',
  });

  it('returns verdict on happy path', async () => {
    callAIJson.mockResolvedValue({
      text: JSON.stringify({ recommend: 'yes', uniqueness: 7, worldFit: 8, reasons: ['memorable'] }),
    });
    const { verdict, warning } = await getVerdictForCandidate(baseInput());
    expect(warning).toBeUndefined();
    expect(verdict.recommend).toBe('yes');
  });

  it('returns provider_error when callAIJson throws', async () => {
    callAIJson.mockRejectedValue(new Error('rate limited'));
    const res = await getVerdictForCandidate(baseInput());
    expect(res.verdict).toBeNull();
    expect(res.warning).toBe('provider_error');
  });

  it('returns invalid_json when response text is not JSON', async () => {
    callAIJson.mockResolvedValue({ text: 'sorry, no JSON for you' });
    const res = await getVerdictForCandidate(baseInput());
    expect(res.verdict).toBeNull();
    expect(res.warning).toBe('invalid_json');
  });

  it('returns schema_miss when JSON is off-shape', async () => {
    callAIJson.mockResolvedValue({
      text: JSON.stringify({ recommend: 'maybe', uniqueness: 5, worldFit: 5, reasons: [] }),
    });
    const res = await getVerdictForCandidate(baseInput());
    expect(res.verdict).toBeNull();
    expect(res.warning).toBe('schema_miss');
  });

  it('guards against missing npc', async () => {
    const res = await getVerdictForCandidate({ npc: null });
    expect(res.warning).toBe('missing_npc');
    expect(callAIJson).not.toHaveBeenCalled();
  });

  it('defaults to anthropic/standard provider + tier', async () => {
    callAIJson.mockResolvedValue({
      text: JSON.stringify({ recommend: 'yes', uniqueness: 7, worldFit: 7, reasons: [] }),
    });
    await getVerdictForCandidate(baseInput());
    expect(callAIJson).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'anthropic',
      modelTier: 'standard',
      temperature: 0,
    }));
  });
});

describe('runVerdictForCandidates (fan-out)', () => {
  it('parallels verdict calls and keys results by campaignNpcId', async () => {
    callAIJson.mockImplementation(() => Promise.resolve({
      text: JSON.stringify({ recommend: 'yes', uniqueness: 6, worldFit: 6, reasons: [] }),
    }));
    const candidates = [
      { npc: { id: 'cn1', name: 'A' }, stats: {} },
      { npc: { id: 'cn2', name: 'B' }, stats: {} },
    ];
    const result = await runVerdictForCandidates(candidates);
    expect(result.size).toBe(2);
    expect(result.get('cn1').verdict.recommend).toBe('yes');
    expect(result.get('cn2').verdict.recommend).toBe('yes');
  });

  it('isolates failures per candidate', async () => {
    callAIJson
      .mockResolvedValueOnce({ text: JSON.stringify({
        recommend: 'yes', uniqueness: 7, worldFit: 7, reasons: [],
      }) })
      .mockRejectedValueOnce(new Error('one failed'));
    const result = await runVerdictForCandidates([
      { npc: { id: 'cn1', name: 'A' }, stats: {} },
      { npc: { id: 'cn2', name: 'B' }, stats: {} },
    ]);
    expect(result.get('cn1').verdict).not.toBeNull();
    expect(result.get('cn2').warning).toBe('provider_error');
  });

  it('returns empty map for empty input', async () => {
    const r = await runVerdictForCandidates([]);
    expect(r.size).toBe(0);
    expect(callAIJson).not.toHaveBeenCalled();
  });
});
