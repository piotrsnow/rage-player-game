/**
 * Role-keyword affinity table for quest types.
 *
 * Lowercase substring match on CampaignNPC.role / personality. A role is
 * compatible with a quest type when the type's entry lists no keywords
 * (unknown/any) OR any listed keyword appears in the NPC's role text.
 * Peasant shouldn't hand out magical research; priest shouldn't hand out
 * heists. Rough categorization — scene-gen remains free to pick its own
 * NPC if the hint feels wrong narratively.
 */

export const ROLE_AFFINITY = {
  combat: ['strażnik', 'żołnierz', 'kapitan', 'wojownik', 'rycerz', 'łowca', 'myśliwy', 'najemnik', 'warrior', 'soldier', 'guard', 'captain', 'hunter', 'mercenary'],
  magic: ['mag', 'czarodziej', 'wiedźma', 'alchemik', 'kapłan', 'mnich', 'wizard', 'mage', 'witch', 'priest', 'alchemist'],
  heist: ['złodziej', 'rozbójnik', 'przemytnik', 'szuler', 'informator', 'thief', 'rogue', 'smuggler', 'fence'],
  delivery: ['kupiec', 'posłaniec', 'goniec', 'karczmarz', 'merchant', 'messenger', 'innkeeper'],
  investigation: ['śledczy', 'strażnik', 'urzędnik', 'szlachcic', 'kapłan', 'detective', 'guard', 'official', 'noble'],
  hunt: ['myśliwy', 'łowca', 'strażnik', 'wieśniak', 'hunter', 'ranger', 'guard', 'peasant'],
  escort: ['kupiec', 'szlachcic', 'kapłan', 'dyplomata', 'merchant', 'noble', 'diplomat'],
  main: [],
  side: [],
};

export function roleMatchesQuestType(role, questType) {
  if (!questType) return true;
  const keys = ROLE_AFFINITY[String(questType).toLowerCase()];
  if (!keys || keys.length === 0) return true;
  const text = String(role || '').toLowerCase();
  if (!text) return true; // unknown role — don't filter out
  return keys.some((kw) => text.includes(kw));
}
