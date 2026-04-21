import { describe, it, expect } from 'vitest';
import { dijkstra, classifyDetour, DETOUR_DIRECT, DETOUR_SENSIBLE } from './travelGraph.js';

describe('travelGraph — dijkstra', () => {
  it('returns trivial path when start === end', () => {
    const adj = new Map();
    const result = dijkstra(adj, 'A', 'A');
    expect(result).toEqual({ path: ['A'], distance: 0, hops: 0 });
  });

  it('returns null on disconnected graph', () => {
    const adj = new Map([
      ['A', [{ toId: 'B', distance: 2 }]],
      ['C', [{ toId: 'D', distance: 2 }]],
    ]);
    expect(dijkstra(adj, 'A', 'D')).toBeNull();
  });

  it('finds single-hop path', () => {
    const adj = new Map([
      ['A', [{ toId: 'B', distance: 5 }]],
    ]);
    const result = dijkstra(adj, 'A', 'B');
    expect(result.path).toEqual(['A', 'B']);
    expect(result.distance).toBe(5);
    expect(result.hops).toBe(1);
  });

  it('prefers lowest-distance path on multi-hop', () => {
    // A→B→C (2+2=4) vs A→C direct (10). Should pick multi-hop.
    const adj = new Map([
      ['A', [{ toId: 'B', distance: 2 }, { toId: 'C', distance: 10 }]],
      ['B', [{ toId: 'C', distance: 2 }]],
    ]);
    const result = dijkstra(adj, 'A', 'C');
    expect(result.path).toEqual(['A', 'B', 'C']);
    expect(result.distance).toBe(4);
    expect(result.hops).toBe(2);
  });

  it('handles graph with branches', () => {
    //   B(3)
    //  /    \
    // A      D
    //  \    /
    //   C(2,4)
    // A→B→D = 3+3 = 6; A→C→D = 2+4 = 6 (tie, first discovered wins)
    const adj = new Map([
      ['A', [{ toId: 'B', distance: 3 }, { toId: 'C', distance: 2 }]],
      ['B', [{ toId: 'D', distance: 3 }]],
      ['C', [{ toId: 'D', distance: 4 }]],
    ]);
    const result = dijkstra(adj, 'A', 'D');
    expect(result.distance).toBe(6);
    expect(result.hops).toBe(2);
    expect(result.path[0]).toBe('A');
    expect(result.path[2]).toBe('D');
  });
});

describe('travelGraph — classifyDetour', () => {
  const A = { regionX: 0, regionY: 0 };
  const B = { regionX: 10, regionY: 0 };

  it('returns direct when path ≈ straight line', () => {
    const d = classifyDetour({ pathDistance: 10, start: A, end: B });
    expect(d).toBe('direct');
  });

  it('returns sensible for 1.3 ≤ ratio < 2.0', () => {
    const d = classifyDetour({ pathDistance: 15, start: A, end: B }); // 1.5x
    expect(d).toBe('sensible');
  });

  it('returns long for ratio ≥ 2.0', () => {
    const d = classifyDetour({ pathDistance: 22, start: A, end: B }); // 2.2x
    expect(d).toBe('long');
  });

  it('handles trivial endpoints', () => {
    expect(classifyDetour({ pathDistance: 0, start: A, end: B })).toBe('trivial');
    expect(classifyDetour({ pathDistance: 10, start: A, end: A })).toBe('trivial');
  });

  it('detour boundaries match exported constants', () => {
    const boundary = {
      pathDistance: 10 * DETOUR_DIRECT,
      start: A,
      end: B,
    };
    // Exactly at boundary → sensible (strict < on the 'direct' side)
    expect(classifyDetour(boundary)).toBe('sensible');

    const longBoundary = {
      pathDistance: 10 * DETOUR_SENSIBLE,
      start: A,
      end: B,
    };
    expect(classifyDetour(longBoundary)).toBe('long');
  });
});
