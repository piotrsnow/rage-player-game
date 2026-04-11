const PACING_TENSION = {
  combat: 25, chase: 20, stealth: 15, dramatic: 15,
  exploration: 0, dialogue: -5, travel_montage: -10,
  celebration: -15, rest: -20, dream: -10, cutscene: 5,
};

export function calculateTensionScore(scenes, combat) {
  let tension = 50;

  const recent = (scenes || []).slice(-5);
  for (const scene of recent) {
    const pacing = scene.scenePacing || 'exploration';
    tension += PACING_TENSION[pacing] ?? 0;
  }

  if (combat?.active) tension += 20;

  const last3 = (scenes || []).slice(-3);
  for (const scene of last3) {
    const wc = scene.stateChanges?.woundsChange ?? scene.diceRoll?.woundsChange ?? 0;
    if (wc < 0) tension += 15;
  }

  const decayScenes = Math.min(recent.length, 5);
  tension -= decayScenes * 5;

  return Math.max(0, Math.min(100, Math.round(tension)));
}

export function getConsecutiveHighCount(scenes, threshold = 80) {
  let count = 0;
  const reversed = (scenes || []).slice().reverse();
  for (const scene of reversed) {
    const pacing = scene.scenePacing || 'exploration';
    const pacingVal = PACING_TENSION[pacing] ?? 0;
    if (pacingVal >= 15) count++;
    else break;
  }
  return count;
}

export function getConsecutiveLowCount(scenes) {
  let count = 0;
  const reversed = (scenes || []).slice().reverse();
  for (const scene of reversed) {
    const pacing = scene.scenePacing || 'exploration';
    const pacingVal = PACING_TENSION[pacing] ?? 0;
    if (pacingVal <= -5) count++;
    else break;
  }
  return count;
}

export function getTensionGuidance(tension, scenes) {
  const highCount = getConsecutiveHighCount(scenes);
  const lowCount = getConsecutiveLowCount(scenes);

  if (tension > 80 && highCount >= 3) {
    return `\nTENSION GUIDANCE (score: ${tension}/100, ${highCount} consecutive high-tension scenes):
BREATHING ROOM NEEDED — the story has been intense for too long. This scene should offer a moment of calm: 
a quiet conversation, a brief rest, a reflective moment, or a travel montage. Let the player recover before the next escalation.\n`;
  }

  if (tension < 20 && lowCount >= 3) {
    return `\nTENSION GUIDANCE (score: ${tension}/100, ${lowCount} consecutive low-tension scenes):
INJECT CONFLICT — the story needs energy. Introduce a complication, threat, unexpected visitor, alarming discovery, 
or moral dilemma to raise the stakes and re-engage the player.\n`;
  }

  if (tension >= 40 && tension <= 60) {
    return `\nTENSION GUIDANCE (score: ${tension}/100): GOOD PACE — maintain the current rhythm.\n`;
  }

  if (tension > 60) {
    return `\nTENSION GUIDANCE (score: ${tension}/100): Rising tension — consider whether the next scene escalates further or offers a brief reprieve.\n`;
  }

  return `\nTENSION GUIDANCE (score: ${tension}/100): Low tension — look for opportunities to introduce interesting complications.\n`;
}
