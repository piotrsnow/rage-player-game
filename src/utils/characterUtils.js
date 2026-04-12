export function getGenderLabel(gender, t) {
  if (gender === 'female') return t('multiplayer.female');
  if (gender === 'male') return t('multiplayer.male');
  return t('gmModal.genders.unknown');
}
