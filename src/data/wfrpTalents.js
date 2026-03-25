// WFRP 4th Edition Talent Mechanical Effects
//
// Each entry maps a base talent name to its dice-roll effect.
// - characteristic: applies +bonus to ALL tests using that characteristic
// - skills: applies +bonus only when testing one of these skills
// - condition: AI hint for situational talents (engine ignores it; AI uses it for narrative)
// - damageBonus / slBonus: combat-only modifiers (not added to target)
// - null entries: talents with no direct dice-roll modifier

export const TALENT_EFFECTS = {
  // ── Characteristic-wide bonuses (+5 to every test with that stat) ──
  'Warrior Born':        { bonus: 5, characteristic: 'ws' },
  'Marksman':            { bonus: 5, characteristic: 'bs' },
  'Very Strong':         { bonus: 5, characteristic: 's' },
  'Very Resilient':      { bonus: 5, characteristic: 't' },
  'Sharp':               { bonus: 5, characteristic: 'i' },
  'Lightning Reflexes':  { bonus: 5, characteristic: 'ag' },
  'Nimble Fingers':      { bonus: 5, characteristic: 'dex' },
  'Savvy':               { bonus: 5, characteristic: 'int' },
  'Coolheaded':          { bonus: 5, characteristic: 'wp' },
  'Suave':               { bonus: 5, characteristic: 'fel' },

  // ── Skill-specific bonuses ──
  'Acute Sense':         { bonus: 10, skills: ['Perception'] },
  'Combat Reflexes':     { bonus: 10, skills: ['Initiative'] },
  'Nose for Trouble':    { bonus: 10, skills: ['Intuition'] },
  'Gregarious':          { bonus: 5,  skills: ['Gossip'] },
  'Dealmaker':           { bonus: 5,  skills: ['Haggle'] },
  'Menacing':            { bonus: 10, skills: ['Intimidate'] },
  'Commanding Presence': { bonus: 5,  skills: ['Leadership'] },
  'Attractive':          { bonus: 5,  skills: ['Charm'], condition: 'attracted NPC' },
  'Public Speaking':     { bonus: 5,  skills: ['Entertain (Storytelling)', 'Leadership'] },
  'Etiquette':           { bonus: 10, skills: ['Charm', 'Gossip', 'Haggle'], condition: 'appropriate social group' },
  'Shadow':              { bonus: 10, skills: ['Stealth (Urban)', 'Stealth (Rural)'] },
  'Rover':               { bonus: 10, skills: ['Stealth (Rural)', 'Outdoor Survival'] },
  'Orientation':         { bonus: 10, skills: ['Navigation'] },
  'Pilot':               { bonus: 10, skills: ['Sail'] },
  'River Guide':         { bonus: 10, skills: ['Sail', 'Navigation'], condition: 'on rivers' },
  'Sea Legs':            { bonus: 10, skills: ['Sail', 'Climb'], condition: 'on ships' },
  'Old Salt':            { bonus: 5,  skills: ['Sail', 'Navigation', 'Lore (Seas)'] },
  'Waterman':            { bonus: 10, skills: ['Sail', 'Row', 'Swim'] },
  'Trapper':             { bonus: 10, skills: ['Set Trap', 'Outdoor Survival'] },
  'Night Vision':        { bonus: 10, skills: ['Perception'], condition: 'darkness or low light' },
  'Perfect Pitch':       { bonus: 10, skills: ['Entertain (Sing)', 'Play (Any)'] },
  'Linguistics':         { bonus: 10, skills: ['Language (Any)'] },
  'Lip Reading':         { bonus: 10, skills: ['Perception'], condition: 'reading lips' },
  'Mimic':               { bonus: 10, skills: ['Entertain (Any)', 'Charm'], condition: 'impersonation' },
  'Contortionist':       { bonus: 10, skills: ['Athletics'], condition: 'escaping bonds or squeezing' },
  'Scale Sheer Surface': { bonus: 10, skills: ['Climb'] },
  'Tunnel Rat':          { bonus: 10, skills: ['Stealth (Underground)', 'Perception'], condition: 'underground' },
  'Numismatics':         { bonus: 10, skills: ['Evaluate'], condition: 'coins or currency' },
  'Pharmacist':          { bonus: 10, skills: ['Trade (Apothecary)', 'Lore (Medicine)'] },
  'Surgery':             { bonus: 10, skills: ['Heal'] },
  'Field Dressing':      { bonus: 5,  skills: ['Heal'] },
  'Bookish':             { bonus: 10, skills: ['Research'] },
  'Super Numerate':      { bonus: 10, skills: ['Gamble', 'Evaluate', 'Navigation'] },
  'Artistic':            { bonus: 10, skills: ['Art (Any)'] },
  'Craftsman':           { bonus: 10, skills: ['Trade (Any)'] },
  'Master Tradesman':    { bonus: 10, skills: ['Trade (Any)'] },

  // ── Combat situational ──
  'Combat Aware':        { bonus: 10, skills: ['Perception'], condition: 'during combat' },
  'Combat Master':       { bonus: 5,  characteristic: 'ws', condition: 'outnumbered in melee' },
  'Enclosed Fighter':    { bonus: 10, characteristic: 'ws', condition: 'enclosed spaces' },
  'Shieldsman':          { bonus: 5,  skills: ['Melee (Basic)', 'Melee (Shield)'], condition: 'using a shield' },
  'Dual Wielder':        { bonus: 5,  characteristic: 'ws', condition: 'wielding two weapons' },
  'Gunner':              { bonus: 10, skills: ['Ranged (Blackpowder)', 'Ranged (Engineering)'] },

  // ── Fearlessness & Willpower situational ──
  'Fearless':            { bonus: 10, skills: ['Cool'], condition: 'fear or terror test' },
  'Stout-hearted':       { bonus: 5,  skills: ['Cool'], condition: 'fear test' },
  'Unshakable':          { bonus: 5,  skills: ['Cool'] },
  'Iron Will':           { bonus: 5,  characteristic: 'wp', condition: 'mental resistance' },
  'Strong-minded':       { bonus: 5,  characteristic: 'wp', condition: 'resisting influence' },
  'Resolute':            { bonus: 5,  characteristic: 'wp' },
  'Pure Soul':           { bonus: 10, skills: ['Cool', 'Pray'], condition: 'resisting corruption or chaos' },
  'Impassioned Zeal':    { bonus: 5,  skills: ['Cool', 'Leadership'], condition: 'religious context' },

  // ── Stealth / subterfuge ──
  'Beneath Notice':      { bonus: 10, skills: ['Stealth (Urban)'], condition: 'low-status character' },
  'Criminal':            { bonus: 5,  skills: ['Stealth (Urban)', 'Pick Lock', 'Sleight of Hand'] },
  'Secret Identity':     { bonus: 10, skills: ['Charm', 'Gossip'], condition: 'maintaining a cover identity' },
  'Cat-tongued':         { bonus: 10, skills: ['Charm', 'Gossip'], condition: 'lying or deceiving' },
  'Schemer':             { bonus: 10, skills: ['Bribery', 'Gossip', 'Charm'], condition: 'political intrigue' },
  'Briber':              { bonus: 5,  skills: ['Bribery'] },
  'Cardsharp':           { bonus: 10, skills: ['Gamble', 'Sleight of Hand'] },
  'Diceman':             { bonus: 10, skills: ['Gamble'] },
  'Embezzle':            { bonus: 10, skills: ['Evaluate', 'Perception'], condition: 'financial fraud' },
  'Fast Hands':          { bonus: 10, skills: ['Sleight of Hand'] },

  // ── Speech & social ──
  'Argumentative':       { bonus: 5,  skills: ['Charm', 'Intimidate', 'Gossip'], condition: 'argument or debate' },
  'Blather':             { bonus: 10, skills: ['Charm'], condition: 'confusing or distracting with words' },
  'Inspiring':           { bonus: 5,  skills: ['Leadership'] },
  'Kingpin':             { bonus: 10, skills: ['Leadership', 'Intimidate'], condition: 'criminal underlings' },
  'Panhandle':           { bonus: 10, skills: ['Charm'], condition: 'begging' },
  'Noble Blood':         { bonus: 5,  skills: ['Leadership', 'Charm'], condition: 'nobility context' },
  'Stone Soup':          { bonus: 5,  skills: ['Charm', 'Haggle'], condition: 'requesting food or lodging' },

  // ── Melee combat modifiers (affect attack/damage, applied via characteristic match) ──
  'Beat Blade':          { bonus: 10, characteristic: 'ws', condition: 'attempting Beat Blade manoeuvre' },
  'Disarm':              { bonus: 10, characteristic: 'ws', condition: 'attempting to disarm' },
  'Distract':            { bonus: 10, skills: ['Charm', 'Intimidate'], condition: 'distracting an opponent' },
  'Feint':               { bonus: 10, characteristic: 'ws', condition: 'feinting in melee' },
  'Dirty Fighting':      { bonus: 5,  characteristic: 'ws', condition: 'underhanded melee tactics' },
  'Careful Strike':      { bonus: 5,  characteristic: 'ws', condition: 'aiming for precision' },

  // ── Ranged combat ──
  'Deadeye Shot':        { bonus: 10, characteristic: 'bs', condition: 'called shot / aimed attack' },
  'Sharpshooter':        { bonus: 5,  characteristic: 'bs' },
  'Sniper':              { bonus: 10, characteristic: 'bs', condition: 'from hiding or extreme range' },
  'Sure Shot':           { bonus: 5,  characteristic: 'bs' },
  'Fast Shot':           { bonus: 5,  characteristic: 'bs', condition: 'rapid fire' },
  'Rapid Reload':        { bonus: 5,  skills: ['Ranged (Any)'], condition: 'reload speed' },
  'Hunter\'s Eye':       { bonus: 10, characteristic: 'bs', condition: 'hunting or tracking prey' },

  // ── Physical / movement ──
  'Fleet Footed':        { bonus: 5,  skills: ['Athletics'], condition: 'running or chasing' },
  'Sprinter':            { bonus: 10, skills: ['Athletics'], condition: 'sprinting' },
  'Jump Up':             { bonus: 10, skills: ['Athletics'], condition: 'standing up or recovering from prone' },
  'Strong Back':         { bonus: 10, skills: ['Endurance'], condition: 'carrying heavy loads' },
  'Strong Legs':         { bonus: 10, skills: ['Athletics'], condition: 'jumping or kicking' },
  'Sturdy':              { bonus: 5,  skills: ['Endurance'] },
  'Robust':              { bonus: 5,  characteristic: 't', condition: 'enduring prolonged hardship' },
  'Hardy':               { bonus: 5,  skills: ['Endurance'] },
  'Tenacious':           { bonus: 10, skills: ['Endurance'], condition: 'resisting exhaustion' },
  'Resistance':          { bonus: 10, skills: ['Endurance', 'Cool'], condition: 'resisting specific hazard' },

  // ── Perception & awareness ──
  'Sixth Sense':         { bonus: 10, skills: ['Intuition'], condition: 'sensing danger or ambush' },
  'Second Sight':        { bonus: 10, skills: ['Perception', 'Intuition'], condition: 'detecting magic or spirits' },
  'Detect Artefact':     { bonus: 10, skills: ['Perception'], condition: 'detecting magical items' },
  'Magical Sense':       { bonus: 10, skills: ['Perception', 'Intuition'], condition: 'sensing winds of magic' },

  // ── Magic ──
  'Instinctive Diction': { bonus: 10, skills: ['Language (Magick)'] },
  'War Wizard':          { bonus: 5,  skills: ['Channelling', 'Language (Magick)'], condition: 'casting during combat' },
  'Petty Magic':         null,
  'Arcane Magic':        null,
  'Chaos Magic':         null,
  'Bless':               null,
  'Invoke':              null,
  'Holy Visions':        null,
  'Holy Hatred':         { bonus: 5,  characteristic: 'ws', condition: 'fighting enemies of faith' },
  'Magic Resistance':    { bonus: 10, skills: ['Cool', 'Endurance'], condition: 'resisting spells' },

  // ── Driving / riding ──
  'Crack the Whip':      { bonus: 10, skills: ['Drive', 'Animal Care'] },
  'Trick Riding':        { bonus: 10, skills: ['Ride'] },

  // ── Break & Enter ──
  'Break and Enter':     { bonus: 10, skills: ['Pick Lock', 'Stealth (Urban)'] },

  // ── Talents with no dice-roll modifier (narrative / passive / combat-damage only) ──
  'Ambidextrous':     null,
  'Animal Affinity':  null,
  'Berserk Charge':   null,
  'Carouser':         null,
  'Concoct':          null,
  'Doomed':           null,
  'Drilled':          null,
  'Flee!':            null,
  'Frenzy':           null,
  'Frightening':      null,
  'Furious Assault':  null,
  'Hatred':           null,
  'Iron Jaw':         null,
  'Luck':             null,
  'Reaction Strike':  null,
  'Read/Write':       null,
  'Reversal':         null,
  'Riposte':          null,
  'Savant':           null,
  'Slayer':           null,
  'Small':            null,
  'Step Aside':       null,
  'Strike Mighty Blow': null, // damage bonus, not a target modifier
  'Strike to Injure':   null,
  'Strike to Stun':     null,
  'Tower of Memories':  null,
  'War Leader':         null,
  'Wealthy':            null,
  'Well-prepared':      null,
  'Witch!':             null,
};

/**
 * Given a character's talent list, the resolved characteristic key, and the
 * resolved skill name, return the single best applicable talent bonus.
 *
 * Returns { talent: string, bonus: number } or null.
 */
export function getApplicableTalentBonus(talents, characteristicKey, skillName) {
  if (!Array.isArray(talents) || talents.length === 0) return null;
  if (!characteristicKey) return null;

  let best = null;

  for (const rawTalent of talents) {
    const baseName = String(rawTalent).replace(/\s*\(.*\)/, '').trim();
    const effect = TALENT_EFFECTS[baseName];
    if (!effect || !effect.bonus) continue;

    let applicable = false;

    if (effect.skills && skillName) {
      const normalizedSkill = skillName.replace(/\s*\(.*\)/, '').trim();
      applicable = effect.skills.some((s) => {
        if (s.endsWith('(Any)')) {
          return normalizedSkill === s.replace(/\s*\(Any\)/, '').trim()
            || skillName.startsWith(s.replace(/\s*\(Any\)/, '').trim());
        }
        const baseEffectSkill = s.replace(/\s*\(.*\)/, '').trim();
        return normalizedSkill === baseEffectSkill || skillName === s;
      });
    }

    if (!applicable && effect.characteristic && effect.characteristic === characteristicKey) {
      if (!effect.skills) {
        applicable = true;
      }
    }

    if (applicable && (!best || effect.bonus > best.bonus)) {
      best = { talent: rawTalent, bonus: effect.bonus };
    }
  }

  return best;
}

/**
 * Build a compact talent-with-effects string for prompt injection.
 * Only lists talents the character owns, with their bonus descriptions.
 */
export function formatTalentsForPrompt(talents) {
  if (!Array.isArray(talents) || talents.length === 0) return 'None';

  return talents.map((rawTalent) => {
    const baseName = String(rawTalent).replace(/\s*\(.*\)/, '').trim();
    const effect = TALENT_EFFECTS[baseName];
    if (!effect || !effect.bonus) return rawTalent;

    let desc;
    if (effect.characteristic) {
      desc = `+${effect.bonus} ${effect.characteristic.toUpperCase()} tests`;
    } else if (effect.skills) {
      desc = `+${effect.bonus} ${effect.skills.slice(0, 2).join('/')}`;
    } else {
      desc = `+${effect.bonus}`;
    }
    if (effect.condition) desc += ` (${effect.condition})`;
    return `${rawTalent} [${desc}]`;
  }).join(', ');
}
