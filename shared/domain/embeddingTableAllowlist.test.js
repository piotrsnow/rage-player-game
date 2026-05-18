import { describe, it, expect } from 'vitest';
import {
  EMBEDDING_TABLE_ALLOWLIST,
  assertEmbeddingTableAllowed,
} from './embeddingTableAllowlist.js';

describe('embedding table allowlist', () => {
  it('includes unified Npc table', () => {
    expect(EMBEDDING_TABLE_ALLOWLIST.has('Npc')).toBe(true);
  });

  it('includes campaign-scope embedding tables', () => {
    expect(EMBEDDING_TABLE_ALLOWLIST.has('CampaignScene')).toBe(true);
    expect(EMBEDDING_TABLE_ALLOWLIST.has('CampaignKnowledge')).toBe(true);
    expect(EMBEDDING_TABLE_ALLOWLIST.has('CampaignCodex')).toBe(true);
  });

  it('rejects legacy CampaignNPC table name', () => {
    expect(() => assertEmbeddingTableAllowed('CampaignNPC'))
      .toThrow('table "CampaignNPC" not in allowlist');
  });

  it('rejects legacy WorldNPC table name', () => {
    expect(() => assertEmbeddingTableAllowed('WorldNPC'))
      .toThrow('table "WorldNPC" not in allowlist');
  });

  it('rejects legacy WorldLocation table name', () => {
    expect(() => assertEmbeddingTableAllowed('WorldLocation'))
      .toThrow('table "WorldLocation" not in allowlist');
  });
});
