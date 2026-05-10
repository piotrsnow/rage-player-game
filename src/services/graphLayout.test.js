import { describe, it, expect } from 'vitest';
import {
  defaultLengthKmBetweenScales,
  directionDegForChildIndex,
  normalizeDirectionDeg,
  SCALE_STEP_KM,
} from '../../shared/domain/locationGraphLayout.js';
import { directedGraphLayout } from './graphLayout.js';

describe('locationGraphLayout shared', () => {
  it('sums adjacent scale steps', () => {
    expect(defaultLengthKmBetweenScales(1, 2)).toBe(SCALE_STEP_KM[0]);
    expect(defaultLengthKmBetweenScales(2, 5)).toBe(SCALE_STEP_KM[1] + SCALE_STEP_KM[2] + SCALE_STEP_KM[3]);
  });

  it('uses small length for same scale', () => {
    expect(defaultLengthKmBetweenScales(4, 4)).toBe(0.5);
  });

  it('normalizes direction', () => {
    expect(normalizeDirectionDeg(-90)).toBe(270);
    expect(normalizeDirectionDeg(720)).toBe(0);
  });

  it('golden child angles are deterministic', () => {
    expect(directionDegForChildIndex(0)).toBe(0);
    expect(directionDegForChildIndex(1)).toBeCloseTo(137.508, 2);
  });
});

describe('directedGraphLayout', () => {
  it('places two nodes from edge metadata', () => {
    const nodes = [{ id: 'a', scale: 5 }, { id: 'b', scale: 6 }];
    const edges = [{
      id: 'e1',
      fromId: 'a',
      toId: 'b',
      bidirectional: true,
      metadata: { directionDeg: 0, lengthKm: 10 },
    }];
    const m = directedGraphLayout(nodes, edges, { width: 800, height: 600, pad: 40 });
    expect(m.has('a')).toBe(true);
    expect(m.has('b')).toBe(true);
    const pa = m.get('a');
    const pb = m.get('b');
    expect(pb.x).toBeGreaterThan(pa.x);
  });
});
