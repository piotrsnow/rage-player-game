import { describe, expect, it } from 'vitest';
import { detectLocationType } from './scenePlanner.js';

describe('scenePlanner.detectLocationType', () => {
  describe('legacy string path', () => {
    it('returns generic for empty input', () => {
      expect(detectLocationType('')).toBe('generic');
      expect(detectLocationType(null)).toBe('generic');
      expect(detectLocationType(undefined)).toBe('generic');
    });

    it('detects tavern keywords', () => {
      expect(detectLocationType('The Drunken Horse Inn')).toBe('tavern');
      expect(detectLocationType('Stara karczma')).toBe('tavern');
    });

    it('detects forest keywords', () => {
      expect(detectLocationType('Mglisty las')).toBe('forest');
      expect(detectLocationType('Forest clearing')).toBe('forest');
    });

    it('falls back to generic for unknown strings', () => {
      expect(detectLocationType('Xyzzy 12345')).toBe('generic');
    });
  });

  describe('node-based path (Faza 1)', () => {
    it('respects explicit anchorType override', () => {
      const node = { name: 'whatever', anchorType: 'tavern' };
      expect(detectLocationType(node)).toBe('tavern');
    });

    it('maps Prisma locationType to anchor key', () => {
      expect(detectLocationType({ name: '', locationType: 'forest' })).toBe('forest');
      expect(detectLocationType({ name: '', locationType: 'dungeon' })).toBe('dungeon');
      expect(detectLocationType({ name: '', locationType: 'capital' })).toBe('castle');
      expect(detectLocationType({ name: '', locationType: 'town' })).toBe('city_street');
    });

    it('falls through to keyword scan on name when locationType is generic', () => {
      const node = { name: 'Stara karczma', locationType: 'generic' };
      expect(detectLocationType(node)).toBe('tavern');
    });

    it('falls through to keyword scan on tags', () => {
      const node = { name: 'No-Name Place', tags: ['castle', 'royal'] };
      expect(detectLocationType(node)).toBe('castle');
    });

    it('returns generic when nothing matches', () => {
      const node = { name: 'Xyzzy', tags: ['nonsense'] };
      expect(detectLocationType(node)).toBe('generic');
    });

    it('anchorType beats locationType', () => {
      const node = { name: '', anchorType: 'forest', locationType: 'capital' };
      expect(detectLocationType(node)).toBe('forest');
    });

    it('handles missing fields gracefully', () => {
      expect(detectLocationType({})).toBe('generic');
    });
  });
});
