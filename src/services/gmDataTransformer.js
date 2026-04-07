import { FACTION_DEFINITIONS } from '../data/rpgFactions';

export function buildGraphData(gameState) {
  const nodes = [];
  const edges = [];
  const nodeIds = new Set();

  const world = gameState?.world || {};
  const quests = gameState?.quests || { active: [], completed: [] };
  const character = gameState?.character;
  const party = gameState?.party || [];

  const npcs = world.npcs || [];
  const mapState = world.mapState || [];
  const mapConnections = world.mapConnections || [];
  const factions = world.factions || {};
  const currentLocation = world.currentLocation || '';

  const addNode = (id, name, type, data = {}) => {
    if (nodeIds.has(id)) return;
    nodeIds.add(id);
    nodes.push({ id, name, type, data });
  };

  const addEdge = (source, target, label, type) => {
    if (!nodeIds.has(source) || !nodeIds.has(target)) return;
    if (source === target) return;
    edges.push({ source, target, label, type });
  };

  // Player character
  if (character) {
    addNode('pc', character.name, 'pc', {
      species: character.species,
      career: character.career,
      wounds: character.wounds,
      maxWounds: character.maxWounds,
    });
  }

  // Companions
  party.forEach((comp) => {
    const compId = `comp_${comp.name?.toLowerCase().replace(/\s+/g, '_')}`;
    addNode(compId, comp.name, 'npc', { ...comp, isCompanion: true });
    if (character) {
      addEdge('pc', compId, 'edgeLabels.companion', 'relationship');
    }
  });

  // NPCs
  npcs.forEach((npc) => {
    const npcId = npc.id || `npc_${npc.name?.toLowerCase().replace(/\s+/g, '_')}`;
    addNode(npcId, npc.name, 'npc', npc);
  });

  // Locations
  mapState.forEach((loc) => {
    const locId = loc.id || `loc_${loc.name?.toLowerCase().replace(/\s+/g, '_')}`;
    addNode(locId, loc.name, 'location', loc);
  });

  if (currentLocation && !nodes.find((n) => n.type === 'location' && n.name?.toLowerCase() === currentLocation.toLowerCase())) {
    const locId = `loc_${currentLocation.toLowerCase().replace(/\s+/g, '_')}`;
    addNode(locId, currentLocation, 'location', { name: currentLocation, isCurrent: true });
  }

  // Factions (only those the player has encountered)
  Object.entries(factions).forEach(([factionId, reputation]) => {
    const def = FACTION_DEFINITIONS[factionId];
    const nodeId = `fac_${factionId}`;
    addNode(nodeId, def?.name || factionId, 'faction', {
      factionId,
      reputation,
      icon: def?.icon,
      description: def?.description,
    });
  });

  // Quests
  quests.active?.forEach((quest) => {
    const qId = quest.id || `quest_${quest.name?.toLowerCase().replace(/\s+/g, '_')}`;
    addNode(qId, quest.name, 'quest', { ...quest, status: 'active' });
  });

  // --- EDGES ---

  // NPC relationships
  npcs.forEach((npc) => {
    const npcId = npc.id || `npc_${npc.name?.toLowerCase().replace(/\s+/g, '_')}`;

    // NPC-to-NPC relationships
    (npc.relationships || []).forEach((rel) => {
      const targetNpc = npcs.find((n) => n.name?.toLowerCase() === rel.npcName?.toLowerCase());
      if (targetNpc) {
        const targetId = targetNpc.id || `npc_${targetNpc.name?.toLowerCase().replace(/\s+/g, '_')}`;
        addEdge(npcId, targetId, rel.type, 'relationship');
      }
    });

    // NPC-to-Location
    if (npc.lastLocation) {
      const locNode = findLocationNode(nodes, npc.lastLocation);
      if (locNode) {
        addEdge(npcId, locNode.id, 'edgeLabels.locatedAt', 'located_at');
      }
    }

    // NPC-to-Faction
    if (npc.factionId && nodeIds.has(`fac_${npc.factionId}`)) {
      addEdge(npcId, `fac_${npc.factionId}`, 'edgeLabels.member', 'faction_member');
    }
  });

  // Map connections (location-to-location)
  mapConnections.forEach(({ from, to }) => {
    const fromNode = findLocationNode(nodes, from);
    const toNode = findLocationNode(nodes, to);
    if (fromNode && toNode) {
      addEdge(fromNode.id, toNode.id, 'edgeLabels.path', 'map_connection');
    }
  });

  // PC current location
  if (character && currentLocation) {
    const locNode = findLocationNode(nodes, currentLocation);
    if (locNode) {
      addEdge('pc', locNode.id, 'edgeLabels.currentLocation', 'located_at');
    }
  }

  // Quest-to-NPC (giver) and Quest-to-Location
  quests.active?.forEach((quest) => {
    const qId = quest.id || `quest_${quest.name?.toLowerCase().replace(/\s+/g, '_')}`;

    if (quest.questGiverId) {
      const giverNpc = npcs.find(
        (n) => n.id === quest.questGiverId || n.name?.toLowerCase() === quest.questGiverId?.toLowerCase()
      );
      if (giverNpc) {
        const giverId = giverNpc.id || `npc_${giverNpc.name?.toLowerCase().replace(/\s+/g, '_')}`;
        addEdge(giverId, qId, 'edgeLabels.questGiver', 'quest_giver');
      }
    }

    if (quest.locationId) {
      const locNode = findLocationNode(nodes, quest.locationId);
      if (locNode) {
        addEdge(qId, locNode.id, 'edgeLabels.questLocation', 'quest_location');
      }
    }
  });

  return { nodes, edges };
}

function findLocationNode(nodes, locationName) {
  if (!locationName) return null;
  const lower = locationName.toLowerCase();
  return nodes.find((n) => n.type === 'location' && n.name?.toLowerCase() === lower);
}

export const NODE_COLORS = {
  pc: { fill: '#c59aff', stroke: '#a06de0', text: '#1f1f22' },
  npc: { fill: '#c59aff', stroke: '#8b5fbf', text: '#1f1f22' },
  location: { fill: '#7dd3a8', stroke: '#4fa87a', text: '#1f1f22' },
  faction: { fill: '#f0b86e', stroke: '#c9913a', text: '#1f1f22' },
  quest: { fill: '#6ec4f0', stroke: '#3a96c9', text: '#1f1f22' },
};

export const NODE_ICONS = {
  pc: 'person',
  npc: 'person',
  location: 'place',
  faction: 'shield',
  quest: 'assignment',
};

export const EDGE_STYLES = {
  relationship: { dash: '', opacity: 0.7 },
  located_at: { dash: '6 3', opacity: 0.4 },
  faction_member: { dash: '4 4', opacity: 0.5 },
  quest_giver: { dash: '8 4', opacity: 0.6 },
  quest_location: { dash: '6 3', opacity: 0.4 },
  map_connection: { dash: '3 3', opacity: 0.3 },
};
