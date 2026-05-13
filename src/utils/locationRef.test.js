import { describe, expect, it } from 'vitest';
import { refsEqual, refToString, parseRef, findNodeByRef } from './locationRef.js';

const UUID_A = '11111111-1111-1111-1111-111111111111';
const UUID_B = '22222222-2222-2222-2222-222222222222';

describe('locationRef.refsEqual', () => {
  it('returns true for identical refs', () => {
    expect(refsEqual({ kind: 'world', id: UUID_A }, { kind: 'world', id: UUID_A })).toBe(true);
  });

  it('returns false for different ids', () => {
    expect(refsEqual({ kind: 'world', id: UUID_A }, { kind: 'world', id: UUID_B })).toBe(false);
  });

  it('returns false for different kinds', () => {
    expect(refsEqual({ kind: 'world', id: UUID_A }, { kind: 'campaign', id: UUID_A })).toBe(false);
  });

  it('handles null inputs', () => {
    expect(refsEqual(null, null)).toBe(true);
    expect(refsEqual({ kind: 'world', id: UUID_A }, null)).toBe(false);
    expect(refsEqual(null, { kind: 'world', id: UUID_A })).toBe(false);
  });
});

describe('locationRef.refToString', () => {
  it('serializes ref to "kind:id"', () => {
    expect(refToString({ kind: 'world', id: UUID_A })).toBe(`world:${UUID_A}`);
  });

  it('returns null for invalid refs', () => {
    expect(refToString(null)).toBe(null);
    expect(refToString({})).toBe(null);
    expect(refToString({ kind: 'world' })).toBe(null);
  });
});

describe('locationRef.parseRef', () => {
  it('parses valid composite string', () => {
    expect(parseRef(`world:${UUID_A}`)).toEqual({ kind: 'world', id: UUID_A });
    expect(parseRef(`campaign:${UUID_B}`)).toEqual({ kind: 'campaign', id: UUID_B });
  });

  it('passes through valid object', () => {
    const ref = { kind: 'world', id: UUID_A };
    expect(parseRef(ref)).toEqual(ref);
  });

  it('returns null for invalid input', () => {
    expect(parseRef('')).toBe(null);
    expect(parseRef('not-a-ref')).toBe(null);
    expect(parseRef('world:not-a-uuid')).toBe(null);
    expect(parseRef('garbage:11111111-1111-1111-1111-111111111111')).toBe(null);
    expect(parseRef(null)).toBe(null);
    expect(parseRef(undefined)).toBe(null);
    expect(parseRef(42)).toBe(null);
  });

  it('normalizes kind to lowercase', () => {
    expect(parseRef(`WORLD:${UUID_A}`)).toEqual({ kind: 'world', id: UUID_A });
  });
});

describe('locationRef.findNodeByRef', () => {
  const nodes = [
    { id: UUID_A, kind: 'world', name: 'A' },
    { id: UUID_B, _kind: 'campaign', name: 'B' },
  ];

  it('finds node by composite ref', () => {
    expect(findNodeByRef(nodes, { kind: 'world', id: UUID_A })?.name).toBe('A');
  });

  it('handles _kind discriminator', () => {
    expect(findNodeByRef(nodes, { kind: 'campaign', id: UUID_B })?.name).toBe('B');
  });

  it('returns null for missing node', () => {
    expect(findNodeByRef(nodes, { kind: 'world', id: 'nope' })).toBe(null);
  });

  it('handles null inputs', () => {
    expect(findNodeByRef(null, { kind: 'world', id: UUID_A })).toBe(null);
    expect(findNodeByRef(nodes, null)).toBe(null);
  });
});
