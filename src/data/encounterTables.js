export const ENCOUNTER_TABLES = {
  forest: {
    day: [
      { weight: 20, enemies: ['Wolf'], count: [2, 4], description: 'A pack of wolves stalks through the undergrowth' },
      { weight: 15, enemies: ['Wild Boar'], count: [1, 2], description: 'A territorial boar charges from the brush' },
      { weight: 15, enemies: ['Ungor'], count: [3, 5], description: 'Ungor scouts ambush from behind the trees' },
      { weight: 10, enemies: ['Gor'], count: [2, 3], description: 'Gors emerge from a hidden beastman camp' },
      { weight: 10, enemies: ['Bandit'], count: [2, 4], description: 'Bandits block the forest path' },
      { weight: 5, enemies: ['Bear'], count: [1, 1], description: 'A massive bear guards its territory' },
      { weight: 5, enemies: ['Bestigor'], count: [1, 2], description: 'Bestigors on a warpath crash through the trees' },
      { weight: 20, enemies: [], count: [0, 0], description: 'No encounter — the forest is peaceful' },
    ],
    night: [
      { weight: 25, enemies: ['Wolf'], count: [3, 6], description: 'Wolves howl and close in on the camp' },
      { weight: 15, enemies: ['Ungor'], count: [4, 6], description: 'Ungors raid in the darkness' },
      { weight: 15, enemies: ['Gor'], count: [2, 4], description: 'A Gor warband stumbles upon the travelers' },
      { weight: 10, enemies: ['Ghost'], count: [1, 2], description: 'Restless spirits drift through the trees' },
      { weight: 10, enemies: ['Zombie'], count: [3, 5], description: 'Zombies shamble from an old battlefield' },
      { weight: 5, enemies: ['Bestigor'], count: [2, 3], description: 'A Bestigor hunting party attacks' },
      { weight: 20, enemies: [], count: [0, 0], description: 'No encounter — an uneasy silence' },
    ],
  },
  city: {
    day: [
      { weight: 20, enemies: ['Bandit'], count: [2, 3], description: 'Street thugs corner you in an alley' },
      { weight: 10, enemies: ['Chaos Cultist'], count: [2, 4], description: 'Cultists attack during a clandestine ritual' },
      { weight: 5, enemies: ['Giant Rat'], count: [4, 8], description: 'Giant rats swarm from the sewers' },
      { weight: 65, enemies: [], count: [0, 0], description: 'No encounter — city streets bustle normally' },
    ],
    night: [
      { weight: 25, enemies: ['Bandit'], count: [3, 5], description: 'Muggers emerge from the shadows' },
      { weight: 15, enemies: ['Chaos Cultist'], count: [3, 5], description: 'A cult procession turns violent' },
      { weight: 10, enemies: ['Giant Rat'], count: [5, 10], description: 'A rat swarm erupts from a manhole' },
      { weight: 5, enemies: ['Ghost'], count: [1, 1], description: 'A ghost haunts the darkened streets' },
      { weight: 5, enemies: ['Skaven Clanrat'], count: [3, 5], description: 'Skaven emerge from the sewers' },
      { weight: 40, enemies: [], count: [0, 0], description: 'No encounter — the night is quiet' },
    ],
  },
  road: {
    day: [
      { weight: 20, enemies: ['Bandit'], count: [3, 5], description: 'Highwaymen demand a toll' },
      { weight: 10, enemies: ['Wolf'], count: [2, 3], description: 'Wolves trail the road' },
      { weight: 10, enemies: ['Goblin'], count: [4, 8], description: 'Goblins spring an ambush' },
      { weight: 5, enemies: ['Orc Boy'], count: [2, 3], description: 'Orc raiders attack a caravan' },
      { weight: 55, enemies: [], count: [0, 0], description: 'No encounter — safe travels' },
    ],
    night: [
      { weight: 20, enemies: ['Bandit'], count: [3, 5], description: 'Bandits attack the campsite' },
      { weight: 15, enemies: ['Wolf'], count: [3, 5], description: 'A wolf pack hunts in the dark' },
      { weight: 10, enemies: ['Goblin'], count: [5, 10], description: 'Goblin night-raiders descend' },
      { weight: 10, enemies: ['Zombie'], count: [2, 4], description: 'The dead walk the old road' },
      { weight: 5, enemies: ['Orc Boy'], count: [2, 4], description: 'Orcs raid under moonlight' },
      { weight: 40, enemies: [], count: [0, 0], description: 'No encounter — watchfire keeps threats at bay' },
    ],
  },
  dungeon: {
    day: [
      { weight: 20, enemies: ['Skeleton Warrior'], count: [3, 5], description: 'Skeletons animate as you enter the chamber' },
      { weight: 15, enemies: ['Giant Rat'], count: [5, 10], description: 'Rats fill the narrow passage' },
      { weight: 15, enemies: ['Skaven Clanrat'], count: [3, 6], description: 'Skaven defend their tunnel-warren' },
      { weight: 10, enemies: ['Zombie'], count: [3, 5], description: 'Zombies guard an ancient tomb' },
      { weight: 10, enemies: ['Skaven Stormvermin'], count: [2, 3], description: 'Stormvermin patrol the depths' },
      { weight: 5, enemies: ['Wight'], count: [1, 1], description: 'A Wight lord awakens on its throne' },
      { weight: 5, enemies: ['Nurgling Swarm'], count: [2, 4], description: 'Nurglings bubble from a corrupted pool' },
      { weight: 20, enemies: [], count: [0, 0], description: 'No encounter — the chamber is empty' },
    ],
    night: [
      { weight: 20, enemies: ['Skeleton Warrior'], count: [4, 6], description: 'The dead rise in greater numbers at night' },
      { weight: 15, enemies: ['Ghost'], count: [1, 3], description: 'Ghostly apparitions haunt the corridors' },
      { weight: 15, enemies: ['Skaven Clanrat'], count: [4, 8], description: 'A Skaven horde swarms forward' },
      { weight: 10, enemies: ['Zombie'], count: [4, 6], description: 'Zombies pour from hidden crypts' },
      { weight: 10, enemies: ['Chaos Cultist'], count: [3, 5], description: 'Cultists perform a dark ritual' },
      { weight: 5, enemies: ['Bloodletter'], count: [1, 1], description: 'A Bloodletter manifests from a Chaos portal' },
      { weight: 5, enemies: ['Chaos Warrior'], count: [1, 2], description: 'Chaos Warriors guard a dark sanctum' },
      { weight: 20, enemies: [], count: [0, 0], description: 'No encounter — eerie silence pervades' },
    ],
  },
  swamp: {
    day: [
      { weight: 20, enemies: ['Zombie'], count: [3, 5], description: 'Bog zombies rise from the mire' },
      { weight: 15, enemies: ['Giant Rat'], count: [4, 8], description: 'Diseased rats swarm the path' },
      { weight: 10, enemies: ['Nurgling Swarm'], count: [2, 4], description: 'Nurglings emerge from putrid water' },
      { weight: 10, enemies: ['Goblin'], count: [3, 6], description: 'Swamp goblins ambush from the reeds' },
      { weight: 45, enemies: [], count: [0, 0], description: 'No encounter — just the buzz of insects' },
    ],
    night: [
      { weight: 25, enemies: ['Zombie'], count: [4, 7], description: 'The swamp disgorges its dead' },
      { weight: 15, enemies: ['Ghost'], count: [1, 3], description: 'Will-o-wisps and ghosts lure travelers' },
      { weight: 10, enemies: ['Nurgling Swarm'], count: [3, 5], description: 'Nurglings celebrate in the rot' },
      { weight: 50, enemies: [], count: [0, 0], description: 'No encounter — fetid darkness' },
    ],
  },
};

function rollWeighted(entries) {
  const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }
  return entries[entries.length - 1];
}

function randomCount(range) {
  const [min, max] = range;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function rollEncounter(regionType = 'road', timeOfDay = 'day') {
  const period = (timeOfDay === 'night' || timeOfDay === 'evening') ? 'night' : 'day';
  const table = ENCOUNTER_TABLES[regionType]?.[period] || ENCOUNTER_TABLES.road.day;
  const entry = rollWeighted(table);

  if (entry.enemies.length === 0) {
    return { encounter: false, description: entry.description };
  }

  const count = randomCount(entry.count);
  return {
    encounter: true,
    description: entry.description,
    enemies: entry.enemies,
    count,
    regionType,
    timeOfDay: period,
  };
}

export function getAvailableRegions() {
  return Object.keys(ENCOUNTER_TABLES);
}

export function formatEncounterForPrompt(encounterResult) {
  if (!encounterResult.encounter) return '';
  return `RANDOM ENCOUNTER: ${encounterResult.description}. ${encounterResult.count}x ${encounterResult.enemies.join(', ')} appear (region: ${encounterResult.regionType}, time: ${encounterResult.timeOfDay}). Use the bestiary stats for these enemies if initiating combat.`;
}
