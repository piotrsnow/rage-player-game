export const DEFAULT_CHARACTER_AGE = 23;

export function normalizeCharacterAge(age, fallback = DEFAULT_CHARACTER_AGE) {
  if (age == null || age === '') return fallback;
  const parsed = Number(age);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.round(parsed));
}
