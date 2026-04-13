export const HERO_SPRITES = [
  'ranger_green', 'adventurer_brown', 'warrior_tan', 'rogue_blue',
  'fighter_gray', 'mage_light', 'priest_white', 'wizard_blue',
  'jester_green', 'warlock_red',
];

export function hashName(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) - h) + name.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function pickHeroSprite(name) {
  return HERO_SPRITES[hashName(name) % HERO_SPRITES.length];
}

export function classifyNpcCluster(npc) {
  const att = (npc.attitude || '').toLowerCase();
  const role = (npc.role || '').toLowerCase();
  if (att === 'hostile' || att === 'fearful') return 'patrol';
  if (role.includes('merchant') || role.includes('trader') || role.includes('kupiec')) return 'caravan';
  return 'camp';
}

export function buildEntityList(world, scene, characterName) {
  const entities = [];
  const currentLoc = world?.currentLocation?.toLowerCase() || '';
  const speakerNames = new Set();

  if (scene?.dialogueSegments) {
    for (const seg of scene.dialogueSegments) {
      if (seg?.type === 'dialogue' && seg.character) {
        const name = seg.character.trim();
        if (name.toLowerCase() !== (characterName || '').toLowerCase()) {
          speakerNames.add(name.toLowerCase());
        }
      }
    }
  }

  const npcsHere = (world?.npcs || []).filter((npc) => {
    if (!npc?.name || npc.alive === false) return false;
    return npc.lastLocation?.toLowerCase() === currentLoc;
  });

  const clusters = new Map();
  for (const npc of npcsHere) {
    const cluster = classifyNpcCluster(npc);
    if (!clusters.has(cluster)) clusters.set(cluster, []);
    clusters.get(cluster).push(npc);
  }

  let clusterIdx = 0;
  for (const [clusterType, npcs] of clusters) {
    for (let i = 0; i < npcs.length; i++) {
      const npc = npcs[i];
      const isSpeaker = speakerNames.has(npc.name.toLowerCase());
      entities.push({
        name: npc.name,
        type: 'npc',
        sprite: pickHeroSprite(npc.name),
        isSpeaker,
        highlight: isSpeaker,
        cluster: clusterType,
        clusterIdx,
        isLeader: i === 0,
        followerOffset: i,
      });
      speakerNames.delete(npc.name.toLowerCase());
    }
    clusterIdx++;
  }

  for (const name of speakerNames) {
    entities.push({
      name,
      type: 'npc',
      sprite: pickHeroSprite(name),
      isSpeaker: true,
      highlight: true,
      cluster: 'camp',
      clusterIdx: clusterIdx++,
      isLeader: true,
      followerOffset: 0,
    });
  }

  return entities;
}

export function computeEntityPositions(mapEntities, px, py, getTileAt) {
  const positions = new Map();
  const occupied = new Set([`${px},${py}`]);

  const leaderAnchors = [
    { dx: -3, dy: -2 }, { dx: 3, dy: -2 }, { dx: -3, dy: 2 }, { dx: 3, dy: 2 },
    { dx: 0, dy: -3 }, { dx: 0, dy: 3 }, { dx: -4, dy: 0 }, { dx: 4, dy: 0 },
  ];
  const speakerAnchors = [
    { dx: -2, dy: -1 }, { dx: 2, dy: -1 }, { dx: -1, dy: 1 }, { dx: 1, dy: 1 },
  ];
  const followerOffsets = [
    { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 0, dy: -1 },
    { dx: 1, dy: 1 }, { dx: -1, dy: 1 }, { dx: 1, dy: -1 }, { dx: -1, dy: -1 },
  ];

  const speakers = mapEntities.filter((e) => e.isSpeaker && e.isLeader);
  const leaders = mapEntities.filter((e) => !e.isSpeaker && e.isLeader);
  const followers = mapEntities.filter((e) => !e.isLeader);

  const placeAt = (entity, anchorList, basePx, basePy) => {
    const h = hashName(entity.name);
    for (let attempt = 0; attempt < anchorList.length * 2; attempt++) {
      const off = anchorList[(h + attempt) % anchorList.length];
      const ex = basePx + off.dx;
      const ey = basePy + off.dy;
      const key = `${ex},${ey}`;
      if (!occupied.has(key) && getTileAt(ex, ey).passable) {
        positions.set(entity.name, { x: ex, y: ey });
        occupied.add(key);
        return true;
      }
    }
    return false;
  };

  for (const entity of speakers) {
    if (!placeAt(entity, speakerAnchors, px, py)) {
      placeAt(entity, leaderAnchors, px, py);
    }
  }

  for (const entity of leaders) {
    placeAt(entity, leaderAnchors, px, py);
  }

  for (const entity of followers) {
    const leaderEntity = mapEntities.find(
      (e) => e.isLeader && e.clusterIdx === entity.clusterIdx
    );
    const leaderPos = leaderEntity ? positions.get(leaderEntity.name) : null;
    const base = leaderPos || { x: px, y: py };
    if (!placeAt(entity, followerOffsets, base.x, base.y)) {
      placeAt(entity, leaderAnchors, px, py);
    }
  }

  return positions;
}
