export function speciesIcon(species) {
  const s = (species || '').toLowerCase();
  if (s.includes('elf')) return 'forest';
  if (s.includes('dwarf') || s.includes('krasnolud')) return 'engineering';
  if (s.includes('halfling') || s.includes('hobbit') || s.includes('niziolek')) return 'restaurant';
  if (s.includes('skaven')) return 'pest_control';
  if (s.includes('orc') || s.includes('goblin') || s.includes('ork')) return 'sports_martial_arts';
  if (s.includes('human') || s.includes('czlowiek')) return 'person';
  return 'person_outline';
}
