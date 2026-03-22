export const DECAY_PER_HOUR = { hunger: 4.2, thirst: 5.5, bladder: 13, hygiene: 2, rest: 5.5 };

export function hourToPeriod(hour) {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

export function decayNeeds(needs, hoursElapsed) {
  const updated = { ...needs };
  for (const key of Object.keys(DECAY_PER_HOUR)) {
    updated[key] = Math.max(0, Math.round(((updated[key] ?? 100) - DECAY_PER_HOUR[key] * hoursElapsed) * 10) / 10);
  }
  return updated;
}
