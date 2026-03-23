export const CRITICAL_WOUNDS = {
  head: [
    { range: [1, 10], name: 'Scratched Eye', severity: 'minor', effect: '-1 SL to sight-based tests', duration: 'd10 rounds', mechanical: { testPenalty: { type: 'perception', value: -10 } } },
    { range: [11, 20], name: 'Ringing Blow', severity: 'minor', effect: 'Stunned for 1 round', duration: '1 round', mechanical: { stunned: 1 } },
    { range: [21, 30], name: 'Fractured Jaw', severity: 'moderate', effect: 'Cannot speak clearly, -20 to Fellowship tests', duration: 'd10 days', mechanical: { testPenalty: { type: 'fel', value: -20 } } },
    { range: [31, 40], name: 'Cracked Skull', severity: 'moderate', effect: '-10 to all tests, blinding headaches', duration: '2d10 days', mechanical: { testPenalty: { type: 'all', value: -10 } } },
    { range: [41, 50], name: 'Smashed Ear', severity: 'moderate', effect: 'Deafened in one ear, -20 Perception (hearing)', duration: 'permanent', mechanical: { testPenalty: { type: 'perception', value: -20 }, permanent: true } },
    { range: [51, 60], name: 'Gouged Eye', severity: 'severe', effect: 'Lose one eye, -10 BS, -10 ranged tests', duration: 'permanent', mechanical: { testPenalty: { type: 'bs', value: -10 }, permanent: true } },
    { range: [61, 70], name: 'Shattered Nose', severity: 'moderate', effect: 'Bleeding, -10 Fellowship', duration: 'd10 days', mechanical: { bleeding: true, testPenalty: { type: 'fel', value: -10 } } },
    { range: [71, 80], name: 'Brain Rattled', severity: 'severe', effect: 'Unconscious for d10 minutes, -20 Int/WP for d10 days', duration: 'd10 days', mechanical: { unconscious: true, testPenalty: { type: 'int_wp', value: -20 } } },
    { range: [81, 90], name: 'Crushed Skull', severity: 'critical', effect: 'Unconscious, Surgery test needed or death', duration: 'permanent', mechanical: { unconscious: true, surgeryNeeded: true, permanent: true } },
    { range: [91, 100], name: 'Decapitated', severity: 'deadly', effect: 'Instant death', duration: 'permanent', mechanical: { death: true } },
  ],
  body: [
    { range: [1, 10], name: 'Winded', severity: 'minor', effect: '-1 SL to physical tests for 1 round', duration: '1 round', mechanical: { testPenalty: { type: 'physical', value: -10 } } },
    { range: [11, 20], name: 'Bruised Ribs', severity: 'minor', effect: '-10 to Agility tests', duration: 'd10 days', mechanical: { testPenalty: { type: 'ag', value: -10 } } },
    { range: [21, 30], name: 'Torn Muscle', severity: 'moderate', effect: '-10 to Strength and Agility tests', duration: 'd10 days', mechanical: { testPenalty: { type: 's_ag', value: -10 } } },
    { range: [31, 40], name: 'Cracked Ribs', severity: 'moderate', effect: '-20 to physical tests, difficulty breathing', duration: '2d10 days', mechanical: { testPenalty: { type: 'physical', value: -20 } } },
    { range: [41, 50], name: 'Bleeding Wound', severity: 'moderate', effect: 'Bleeding — lose 1 Wound per round until treated', duration: 'until treated', mechanical: { bleeding: true, woundsPerRound: -1 } },
    { range: [51, 60], name: 'Broken Ribs', severity: 'severe', effect: '-30 to physical tests, internal bleeding risk', duration: '4d10 days', mechanical: { testPenalty: { type: 'physical', value: -30 } } },
    { range: [61, 70], name: 'Internal Bleeding', severity: 'severe', effect: 'Lose 1 Wound per hour until Surgery test succeeds', duration: 'until surgery', mechanical: { bleeding: true, woundsPerHour: -1, surgeryNeeded: true } },
    { range: [71, 80], name: 'Punctured Lung', severity: 'severe', effect: 'Suffocation risk, -40 all tests', duration: 'until surgery', mechanical: { testPenalty: { type: 'all', value: -40 }, surgeryNeeded: true } },
    { range: [81, 90], name: 'Smashed Spine', severity: 'critical', effect: 'Paralyzed from waist down, Surgery or permanent', duration: 'permanent', mechanical: { paralyzed: true, surgeryNeeded: true, permanent: true } },
    { range: [91, 100], name: 'Disembowelled', severity: 'deadly', effect: 'Instant death unless Fate point spent', duration: 'permanent', mechanical: { death: true } },
  ],
  arms: [
    { range: [1, 10], name: 'Numbed Hand', severity: 'minor', effect: '-10 Dex tests for d10 rounds', duration: 'd10 rounds', mechanical: { testPenalty: { type: 'dex', value: -10 } } },
    { range: [11, 20], name: 'Sprained Wrist', severity: 'minor', effect: '-10 to Melee and Dex tests', duration: 'd10 days', mechanical: { testPenalty: { type: 'ws_dex', value: -10 } } },
    { range: [21, 30], name: 'Slashed Forearm', severity: 'moderate', effect: 'Bleeding, -10 WS', duration: 'd10 days', mechanical: { bleeding: true, testPenalty: { type: 'ws', value: -10 } } },
    { range: [31, 40], name: 'Torn Tendons', severity: 'moderate', effect: 'Drop weapon, -20 Dex with that arm', duration: '2d10 days', mechanical: { dropWeapon: true, testPenalty: { type: 'dex', value: -20 } } },
    { range: [41, 50], name: 'Fractured Forearm', severity: 'moderate', effect: 'Cannot use arm, -20 all tests', duration: '3d10 days', mechanical: { armUseless: true, testPenalty: { type: 'all', value: -20 } } },
    { range: [51, 60], name: 'Broken Elbow', severity: 'severe', effect: 'Arm useless, intense pain, -30 WP', duration: '4d10 days', mechanical: { armUseless: true, testPenalty: { type: 'wp', value: -30 } } },
    { range: [61, 70], name: 'Shattered Hand', severity: 'severe', effect: 'Hand permanently crippled if not treated', duration: 'permanent unless surgery', mechanical: { armUseless: true, surgeryNeeded: true } },
    { range: [71, 80], name: 'Compound Fracture', severity: 'severe', effect: 'Arm useless, bleeding, -40 all tests', duration: 'until surgery', mechanical: { armUseless: true, bleeding: true, testPenalty: { type: 'all', value: -40 }, surgeryNeeded: true } },
    { range: [81, 90], name: 'Mangled Arm', severity: 'critical', effect: 'Arm destroyed, requires amputation', duration: 'permanent', mechanical: { amputation: true, permanent: true } },
    { range: [91, 100], name: 'Severed Arm', severity: 'deadly', effect: 'Arm severed, massive bleeding — death without immediate aid', duration: 'permanent', mechanical: { amputation: true, death: true } },
  ],
  legs: [
    { range: [1, 10], name: 'Twisted Ankle', severity: 'minor', effect: '-1 Movement, -10 Ag tests', duration: 'd10 rounds', mechanical: { movementPenalty: -1, testPenalty: { type: 'ag', value: -10 } } },
    { range: [11, 20], name: 'Bruised Shin', severity: 'minor', effect: '-10 to Dodge and Athletics', duration: 'd10 days', mechanical: { testPenalty: { type: 'ag', value: -10 } } },
    { range: [21, 30], name: 'Slashed Calf', severity: 'moderate', effect: 'Bleeding, -1 Movement', duration: 'd10 days', mechanical: { bleeding: true, movementPenalty: -1 } },
    { range: [31, 40], name: 'Torn Ligament', severity: 'moderate', effect: '-2 Movement, -20 Ag tests', duration: '2d10 days', mechanical: { movementPenalty: -2, testPenalty: { type: 'ag', value: -20 } } },
    { range: [41, 50], name: 'Fractured Knee', severity: 'moderate', effect: 'Cannot run, -2 Movement, -20 all physical', duration: '3d10 days', mechanical: { movementPenalty: -2, testPenalty: { type: 'physical', value: -20 } } },
    { range: [51, 60], name: 'Broken Leg', severity: 'severe', effect: 'Cannot walk without support, -3 Movement', duration: '4d10 days', mechanical: { movementPenalty: -3, legUseless: true } },
    { range: [61, 70], name: 'Hamstrung', severity: 'severe', effect: 'Permanently reduced Movement by 1 unless surgery', duration: 'permanent unless surgery', mechanical: { movementPenalty: -2, surgeryNeeded: true } },
    { range: [71, 80], name: 'Shattered Kneecap', severity: 'severe', effect: 'Leg useless, Movement halved, requires surgery', duration: 'until surgery', mechanical: { legUseless: true, movementPenalty: -3, surgeryNeeded: true } },
    { range: [81, 90], name: 'Mangled Leg', severity: 'critical', effect: 'Leg destroyed, requires amputation', duration: 'permanent', mechanical: { amputation: true, permanent: true } },
    { range: [91, 100], name: 'Severed Leg', severity: 'deadly', effect: 'Leg severed, massive bleeding — death without immediate aid', duration: 'permanent', mechanical: { amputation: true, death: true } },
  ],
};

export function rollCriticalWound(location, severity = null) {
  const table = CRITICAL_WOUNDS[location] || CRITICAL_WOUNDS.body;
  let roll;

  if (severity === 'minor') {
    roll = Math.floor(Math.random() * 30) + 1;
  } else if (severity === 'moderate') {
    roll = Math.floor(Math.random() * 40) + 21;
  } else if (severity === 'severe') {
    roll = Math.floor(Math.random() * 30) + 51;
  } else if (severity === 'critical') {
    roll = Math.floor(Math.random() * 20) + 81;
  } else {
    roll = Math.floor(Math.random() * 100) + 1;
  }

  for (const entry of table) {
    if (roll >= entry.range[0] && roll <= entry.range[1]) {
      return {
        ...entry,
        roll,
        location,
        appliedAt: Date.now(),
      };
    }
  }
  return { ...table[0], roll, location, appliedAt: Date.now() };
}

export function getCriticalEffectSummary(criticalWound) {
  return `${criticalWound.name} (${criticalWound.location}): ${criticalWound.effect} [${criticalWound.severity}]`;
}

export function getActiveCriticalPenalties(criticalWounds) {
  const penalties = {
    testPenalties: {},
    movementPenalty: 0,
    bleeding: false,
    unconscious: false,
    conditions: [],
  };

  for (const cw of (criticalWounds || [])) {
    const m = cw.mechanical;
    if (!m) continue;

    if (m.testPenalty) {
      const key = m.testPenalty.type;
      penalties.testPenalties[key] = (penalties.testPenalties[key] || 0) + m.testPenalty.value;
    }
    if (m.movementPenalty) {
      penalties.movementPenalty += m.movementPenalty;
    }
    if (m.bleeding) penalties.bleeding = true;
    if (m.unconscious) penalties.unconscious = true;
    if (m.armUseless) penalties.conditions.push(`${cw.location} arm useless`);
    if (m.legUseless) penalties.conditions.push(`${cw.location} leg useless`);
    if (m.amputation) penalties.conditions.push(`${cw.location} amputated`);
    if (m.surgeryNeeded) penalties.conditions.push(`${cw.name} needs surgery`);
  }

  return penalties;
}

export function formatCriticalWoundsForPrompt(criticalWounds) {
  if (!criticalWounds || criticalWounds.length === 0) return '';

  const lines = criticalWounds.map((cw) => getCriticalEffectSummary(cw));
  const penalties = getActiveCriticalPenalties(criticalWounds);

  let result = `ACTIVE CRITICAL WOUNDS:\n${lines.join('\n')}`;
  if (penalties.bleeding) result += '\n⚠ CHARACTER IS BLEEDING — loses Wounds each round/hour until treated';
  if (penalties.unconscious) result += '\n⚠ CHARACTER IS UNCONSCIOUS';
  if (penalties.conditions.length > 0) result += `\nConditions: ${penalties.conditions.join(', ')}`;

  return result;
}
