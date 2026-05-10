import { describe, it, expect } from 'vitest';
import { isVisibleInCampaign, visibleWhere } from './entityVisibility.js';

describe('isVisibleInCampaign', () => {
  it('returns false for null/undefined entity', () => {
    expect(isVisibleInCampaign(null)).toBe(false);
    expect(isVisibleInCampaign(undefined)).toBe(false);
  });

  it('returns false for soft-deleted entity regardless of other flags', () => {
    expect(isVisibleInCampaign({ globallyActive: true, softDeletedAt: new Date() })).toBe(false);
    expect(isVisibleInCampaign({ globallyActive: true, softDeletedAt: '2025-01-01', originCampaignId: 'c1' }, 'c1')).toBe(false);
  });

  it('returns true for globally active + not deleted', () => {
    expect(isVisibleInCampaign({ globallyActive: true, softDeletedAt: null })).toBe(true);
    expect(isVisibleInCampaign({ globallyActive: true })).toBe(true);
  });

  it('returns false for globally inactive without campaign context', () => {
    expect(isVisibleInCampaign({ globallyActive: false, softDeletedAt: null })).toBe(false);
    expect(isVisibleInCampaign({ globallyActive: false })).toBe(false);
  });

  it('returns true for origin campaign override (inactive but same campaign)', () => {
    expect(isVisibleInCampaign({ globallyActive: false, softDeletedAt: null, originCampaignId: 'c1' }, 'c1')).toBe(true);
  });

  it('returns false for inactive entity in a different campaign', () => {
    expect(isVisibleInCampaign({ globallyActive: false, softDeletedAt: null, originCampaignId: 'c1' }, 'c2')).toBe(false);
  });

  it('returns false for inactive entity when no campaignId provided', () => {
    expect(isVisibleInCampaign({ globallyActive: false, softDeletedAt: null, originCampaignId: 'c1' })).toBe(false);
  });
});

describe('visibleWhere', () => {
  it('returns globallyActive filter without campaignId', () => {
    const w = visibleWhere();
    expect(w.softDeletedAt).toBeNull();
    expect(w.globallyActive).toBe(true);
    expect(w.OR).toBeUndefined();
  });

  it('returns OR clause with campaignId', () => {
    const w = visibleWhere('c1');
    expect(w.softDeletedAt).toBeNull();
    expect(w.OR).toHaveLength(2);
    expect(w.OR[0]).toEqual({ globallyActive: true });
    expect(w.OR[1]).toEqual({ originCampaignId: 'c1' });
  });
});
