import { describe, it, expect } from 'vitest';
import { isNpcAtLocation, filterNpcsHere } from './npcLocation.js';

const worldRef = { kind: 'world', id: 'loc-1' };
const campaignRef = { kind: 'campaign', id: 'loc-2' };

describe('isNpcAtLocation', () => {
  it('matches by composite ref when both sides have one', () => {
    const npc = { name: 'Gareth', alive: true, locationRef: worldRef, lastLocation: 'Yeralden' };
    expect(isNpcAtLocation(npc, worldRef, 'Yeralden')).toBe(true);
    expect(isNpcAtLocation(npc, campaignRef, 'Yeralden')).toBe(false);
  });

  it('falls back to case-insensitive string when NPC has no locationRef', () => {
    const npc = { name: 'Gareth', alive: true, locationRef: null, lastLocation: 'Yeralden' };
    expect(isNpcAtLocation(npc, worldRef, 'yeralden')).toBe(true);
    expect(isNpcAtLocation(npc, worldRef, 'Kamionka')).toBe(false);
  });

  it('falls back to string when currentLocationRef is null', () => {
    const npc = { name: 'Gareth', alive: true, locationRef: worldRef, lastLocation: 'Yeralden' };
    expect(isNpcAtLocation(npc, null, 'Yeralden')).toBe(true);
    expect(isNpcAtLocation(npc, null, 'Kamionka')).toBe(false);
  });

  it('returns false for null npc', () => {
    expect(isNpcAtLocation(null, worldRef, 'Yeralden')).toBe(false);
  });

  it('returns false when NPC has no location data at all', () => {
    const npc = { name: 'Gareth', alive: true, locationRef: null, lastLocation: null };
    expect(isNpcAtLocation(npc, worldRef, 'Yeralden')).toBe(false);
  });
});

describe('filterNpcsHere', () => {
  const npcs = [
    { name: 'A', alive: true, locationRef: worldRef, lastLocation: 'Yeralden' },
    { name: 'B', alive: false, locationRef: worldRef, lastLocation: 'Yeralden' },
    { name: 'C', alive: true, locationRef: campaignRef, lastLocation: 'Kamionka' },
    { name: 'D', alive: true, locationRef: null, lastLocation: 'Yeralden' },
  ];

  it('returns only alive NPCs at the matching ref location', () => {
    const result = filterNpcsHere(npcs, worldRef, 'Yeralden');
    expect(result.map(n => n.name)).toEqual(['A', 'D']);
  });

  it('excludes dead NPCs even if location matches', () => {
    const result = filterNpcsHere(npcs, worldRef, 'Yeralden');
    expect(result.find(n => n.name === 'B')).toBeUndefined();
  });

  it('returns empty for non-array input', () => {
    expect(filterNpcsHere(null, worldRef, 'Yeralden')).toEqual([]);
    expect(filterNpcsHere(undefined, worldRef, 'Yeralden')).toEqual([]);
  });

  it('returns NPCs at campaign ref location', () => {
    const result = filterNpcsHere(npcs, campaignRef, 'Kamionka');
    expect(result.map(n => n.name)).toEqual(['C']);
  });
});
