import { describe, expect, it } from 'vitest';
import { applyMovementVector, parseMovementIntent } from './movementIntent.js';

describe('parseMovementIntent', () => {
  it('extracts "1 km na północ" → N, 1 km', () => {
    const r = parseMovementIntent('idę 1 km na północ');
    expect(r).toEqual({ azimuth: 0, distanceKm: 1 });
  });

  it('extracts "500 m na zachód" → W, 0.5 km', () => {
    const r = parseMovementIntent('ruszam 500 m na zachód');
    expect(r).toEqual({ azimuth: 270, distanceKm: 0.5 });
  });

  it('extracts "2km NE" → 45°, 2 km', () => {
    const r = parseMovementIntent('idę 2km NE');
    expect(r).toEqual({ azimuth: 45, distanceKm: 2 });
  });

  it('extracts diagonal "na północny wschód" before "na północ"', () => {
    const r = parseMovementIntent('idę 3 km na północny wschód');
    expect(r.azimuth).toBe(45);
  });

  it('south-west via "na południowy zachód"', () => {
    const r = parseMovementIntent('wyruszam 1.5 km na południowy zachód');
    expect(r).toEqual({ azimuth: 225, distanceKm: 1.5 });
  });

  it('rejects direction-only phrase (no distance) so dungeon-nav path can claim it', () => {
    expect(parseMovementIntent('idę na zachód')).toBeNull();
  });

  it('parses comma decimal "1,5 km na N"', () => {
    const r = parseMovementIntent('idę 1,5 km na N');
    expect(r).toEqual({ azimuth: 0, distanceKm: 1.5 });
  });

  it('rejects "patrzę na północ" — no movement verb', () => {
    expect(parseMovementIntent('patrzę na północ')).toBeNull();
  });

  it('rejects pure dialogue with direction word', () => {
    expect(parseMovementIntent('powiedział że są wieści z północy')).toBeNull();
  });

  it('rejects out-of-range distance >100 km', () => {
    expect(parseMovementIntent('idę 500 km na wschód')).toBeNull();
  });

  it('rejects zero distance', () => {
    expect(parseMovementIntent('idę 0 km na zachód')).toBeNull();
  });

  it('returns null when no direction is present', () => {
    expect(parseMovementIntent('idę 2 km')).toBeNull();
  });

  it('parses English variant "go 1 km north"', () => {
    const r = parseMovementIntent('I go 1 km north');
    expect(r).toEqual({ azimuth: 0, distanceKm: 1 });
  });
});

describe('applyMovementVector', () => {
  it('north (0°) increases Y', () => {
    const r = applyMovementVector(0, 0, 0, 1);
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(1);
  });

  it('east (90°) increases X', () => {
    const r = applyMovementVector(0, 0, 90, 1);
    expect(r.x).toBeCloseTo(1);
    expect(r.y).toBeCloseTo(0);
  });

  it('south (180°) decreases Y', () => {
    const r = applyMovementVector(0, 0, 180, 1);
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(-1);
  });

  it('west (270°) decreases X', () => {
    const r = applyMovementVector(0, 0, 270, 1);
    expect(r.x).toBeCloseTo(-1);
    expect(r.y).toBeCloseTo(0);
  });

  it('NE (45°) splits movement evenly', () => {
    const r = applyMovementVector(0, 0, 45, Math.SQRT2);
    expect(r.x).toBeCloseTo(1);
    expect(r.y).toBeCloseTo(1);
  });
});
