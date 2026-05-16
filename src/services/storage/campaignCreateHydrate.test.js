import { describe, it, expect } from 'vitest';
import { extractWorldHydrationFromCreateResponse } from './campaignCreateHydrate.js';

describe('extractWorldHydrationFromCreateResponse', () => {
  it('returns null when no location data', () => {
    expect(extractWorldHydrationFromCreateResponse(null)).toBeNull();
    expect(extractWorldHydrationFromCreateResponse({ coreState: {} })).toBeNull();
  });

  it('reads location from coreState.world', () => {
    const patch = extractWorldHydrationFromCreateResponse({
      coreState: {
        world: {
          currentLocation: 'Koszary',
          currentLocationRef: { kind: 'world', id: 'aaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
          npcs: [{ name: 'Guard' }],
        },
      },
    });
    expect(patch.currentLocation).toBe('Koszary');
    expect(patch.currentLocationRef).toEqual({ kind: 'world', id: 'aaa-bbbb-cccc-dddd-eeeeeeeeeeee' });
    expect(patch.npcs).toHaveLength(1);
  });

  it('falls back to top-level campaign columns', () => {
    const patch = extractWorldHydrationFromCreateResponse({
      currentLocationName: 'Plac',
      currentLocationKind: 'world',
      currentLocationId: '11111111-1111-4111-8111-111111111111',
    });
    expect(patch.currentLocation).toBe('Plac');
    expect(patch.currentLocationRef).toEqual({
      kind: 'world',
      id: '11111111-1111-4111-8111-111111111111',
    });
  });
});
