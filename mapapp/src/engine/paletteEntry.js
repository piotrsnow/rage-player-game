// Canonical shape for a single palette entry used by the Map Editor
// (Palette, MapCanvas, autotile/wall tools, save/load) and the read-only
// walk-test (PlayCanvas + renderTileLayers). Both code paths build their
// palette differently, but must agree on the field layout so snapshots,
// helpers and tests can be shared.
//
// Use `makePaletteEntry` to construct entries; never inline the object
// literal. Use `makePaletteKey` to derive the `${tilesetId}:${localId}`
// string that keys `paletteByKey` and MapDoc cells.

/**
 * @typedef {Object} PaletteEntry
 * @property {string} key                     Stable "<tilesetId>:<localId>" id.
 * @property {string} packId                  Source TilesetPack id.
 * @property {string} tilesetId               Source Tileset id.
 * @property {string} [tilesetName]           Human label (editor UI only).
 * @property {number} localId                 Tile index within the tileset grid.
 * @property {string} imageKey                Media key of the rendered atlas variant.
 * @property {number} col                     Column in the atlas grid.
 * @property {number} row                     Row in the atlas grid.
 * @property {number} tilesize                Atlas cell size in pixels (render-time variant).
 * @property {string[]} atoms                 Semantic atoms (e.g. 'wall', 'floor').
 * @property {Record<string, unknown>} traits Arbitrary tile traits (editor UI + rules).
 * @property {string|null} autotileGroupId    Autotile group membership (null if none).
 * @property {string|null} autotileRole       Autotile bitmask role (null if none).
 */

/**
 * @typedef {Object} WallCandidate
 * @property {number} paletteIndex            1-based index into `palette` (0 = empty).
 * @property {string[]} atoms
 * @property {string|null} autotileRole
 * @property {string} tilesetId
 */

/**
 * Build the canonical key used by `paletteByKey` and MapDoc cell objects.
 * @param {string} tilesetId
 * @param {number} localId
 * @returns {string}
 */
export function makePaletteKey(tilesetId, localId) {
  return `${tilesetId}:${localId}`;
}

/**
 * Construct a `PaletteEntry` from the tileset + tile records returned by
 * the map-studio API. `tile` may be undefined (gaps in the tile grid) —
 * fields default to empty-but-present so consumers can rely on the shape.
 *
 * @param {Object} args
 * @param {string} args.packId
 * @param {{ id: string, name?: string }} args.ts
 * @param {Object} [args.tile]
 * @param {string} args.imageKey
 * @param {number} args.tilesize
 * @param {number} args.localId
 * @param {number} args.col
 * @param {number} args.row
 * @returns {PaletteEntry}
 */
export function makePaletteEntry({
  packId, ts, tile, imageKey, tilesize, localId, col, row,
}) {
  return {
    key: makePaletteKey(ts.id, localId),
    packId,
    tilesetId: ts.id,
    tilesetName: ts.name,
    localId,
    imageKey,
    col,
    row,
    tilesize,
    atoms: tile?.atoms || [],
    traits: tile?.traits || {},
    autotileGroupId: tile?.autotileGroupId || null,
    autotileRole: tile?.autotileRole || null,
  };
}
