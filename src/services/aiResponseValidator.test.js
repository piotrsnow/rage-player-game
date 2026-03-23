import { describe, it, expect } from 'vitest';
import { repairDialogueSegments } from './aiResponseValidator.js';

describe('repairDialogueSegments', () => {
  it('passes through segments with no quoted text in narration', () => {
    const segments = [
      { type: 'narration', text: 'The wind howled through the trees.' },
      { type: 'dialogue', character: 'Aldric', text: 'We should move on.', gender: 'male' },
    ];
    const result = repairDialogueSegments('...', segments);
    expect(result).toEqual(segments);
  });

  it('returns empty array when both narrative and segments are empty', () => {
    expect(repairDialogueSegments('', [])).toEqual([]);
    expect(repairDialogueSegments('', null)).toEqual([]);
    expect(repairDialogueSegments(null, undefined)).toEqual([]);
    expect(repairDialogueSegments('   ', [])).toEqual([]);
  });

  it('splits a narration segment containing a quoted dialogue', () => {
    const segments = [
      { type: 'narration', text: 'Mag zaczął mówić: „Czarny Wódz to postać, której imię okrywa mrokiem nawet najjaśniejszy dzień."' },
    ];
    const result = repairDialogueSegments('...', segments);

    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('narration');
    expect(result[0].text).toContain('Mag zaczął mówić:');
    expect(result[1].type).toBe('dialogue');
    expect(result[1].text).toBe('Czarny Wódz to postać, której imię okrywa mrokiem nawet najjaśniejszy dzień.');
  });

  it('splits narration with multiple quoted dialogues', () => {
    const segments = [
      { type: 'narration', text: 'Jan powiedział: „Chodźmy!" i Maria odpowiedziała: „Jeszcze chwilę."' },
    ];
    const result = repairDialogueSegments('...', segments);

    expect(result.length).toBeGreaterThanOrEqual(4);
    const dialogues = result.filter(s => s.type === 'dialogue');
    expect(dialogues).toHaveLength(2);
    expect(dialogues[0].text).toBe('Chodźmy!');
    expect(dialogues[1].text).toBe('Jeszcze chwilę.');
  });

  it('attributes speaker from text before the quote', () => {
    const segments = [
      { type: 'narration', text: 'Stary Mag odezwał się: „Uważajcie na siebie."' },
    ];
    const knownNpcs = [{ name: 'Stary Mag', gender: 'male' }];
    const result = repairDialogueSegments('...', segments, knownNpcs);

    const dialogue = result.find(s => s.type === 'dialogue');
    expect(dialogue.character).toBe('Stary Mag');
    expect(dialogue.gender).toBe('male');
  });

  it('attributes speaker using partial name match from known NPCs', () => {
    const segments = [
      { type: 'narration', text: 'Krasnolud Grungni warknął: „Precz!"' },
    ];
    const knownNpcs = [{ name: 'Krasnolud Grungni', gender: 'male' }];
    const result = repairDialogueSegments('...', segments, knownNpcs);

    const dialogue = result.find(s => s.type === 'dialogue');
    expect(dialogue.character).toBe('Krasnolud Grungni');
  });

  it('looks up gender from existing dialogue segments when NPC list lacks it', () => {
    const segments = [
      { type: 'dialogue', character: 'Elara', gender: 'female', text: 'Witaj.' },
      { type: 'narration', text: 'Potem Elara dodała: „Idźmy dalej."' },
    ];
    const result = repairDialogueSegments('...', segments, []);

    const repairedDialogues = result.filter(s => s.type === 'dialogue' && s.text === 'Idźmy dalej.');
    expect(repairedDialogues).toHaveLength(1);
    expect(repairedDialogues[0].character).toBe('Elara');
    expect(repairedDialogues[0].gender).toBe('female');
  });

  it('falls back to NPC when no speaker can be identified', () => {
    const segments = [
      { type: 'narration', text: 'ktoś szepnął: „Uciekaj."' },
    ];
    const result = repairDialogueSegments('...', segments, []);

    const dialogue = result.find(s => s.type === 'dialogue');
    expect(dialogue.character).toBe('NPC');
    expect(dialogue.gender).toBeUndefined();
  });

  it('handles different quote styles: " " and « »', () => {
    const doubleQuote = [
      { type: 'narration', text: 'He said: "Run away!"' },
    ];
    const result1 = repairDialogueSegments('...', doubleQuote);
    expect(result1.find(s => s.type === 'dialogue')?.text).toBe('Run away!');

    const guillemets = [
      { type: 'narration', text: 'Il a dit: «Fuyez!»' },
    ];
    const result2 = repairDialogueSegments('...', guillemets);
    expect(result2.find(s => s.type === 'dialogue')?.text).toBe('Fuyez!');
  });

  it('does not split dialogue-type segments', () => {
    const segments = [
      { type: 'dialogue', character: 'Aldric', text: 'He said "hello" to me.', gender: 'male' },
    ];
    const result = repairDialogueSegments('...', segments);
    expect(result).toEqual(segments);
  });

  it('handles narration with trailing text after a quote', () => {
    const segments = [
      { type: 'narration', text: 'Mag rzekł: „Idź naprzód." Po czym zniknął w cieniu.' },
    ];
    const result = repairDialogueSegments('...', segments);

    expect(result).toHaveLength(3);
    expect(result[0].type).toBe('narration');
    expect(result[1].type).toBe('dialogue');
    expect(result[1].text).toBe('Idź naprzód.');
    expect(result[2].type).toBe('narration');
    expect(result[2].text).toContain('Po czym zniknął');
  });

  it('does not create empty segments from whitespace', () => {
    const segments = [
      { type: 'narration', text: '„Witaj."' },
    ];
    const result = repairDialogueSegments('...', segments);

    expect(result.every(s => s.text.trim().length > 0)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('dialogue');
  });

  it('leaves unbalanced quotes as narration', () => {
    const segments = [
      { type: 'narration', text: 'Mag powiedział: „Uważajcie na siebie, bo...' },
    ];
    const result = repairDialogueSegments('...', segments);
    expect(result).toEqual(segments);
  });

  it('generates segments from narrative when segments are empty and narrative has quotes', () => {
    const narrative = 'Kazik uśmiechnął się. „Ach, Mścichuj! Życie, jak to życie." Słońce wschodziło za plecami Kazika.';
    const result = repairDialogueSegments(narrative, [], [{ name: 'Kazik', gender: 'male' }]);

    expect(result.length).toBeGreaterThanOrEqual(3);
    const dialogues = result.filter(s => s.type === 'dialogue');
    expect(dialogues).toHaveLength(1);
    expect(dialogues[0].text).toBe('Ach, Mścichuj! Życie, jak to życie.');
    expect(dialogues[0].character).toBe('Kazik');
    expect(dialogues[0].gender).toBe('male');
    const narrations = result.filter(s => s.type === 'narration');
    expect(narrations.length).toBeGreaterThanOrEqual(2);
  });

  it('generates single narration segment from narrative without quotes when segments are empty', () => {
    const narrative = 'Wiatr wiał przez drzewa. Barnaba szedł drogą w stronę karczmy.';
    const result = repairDialogueSegments(narrative, []);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('narration');
    expect(result[0].text).toBe(narrative);
  });

  it('regenerates from narrative when segments cover too little text', () => {
    const narrative = 'Mag Zefiryn odwrócił się i rzekł: „Idźmy w stronę gór." Droga była kręta i pełna niebezpieczeństw. Noc zapadła szybko.';
    const shortSegments = [
      { type: 'narration', text: 'Mag się odwrócił.' },
    ];
    const result = repairDialogueSegments(narrative, shortSegments, [{ name: 'Zefiryn', gender: 'male' }]);

    const dialogues = result.filter(s => s.type === 'dialogue');
    expect(dialogues).toHaveLength(1);
    expect(dialogues[0].text).toBe('Idźmy w stronę gór.');
  });
});
