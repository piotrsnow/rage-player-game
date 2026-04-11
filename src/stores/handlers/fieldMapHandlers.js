export const fieldMapHandlers = {
  INIT_FIELD_MAP: (draft, action) => {
    const { seed, chunkSize, playerPos, activeBiome, mapMode, roadVariant } = action.payload;
    draft.world.fieldMap = {
      seed: seed || Date.now(),
      chunkSize: chunkSize || 64,
      chunks: {},
      playerPos: playerPos || { x: 32, y: 32 },
      activeBiome: activeBiome || 'plains',
      mapMode: mapMode || 'pola',
      roadVariant: roadVariant || null,
      stepCounter: 0,
      stepBuffer: [],
      discoveredPoi: [],
      interior: null,
    };
  },

  FIELD_MAP_SET_CHUNKS: (draft, action) => {
    if (!draft.world?.fieldMap) return;
    Object.assign(draft.world.fieldMap.chunks, action.payload);
  },

  FIELD_MAP_MOVE_PLAYER: (draft, action) => {
    if (!draft.world?.fieldMap) return;
    const fm = draft.world.fieldMap;
    const { x, y, tile, biome } = action.payload;
    fm.playerPos = { x, y };
    fm.stepCounter += 1;
    fm.stepBuffer.push({ x, y, tile, biome, ts: Date.now() });
  },

  FIELD_MAP_RESET_STEPS: (draft) => {
    if (!draft.world?.fieldMap) return;
    draft.world.fieldMap.stepCounter = 0;
    draft.world.fieldMap.stepBuffer = [];
  },

  FIELD_MAP_DISCOVER_POI: (draft, action) => {
    if (!draft.world?.fieldMap) return;
    const fm = draft.world.fieldMap;
    const poi = action.payload;
    if (fm.discoveredPoi.some((p) => p.x === poi.x && p.y === poi.y)) return;
    fm.discoveredPoi.push(poi);
  },

  FIELD_MAP_SET_BIOME: (draft, action) => {
    if (!draft.world?.fieldMap) return;
    draft.world.fieldMap.activeBiome = action.payload;
  },

  FIELD_MAP_SET_MODE: (draft, action) => {
    if (!draft.world?.fieldMap) return;
    const { mapMode, roadVariant } = action.payload;
    const fm = draft.world.fieldMap;
    if (fm.mapMode === mapMode && fm.roadVariant === (roadVariant || null)) return;
    fm.mapMode = mapMode || fm.mapMode;
    fm.roadVariant = mapMode === 'trakt' ? (roadVariant || null) : null;
    fm.chunks = {};
    fm.stepCounter = 0;
    fm.stepBuffer = [];
    fm.discoveredPoi = [];
  },

  FIELD_MAP_SET_INTERIOR: (draft, action) => {
    if (!draft.world?.fieldMap) return;
    draft.world.fieldMap.interior = action.payload;
  },
};
