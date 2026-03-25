import { describe, it, expect } from 'vitest';
import { repairDialogueSegments, ensurePlayerDialogue } from './aiResponseValidator.js';

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

  it('handles single curly quotes \u2018...\u2019', () => {
    const segments = [
      { type: 'narration', text: 'Ksenobi powiedzia\u0142: \u2018Czasem nawet niebo postanawia nagradza\u0107 cierpliwo\u015B\u0107.\u2019' },
    ];
    const knownNpcs = [{ name: 'Ksenobi', gender: 'male' }];
    const result = repairDialogueSegments('...', segments, knownNpcs);

    const dialogue = result.find(s => s.type === 'dialogue');
    expect(dialogue).toBeDefined();
    expect(dialogue.text).toBe('Czasem nawet niebo postanawia nagradza\u0107 cierpliwo\u015B\u0107.');
    expect(dialogue.character).toBe('Ksenobi');
    expect(dialogue.gender).toBe('male');
  });

  it('handles ASCII single quotes in dialogue', () => {
    const segments = [
      { type: 'narration', text: "The old man whispered: 'Run away, child!'" },
    ];
    const result = repairDialogueSegments('...', segments);

    const dialogue = result.find(s => s.type === 'dialogue');
    expect(dialogue).toBeDefined();
    expect(dialogue.text).toBe('Run away, child!');
  });

  it('generates segments from narrative with single curly quotes when segments are empty', () => {
    const narrative = '\u015Alimak Ksenobi u\u015Bmiechna\u0142 si\u0119. \u2018Czasem nawet niebo postanawia nagradza\u0107 cierpliwo\u015B\u0107.\u2019';
    const result = repairDialogueSegments(narrative, [], [{ name: '\u015Alimak Ksenobi', gender: 'male' }]);

    const dialogues = result.filter(s => s.type === 'dialogue');
    expect(dialogues).toHaveLength(1);
    expect(dialogues[0].text).toBe('Czasem nawet niebo postanawia nagradza\u0107 cierpliwo\u015B\u0107.');
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

describe('ensurePlayerDialogue', () => {
  it('prepends player dialogue when action has quotes and no segment exists', () => {
    const segments = [
      { type: 'narration', text: 'Barnaba zaproponował wspólne picie.' },
      { type: 'dialogue', character: 'Kazik', text: 'Oczywiście!', gender: 'male' },
    ];
    const result = ensurePlayerDialogue(
      segments,
      'Zagaduję Kazika: „Kaziu może byśmy się napili?"',
      'Barnaba',
      'male'
    );

    expect(result.length).toBe(3);
    expect(result[0].type).toBe('dialogue');
    expect(result[0].character).toBe('Barnaba');
    expect(result[0].text).toBe('Kaziu może byśmy się napili?');
    expect(result[0].gender).toBe('male');
    expect(result[1]).toEqual(segments[0]);
    expect(result[2]).toEqual(segments[1]);
  });

  it('does not add if player dialogue segment already exists', () => {
    const segments = [
      { type: 'dialogue', character: 'Barnaba', text: 'Cześć Kaziku!', gender: 'male' },
      { type: 'narration', text: 'Kazik uśmiechnął się.' },
    ];
    const result = ensurePlayerDialogue(
      segments,
      'Mówię: „Cześć Kaziku!"',
      'Barnaba',
      'male'
    );

    expect(result).toEqual(segments);
  });

  it('returns segments unchanged when action has no quotes', () => {
    const segments = [
      { type: 'narration', text: 'Barnaba rozglądał się.' },
    ];
    const result = ensurePlayerDialogue(segments, 'Rozglądam się po okolicy.', 'Barnaba', 'male');

    expect(result).toEqual(segments);
  });

  it('handles multiple quoted phrases in player action', () => {
    const segments = [
      { type: 'narration', text: 'Barnaba krzyknął do tłumu.' },
    ];
    const result = ensurePlayerDialogue(
      segments,
      'Krzyczę: „Hej!" a potem dodaję: „Chodźcie tu!"',
      'Barnaba',
      'male'
    );

    expect(result.length).toBe(3);
    expect(result[0].type).toBe('dialogue');
    expect(result[0].text).toBe('Hej!');
    expect(result[1].type).toBe('dialogue');
    expect(result[1].text).toBe('Chodźcie tu!');
    expect(result[2]).toEqual(segments[0]);
  });

  it('returns segments unchanged when playerAction or characterName is missing', () => {
    const segments = [{ type: 'narration', text: 'Coś się stało.' }];
    expect(ensurePlayerDialogue(segments, null, 'Barnaba', 'male')).toEqual(segments);
    expect(ensurePlayerDialogue(segments, '„Hej!"', null, 'male')).toEqual(segments);
    expect(ensurePlayerDialogue(segments, '', 'Barnaba', 'male')).toEqual(segments);
  });

  it('matches player character name case-insensitively', () => {
    const segments = [
      { type: 'dialogue', character: 'barnaba', text: 'Cześć!', gender: 'male' },
    ];
    const result = ensurePlayerDialogue(
      segments,
      'Mówię: „Hej!"',
      'Barnaba',
      'male'
    );

    expect(result).toEqual(segments);
  });
});
