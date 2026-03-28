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

  it('keeps quotes preceded by preposition "o" as narration (references, not dialogue)', () => {
    const segments = [
      { type: 'narration', text: 'Przy Starszym Szeptaczu zaś cienki, wilgotny plik zapisków, zapisany drobnym, nerwowym pismem o „otwarciu turnieju", „krwi upartego" i kimś określonym tylko jako „Mistrz Pindola".' },
    ];
    const result = repairDialogueSegments('...', segments, [{ name: 'Szeptacz' }]);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('narration');
    expect(result[0].text).toContain('otwarciu turnieju');
    expect(result[0].text).toContain('krwi upartego');
    expect(result[0].text).toContain('Mistrz Pindola');
  });

  it('keeps quotes preceded by "jako" as narration', () => {
    const segments = [
      { type: 'narration', text: 'Był znany jako „Rzeźnik z Altdorfu" w całym mieście.' },
    ];
    const result = repairDialogueSegments('...', segments);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('narration');
    expect(result[0].text).toContain('Rzeźnik z Altdorfu');
  });

  it('keeps quotes preceded by "na" as narration', () => {
    const segments = [
      { type: 'narration', text: 'Na pergaminie widniał napis na „Kronikę Imperium" i datę sprzed wieków.' },
    ];
    const result = repairDialogueSegments('...', segments);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('narration');
  });

  it('keeps list of reference quotes connected by commas and conjunctions as narration', () => {
    const segments = [
      { type: 'narration', text: 'Czytając o „Mrozie", „Głodzie" i „Ciemności", Barnaba poczuł dreszcz.' },
    ];
    const result = repairDialogueSegments('...', segments);

    const dialogues = result.filter(s => s.type === 'dialogue');
    expect(dialogues).toHaveLength(0);
  });

  it('still splits actual dialogue even when references exist in other segments', () => {
    const segments = [
      { type: 'narration', text: 'Czytając o „Mroku" Barnaba usłyszał głos. Szeptacz mruknął: „To nie wróży dobrze."' },
    ];
    const result = repairDialogueSegments('...', segments, [{ name: 'Szeptacz', gender: 'male' }]);

    const dialogues = result.filter(s => s.type === 'dialogue');
    expect(dialogues).toHaveLength(1);
    expect(dialogues[0].text).toBe('To nie wróży dobrze.');
    expect(dialogues[0].character).toBe('Szeptacz');
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

  it('does not duplicate a quote already present as an explicit dialogue segment', () => {
    const segments = [
      { type: 'narration', text: 'Xenobiasz kręci głową. „No Barnaba, chyba nie jesteś stworzony do żabiarskich pościgów, ha!"' },
      { type: 'dialogue', character: 'Xenobiasz', text: 'No Barnaba, chyba nie jesteś stworzony do żabiarskich pościgów, ha!', gender: 'male' },
    ];
    const result = repairDialogueSegments('...', segments, [{ name: 'Xenobiasz', gender: 'male' }]);

    const xenobiaszDialogues = result.filter(s => s.type === 'dialogue' && s.character === 'Xenobiasz');
    expect(xenobiaszDialogues).toHaveLength(1);
    expect(xenobiaszDialogues[0].text).toBe('No Barnaba, chyba nie jesteś stworzony do żabiarskich pościgów, ha!');
  });

  it('skips narration-embedded quote when a case-different version exists as dialogue', () => {
    const segments = [
      { type: 'narration', text: 'Kapłan rzekł: „Idźcie z bogami."' },
      { type: 'dialogue', character: 'Kapłan', text: 'Idźcie z bogami.', gender: 'male' },
    ];
    const result = repairDialogueSegments('...', segments, [{ name: 'Kapłan', gender: 'male' }]);

    const dialogues = result.filter(s => s.type === 'dialogue');
    expect(dialogues).toHaveLength(1);
  });

  it('still extracts quotes not present in explicit dialogue segments', () => {
    const segments = [
      { type: 'narration', text: 'Xenobiasz mruknął: „To nie wróży dobrze." Potem Elara dodała: „Musimy działać."' },
      { type: 'dialogue', character: 'Xenobiasz', text: 'To nie wróży dobrze.', gender: 'male' },
    ];
    const result = repairDialogueSegments('...', segments, [
      { name: 'Xenobiasz', gender: 'male' },
      { name: 'Elara', gender: 'female' },
    ]);

    const dialogues = result.filter(s => s.type === 'dialogue');
    expect(dialogues).toHaveLength(2);
    expect(dialogues.find(d => d.character === 'Xenobiasz')).toBeTruthy();
    expect(dialogues.find(d => d.character === 'Elara')?.text).toBe('Musimy działać.');
  });

  // --- Deduplication tests ---

  it('removes narration segment that duplicates a dialogue segment text', () => {
    const segments = [
      { type: 'narration', text: 'Straszne gówno tu grają co nie?' },
      { type: 'dialogue', character: 'Barnaba', text: 'Straszne gówno tu grają co nie?', gender: 'male' },
      { type: 'narration', text: 'Barnaba podchodzi do Hildy przez tłum pachnący piwem.' },
    ];
    const result = repairDialogueSegments('...', segments, [{ name: 'Barnaba', gender: 'male' }]);

    const narrations = result.filter(s => s.type === 'narration');
    const dialogues = result.filter(s => s.type === 'dialogue');
    expect(dialogues).toHaveLength(1);
    expect(dialogues[0].character).toBe('Barnaba');
    expect(narrations.every(s => s.text !== 'Straszne gówno tu grają co nie?')).toBe(true);
  });

  it('removes narration segment that duplicates dialogue text with different quote marks', () => {
    const segments = [
      { type: 'narration', text: '„Uciekajcie!"' },
      { type: 'dialogue', character: 'Kapłan', text: 'Uciekajcie!', gender: 'male' },
    ];
    const result = repairDialogueSegments('...', segments, [{ name: 'Kapłan', gender: 'male' }]);

    const narrations = result.filter(s => s.type === 'narration');
    expect(narrations).toHaveLength(0);
    const dialogues = result.filter(s => s.type === 'dialogue');
    expect(dialogues).toHaveLength(1);
    expect(dialogues[0].character).toBe('Kapłan');
  });

  it('does not remove narration that only partially overlaps with dialogue text', () => {
    const segments = [
      { type: 'narration', text: 'Kapłan mruknął groźnie — uciekajcie, bo inaczej będzie źle.' },
      { type: 'dialogue', character: 'Kapłan', text: 'Uciekajcie!', gender: 'male' },
    ];
    const result = repairDialogueSegments('...', segments, [{ name: 'Kapłan', gender: 'male' }]);

    const narrations = result.filter(s => s.type === 'narration');
    expect(narrations.length).toBeGreaterThanOrEqual(1);
  });

  // --- Unquoted dialogue detection tests ---

  it('detects unquoted dialogue with second-person markers and attributes to NPC from context', () => {
    const segments = [
      { type: 'dialogue', character: 'Barnaba', text: 'Witaj, Hilda.', gender: 'male' },
      { type: 'narration', text: 'Hilda odrywa wzrok od muzykantów i mierzy go spojrzeniem.' },
      { type: 'narration', text: 'Jak chcesz mieć ze mną rozmowę, to pomóż mi najpierw: widzisz tam łysego skrybę przy straganie z węgorzami?' },
    ];
    const result = repairDialogueSegments('...', segments, [
      { name: 'Hilda', gender: 'female' },
      { name: 'Barnaba', gender: 'male' },
    ], ['Barnaba']);

    const hildaDialogue = result.filter(s => s.type === 'dialogue' && s.character === 'Hilda');
    expect(hildaDialogue.length).toBeGreaterThanOrEqual(1);
    expect(hildaDialogue.some(s => s.text.includes('chcesz'))).toBe(true);
  });

  it('does not convert narration starting with a character name to dialogue', () => {
    const segments = [
      { type: 'dialogue', character: 'Aldric', text: 'Follow me.', gender: 'male' },
      { type: 'narration', text: 'Aldric pushed through the crowd, his hand resting on the pommel of his sword.' },
    ];
    const result = repairDialogueSegments('...', segments, [{ name: 'Aldric', gender: 'male' }]);

    expect(result.find(s => s.text.includes('pushed through'))?.type).toBe('narration');
  });

  it('does not convert narration without speech markers to dialogue', () => {
    const segments = [
      { type: 'dialogue', character: 'Mag', text: 'Chodźmy.', gender: 'male' },
      { type: 'narration', text: 'Noc była ciemna i pełna gwiazd. Wiatr szumiał między drzewami.' },
    ];
    const result = repairDialogueSegments('...', segments, [{ name: 'Mag', gender: 'male' }]);

    expect(result.find(s => s.text.includes('Noc była'))?.type).toBe('narration');
  });

  it('attributes narration with first-person markers before dialogue to that speaker (continuation pass)', () => {
    const segments = [
      { type: 'narration', text: 'Hilda odwraca się i mierzy go wzrokiem.' },
      { type: 'narration', text: 'Na bogów, wreszcie ktoś z uszami. Daj mi chwilę, muszę coś sprawdzić.' },
      { type: 'narration', text: 'Jak chcesz mieć ze mną rozmowę, to pomóż mi najpierw.' },
    ];
    const result = repairDialogueSegments('...', segments, [
      { name: 'Hilda', gender: 'female' },
    ], ['Barnaba']);

    const hildaDialogue = result.filter(s => s.type === 'dialogue' && s.character === 'Hilda');
    expect(hildaDialogue.length).toBeGreaterThanOrEqual(1);
  });

  it('handles English unquoted dialogue with second-person pronouns', () => {
    const segments = [
      { type: 'narration', text: 'The tavern keeper wipes the bar and looks at you.' },
      { type: 'narration', text: 'You look like you could use a drink. What can I get for you, stranger?' },
    ];
    const result = repairDialogueSegments('...', segments, [
      { name: 'Tavern Keeper', gender: 'male' },
    ]);

    const dialogues = result.filter(s => s.type === 'dialogue');
    expect(dialogues.length).toBeGreaterThanOrEqual(1);
    expect(dialogues[0].text).toContain('you could use a drink');
  });

  it('does not attribute dialogue to excluded faction/location names like Imperium', () => {
    const segments = [
      { type: 'narration', text: 'Tragarze bronili granic Imperium. Jeden z nich mruknął: „Rada chce to dziś zakopać."' },
    ];
    const result = repairDialogueSegments('...', segments, [], ['Imperium', 'Altdorf']);

    const dialogues = result.filter(s => s.type === 'dialogue');
    expect(dialogues).toHaveLength(1);
    expect(dialogues[0].character).not.toBe('Imperium');
  });

  it('filters out excluded names from AI-returned dialogue segments when building known names', () => {
    const segments = [
      { type: 'dialogue', character: 'Imperium', text: 'Rada chce to dziś zakopać.' },
      { type: 'narration', text: 'Tragarz splunął i mruknął: „Przenieśmy to niżej."' },
    ];
    const result = repairDialogueSegments('...', segments, [], ['Imperium']);

    const imperiumDialogues = result.filter(s => s.type === 'dialogue' && s.character === 'Imperium');
    expect(imperiumDialogues).toHaveLength(1);
    const secondDialogue = result.filter(s => s.type === 'dialogue' && s.text === 'Przenieśmy to niżej.');
    expect(secondDialogue).toHaveLength(1);
    expect(secondDialogue[0].character).not.toBe('Imperium');
  });
});

describe('ensurePlayerDialogue', () => {
  it('inserts player dialogue before first narration when action has quotes and no segment exists', () => {
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

  it('re-attributes NPC segment to player character instead of adding duplicate', () => {
    const segments = [
      { type: 'narration', text: 'Z westchnieniem opadasz na pniak.' },
      { type: 'dialogue', character: 'NPC', text: 'No kurwa trudno!' },
      { type: 'narration', text: 'Xenobiasz kręci głową.' },
    ];
    const result = ensurePlayerDialogue(
      segments,
      'Siadam na pniaku. „No kurwa trudno!"',
      'Mścichuj Barnaba',
      'male'
    );

    const dialogues = result.filter(s => s.type === 'dialogue');
    expect(dialogues).toHaveLength(1);
    expect(dialogues[0].character).toBe('Mścichuj Barnaba');
    expect(dialogues[0].text).toBe('No kurwa trudno!');
    expect(dialogues[0].gender).toBe('male');
    expect(result).toHaveLength(3);
  });

  it('re-attributes only matching NPC quotes and adds remaining player quotes', () => {
    const segments = [
      { type: 'narration', text: 'Barnaba podszedł do drzwi.' },
      { type: 'dialogue', character: 'NPC', text: 'Otwórzcie!' },
    ];
    const result = ensurePlayerDialogue(
      segments,
      'Krzyczę: „Otwórzcie!" a potem: „Natychmiast!"',
      'Barnaba',
      'male'
    );

    const dialogues = result.filter(s => s.type === 'dialogue');
    expect(dialogues).toHaveLength(2);
    expect(dialogues.find(d => d.text === 'Otwórzcie!')?.character).toBe('Barnaba');
    expect(dialogues.find(d => d.text === 'Natychmiast!')?.character).toBe('Barnaba');
  });
});
