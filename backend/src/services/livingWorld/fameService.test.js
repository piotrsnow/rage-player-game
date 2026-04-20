import { describe, it, expect } from 'vitest';
import { computeFameLabel, computeFameDelta } from './fameService.js';

describe('computeFameLabel', () => {
  it('returns null for grey characters (below 20 on both axes)', () => {
    expect(computeFameLabel(0, 0)).toBeNull();
    expect(computeFameLabel(19, 19)).toBeNull();
    expect(computeFameLabel()).toBeNull();
  });

  it('returns "znany w okolicy" at fame 20+', () => {
    expect(computeFameLabel(20, 0)).toMatchObject({ label: 'znany w okolicy', tone: 'approve' });
    expect(computeFameLabel(49, 0)).toMatchObject({ label: 'znany w okolicy' });
  });

  it('returns "sławny" at fame 50+', () => {
    expect(computeFameLabel(50, 0)).toMatchObject({ label: 'sławny', tone: 'approve' });
    expect(computeFameLabel(99, 0)).toMatchObject({ label: 'sławny' });
  });

  it('returns "legendarny" at fame 100+', () => {
    expect(computeFameLabel(100, 0)).toMatchObject({ label: 'legendarny', tone: 'approve' });
    expect(computeFameLabel(500, 0)).toMatchObject({ label: 'legendarny' });
  });

  it('infamy labels outrank fame when both cross thresholds', () => {
    expect(computeFameLabel(100, 20)).toMatchObject({ label: 'podejrzany', tone: 'disapprove' });
    expect(computeFameLabel(100, 50)).toMatchObject({ label: 'poszukiwany łotr' });
  });

  it('returns "podejrzany" at infamy 20+', () => {
    expect(computeFameLabel(0, 20)).toMatchObject({ label: 'podejrzany' });
  });

  it('returns "poszukiwany łotr" at infamy 50+', () => {
    expect(computeFameLabel(0, 50)).toMatchObject({ label: 'poszukiwany łotr' });
  });
});

describe('computeFameDelta', () => {
  it('gives +50 fame for campaign_complete global events', () => {
    expect(computeFameDelta({ eventType: 'campaign_complete', visibility: 'global' }))
      .toEqual({ fameDelta: 50, infamyDelta: 0 });
  });

  it('gives +15 fame for dungeon_cleared + deadly_victory', () => {
    expect(computeFameDelta({ eventType: 'dungeon_cleared', visibility: 'global' }))
      .toEqual({ fameDelta: 15, infamyDelta: 0 });
    expect(computeFameDelta({ eventType: 'deadly_victory', visibility: 'global' }))
      .toEqual({ fameDelta: 15, infamyDelta: 0 });
  });

  it('gives +10 fame for major_deed by default, +25 for liberation gate', () => {
    expect(computeFameDelta({ eventType: 'major_deed', visibility: 'global', payload: {} }))
      .toEqual({ fameDelta: 10, infamyDelta: 0 });
    expect(computeFameDelta({ eventType: 'major_deed', visibility: 'global', payload: { gate: 'liberation' } }))
      .toEqual({ fameDelta: 25, infamyDelta: 0 });
  });

  it('returns zeros for non-global events by default', () => {
    expect(computeFameDelta({ eventType: 'major_deed', visibility: 'campaign' }))
      .toEqual({ fameDelta: 0, infamyDelta: 0 });
  });

  it('infamy-raising events fire regardless of visibility', () => {
    expect(computeFameDelta({ eventType: 'civilian_kill', visibility: 'campaign' }))
      .toEqual({ fameDelta: 0, infamyDelta: 15 });
    expect(computeFameDelta({ eventType: 'rob', visibility: 'campaign' }))
      .toEqual({ fameDelta: 0, infamyDelta: 5 });
    expect(computeFameDelta({ eventType: 'betray', visibility: 'campaign' }))
      .toEqual({ fameDelta: 0, infamyDelta: 5 });
  });

  it('unknown event types deliver no delta', () => {
    expect(computeFameDelta({ eventType: 'something_else', visibility: 'global' }))
      .toEqual({ fameDelta: 0, infamyDelta: 0 });
  });
});
