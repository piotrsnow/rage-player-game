import { describe, it, expect } from 'vitest';
import {
  safeParseJSON,
  stripMarkdownFences,
  parseAIResponseLean,
} from '../domain/aiResponseParser.js';

describe('safeParseJSON', () => {
  it('passes through already-parsed objects', () => {
    const obj = { a: 1 };
    expect(safeParseJSON(obj)).toEqual({ ok: true, data: obj });
  });

  it('parses plain JSON strings', () => {
    expect(safeParseJSON('{"x":2}')).toEqual({ ok: true, data: { x: 2 } });
  });

  it('extracts first {...} block when text has noise around it', () => {
    const raw = 'Here is the response:\n{"ok": true}\nThanks!';
    expect(safeParseJSON(raw)).toEqual({ ok: true, data: { ok: true } });
  });

  it('returns ok:false for unrecoverable input', () => {
    const result = safeParseJSON('not json at all');
    expect(result.ok).toBe(false);
  });
});

describe('stripMarkdownFences', () => {
  it('strips ```json fences', () => {
    expect(stripMarkdownFences('```json\n{"x":1}\n```')).toBe('{"x":1}');
  });

  it('strips unlabeled ``` fences', () => {
    expect(stripMarkdownFences('```\n{"y":2}\n```')).toBe('{"y":2}');
  });

  it('returns unchanged text when no fences present', () => {
    expect(stripMarkdownFences('{"z":3}')).toBe('{"z":3}');
  });
});

describe('parseAIResponseLean', () => {
  it('throws on empty input', () => {
    expect(() => parseAIResponseLean('')).toThrow(/Empty AI response/);
  });

  it('throws on invalid JSON', () => {
    expect(() => parseAIResponseLean('not json')).toThrow(/Failed to parse/);
  });

  it('fills all default fields for minimal payload', () => {
    const result = parseAIResponseLean('{"narrative":"A story"}');
    expect(result.narrative).toBe('A story');
    expect(result.suggestedActions).toEqual(['Look around', 'Move forward', 'Wait']);
    expect(result.stateChanges).toEqual({});
    expect(result.dialogueSegments).toEqual([]);
    expect(result.scenePacing).toBe('exploration');
    expect(result.atmosphere).toEqual({ weather: 'clear', mood: 'peaceful', lighting: 'natural' });
  });

  it('derives narrative from dialogueSegments narration text', () => {
    const raw = JSON.stringify({
      dialogueSegments: [
        { type: 'narration', text: 'The wind howls.' },
        { type: 'dialogue', character: 'Bob', text: 'Help!' },
        { type: 'narration', text: 'Silence falls.' },
      ],
    });
    const result = parseAIResponseLean(raw);
    expect(result.narrative).toBe('The wind howls. Silence falls.');
  });

  it('handles markdown-fenced responses', () => {
    const raw = '```json\n{"narrative":"Fenced","scenePacing":"dramatic"}\n```';
    const result = parseAIResponseLean(raw);
    expect(result.narrative).toBe('Fenced');
    expect(result.scenePacing).toBe('dramatic');
  });

  it('preserves provided suggestedActions', () => {
    const raw = '{"narrative":"x","suggestedActions":["a","b","c"]}';
    expect(parseAIResponseLean(raw).suggestedActions).toEqual(['a', 'b', 'c']);
  });
});
