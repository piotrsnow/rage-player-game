import { describe, expect, it } from 'vitest';
import {
  filterDuplicateDialogueSegments,
  filterDuplicateDialogueSegmentsWithIndex,
} from './dialogueSegments';

describe('filterDuplicateDialogueSegments', () => {
  it('returns empty array when there are no segments', () => {
    expect(filterDuplicateDialogueSegments([], 'whatever')).toEqual([]);
    expect(filterDuplicateDialogueSegments(null, 'whatever')).toEqual([]);
  });

  it('keeps narration segments regardless of narrative text', () => {
    const segments = [
      { type: 'narration', text: 'A bell tolls in the distance.' },
    ];
    expect(filterDuplicateDialogueSegments(segments, 'A bell tolls in the distance.')).toEqual(segments);
  });

  it('drops dialogue that duplicates the narrative prose', () => {
    const narrative = 'The gate is sealed.';
    const segments = [
      { type: 'narration', text: narrative },
      { type: 'dialogue', character: 'Old Man', text: '"The gate is sealed."' },
      { type: 'dialogue', character: 'Guard', text: 'Come no closer.' },
    ];
    const result = filterDuplicateDialogueSegments(segments, narrative);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('narration');
    expect(result[1].character).toBe('Guard');
  });
});

describe('filterDuplicateDialogueSegmentsWithIndex', () => {
  it('tags surviving segments with their original position', () => {
    const narrative = 'The gate is sealed.';
    const segments = [
      { type: 'narration', text: narrative },
      { type: 'dialogue', character: 'Old Man', text: '"The gate is sealed."' },
      { type: 'dialogue', character: 'Guard', text: 'Come no closer.' },
    ];
    const result = filterDuplicateDialogueSegmentsWithIndex(segments, narrative);
    expect(result).toHaveLength(2);
    expect(result[0]._logicalSegmentIndex).toBe(0);
    expect(result[1]._logicalSegmentIndex).toBe(2);
    expect(result[1].character).toBe('Guard');
  });

  it('preserves every index when nothing is filtered out', () => {
    const segments = [
      { type: 'narration', text: 'First.' },
      { type: 'dialogue', character: 'A', text: 'Line one.' },
      { type: 'dialogue', character: 'B', text: 'Line two.' },
    ];
    const result = filterDuplicateDialogueSegmentsWithIndex(segments, 'Unrelated narrative.');
    expect(result.map((s) => s._logicalSegmentIndex)).toEqual([0, 1, 2]);
  });

  it('does not mutate the input segments', () => {
    const segments = [
      { type: 'dialogue', character: 'A', text: 'Line one.' },
    ];
    filterDuplicateDialogueSegmentsWithIndex(segments, 'Unrelated.');
    expect(segments[0]).not.toHaveProperty('_logicalSegmentIndex');
  });
});
