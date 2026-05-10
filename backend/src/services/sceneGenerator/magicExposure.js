// Magic-exposure detection — scans recent scenes for sustained magical
// interaction beyond the character's current abilities, plus at least one
// successful roll. When the threshold is met, the prompt tells the AI it
// MAY grant a starting spell or mana bump.
//
// Starting spells mirrored from src/data/rpgMagic.js (level 1, no
// unlockCondition). Only names needed here.

const STARTING_SPELLS = [
  'Iskra',              // ogien
  'Piorun',             // blyskawice
  'Ochrona',            // ochrona
  'Niewidzialnosc',     // niewidzialnosc
  'Lodowy Dotyk',       // lod
  'Leczenie Ran',       // leczenie
  'Telekineza',         // przestrzen
  'Strach',             // umysl
  'Wykrycie Magii',     // wiatr_percepcja
];

const MAGIC_RE = /magi[aąckei]|zaklęci|zakl[eę][ćc]|czar[oóyów]|man[ayęo]|rytuał|runy|runiczn|mistycz|nadprzyrodzon|czarodziej|wiedźm|inkantacj|arkan|nekroman|alchemi|aur[ayę]|przebudzen|eter[u ]|pradawn|zaklinani|moc[yąi] |drzemiąc.*si[łl]|magiczn|elfick|kryształ/i;

const MIN_MAGIC_SCENES = 2;

/**
 * @param {Array} recentScenes — last 5 persisted scene records
 * @param {Object} character — current character state
 * @returns {{ eligible: boolean, availableSpells: string[] }}
 */
export function detectMagicExposure(recentScenes, character) {
  if (!Array.isArray(recentScenes) || recentScenes.length < MIN_MAGIC_SCENES) {
    return { eligible: false, availableSpells: [] };
  }

  const knownSpells = character?.spells?.known || [];
  const maxMana = character?.mana?.max || 0;

  // Already a capable mage — no breakthrough needed
  if (knownSpells.length >= 3 && maxMana >= 5) {
    return { eligible: false, availableSpells: [] };
  }

  let magicSceneCount = 0;
  let hasGoodRoll = false;

  for (const scene of recentScenes) {
    const text = (scene.narrative || '') + ' ' + (scene.chosenAction || '');
    if (!MAGIC_RE.test(text)) continue;

    magicSceneCount++;

    const rolls = Array.isArray(scene.diceRoll)
      ? scene.diceRoll
      : scene.diceRoll ? [scene.diceRoll] : [];
    if (rolls.some((r) => r?.success === true)) {
      hasGoodRoll = true;
    }
  }

  if (magicSceneCount < MIN_MAGIC_SCENES || !hasGoodRoll) {
    return { eligible: false, availableSpells: [] };
  }

  const availableSpells = STARTING_SPELLS.filter((s) => !knownSpells.includes(s));
  return { eligible: true, availableSpells };
}
