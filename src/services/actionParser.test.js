import { describe, expect, it } from 'vitest';
import { parseActionSegments, hasDialogue, extractDialogueParts, extractActionParts } from './actionParser';

describe('actionParser', () => {
  it('parses dialogue in straight quotes', () => {
    const result = parseActionSegments('Podchodzę i mówię: "Witaj".');
    expect(result).toEqual([
      { type: 'action', text: 'Podchodzę i mówię: ' },
      { type: 'dialogue', text: '"Witaj"' },
      { type: 'action', text: '.' },
    ]);
  });

  it('parses dialogue in Polish quotes', () => {
    const result = parseActionSegments('Podchodzę i mówię: „Witaj”.');
    expect(result).toEqual([
      { type: 'action', text: 'Podchodzę i mówię: ' },
      { type: 'dialogue', text: '„Witaj”' },
      { type: 'action', text: '.' },
    ]);
  });

  it('keeps unbalanced quote as action text', () => {
    const result = parseActionSegments('Mówię: „To brzmi źle...');
    expect(result).toEqual([
      { type: 'action', text: 'Mówię: „To brzmi źle...' },
    ]);
  });

  it('extract helpers support smart quotes', () => {
    const text = 'Mruczę „No to idziemy” i poprawiam płaszcz.';
    expect(hasDialogue(text)).toBe(true);
    expect(extractDialogueParts(text)).toBe('„No to idziemy”');
    expect(extractActionParts(text)).toBe('Mruczę i poprawiam płaszcz.');
  });
});
