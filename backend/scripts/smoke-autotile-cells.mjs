#!/usr/bin/env node
// Smoke test for AutotileGroup `cells` round-trip and tile propagation.
//
// Creates a disposable pack + tileset + 5x5 tile grid via prisma, then
// exercises the real autotile route handler (mounted on a mini fastify app
// with a fake-auth preHandler) to:
//   1. POST an autotile group with a `cells` map → asserts tiles got roles
//   2. PATCH the group with new cells → asserts propagation updates tiles,
//      and cells removed from the map clear their tile's group link
//   3. DELETE the group → asserts tiles lose the group link
//
// Run: node backend/scripts/smoke-autotile-cells.mjs
// Requires a reachable MongoDB (DATABASE_URL) and `npx prisma generate` done.

import 'dotenv/config';
import Fastify from 'fastify';
import { PrismaClient } from '@prisma/client';
import { autotileRoutes } from '../src/routes/mapStudio/autotile.js';

const prisma = new PrismaClient();

const TILESET_COLS = 5;
const TILESET_ROWS = 5;
const NATIVE = 16;

function log(label, ok, detail = '') {
  const tag = ok ? 'PASS' : 'FAIL';
  console.log(detail ? `${tag}  ${label}  — ${detail}` : `${tag}  ${label}`);
  if (!ok) process.exitCode = 1;
}

async function buildApp(userId) {
  const app = Fastify();
  app.addHook('preHandler', async (req) => {
    req.user = { id: userId };
  });
  await app.register(autotileRoutes, { prefix: '/autotile' });
  return app;
}

async function makeFixture() {
  // ObjectId-shaped userId is fine for our purposes (no real User row needed
  // because autotileRoutes only checks pack.userId).
  const userId = '0'.repeat(24).replace(/^./, 'a');
  const pack = await prisma.tilesetPack.create({
    data: {
      userId,
      name: `smoke-autotile-cells ${Date.now()}`,
      projectTilesize: NATIVE,
      scaleAlgo: 'nearest',
    },
  });
  const tileset = await prisma.tileset.create({
    data: {
      packId: pack.id,
      name: 'smoke-ts',
      imageKey: 'smoke/fake.png',
      imageWidth: TILESET_COLS * NATIVE,
      imageHeight: TILESET_ROWS * NATIVE,
      nativeTilesize: NATIVE,
    },
  });
  const tileRows = [];
  for (let r = 0; r < TILESET_ROWS; r++) {
    for (let c = 0; c < TILESET_COLS; c++) {
      tileRows.push({
        tilesetId: tileset.id,
        regionId: '',
        localId: r * TILESET_COLS + c,
        col: c,
        row: r,
        nativeSize: NATIVE,
      });
    }
  }
  // createMany isn't supported on MongoDB for all versions — fall back to a
  // loop if needed. Prisma 5 supports it on Mongo since 4.14.
  try {
    await prisma.tile.createMany({ data: tileRows });
  } catch {
    for (const t of tileRows) await prisma.tile.create({ data: t });
  }
  return { userId, pack, tileset };
}

async function cleanup(tileset, pack) {
  await prisma.tile.deleteMany({ where: { tilesetId: tileset.id } }).catch(() => {});
  await prisma.autotileGroup.deleteMany({ where: { tilesetId: tileset.id } }).catch(() => {});
  await prisma.tileset.delete({ where: { id: tileset.id } }).catch(() => {});
  await prisma.tilesetPack.delete({ where: { id: pack.id } }).catch(() => {});
}

async function run() {
  const { userId, pack, tileset } = await makeFixture();
  const app = await buildApp(userId);
  let groupId = null;
  try {
    // 1. CREATE with cells
    const cellsCreate = {
      '0,0': 'corner_NW',
      '1,0': 'edge_N',
      '2,0': 'corner_NE',
      '0,1': 'edge_W',
      '1,1': 'fill',
      '2,1': 'edge_E',
    };
    const createRes = await app.inject({
      method: 'POST',
      url: '/autotile/',
      payload: {
        tilesetId: tileset.id,
        name: 'smoke-group',
        layout: 'custom',
        originCol: 0,
        originRow: 0,
        cols: 3,
        rows: 2,
        cells: cellsCreate,
      },
    });
    const createdBody = createRes.json();
    groupId = createdBody.id;
    log(
      'POST /autotile/ → 200 + cells echoed',
      createRes.statusCode === 200 &&
        createdBody.cells &&
        createdBody.cells['1,1'] === 'fill',
      `status=${createRes.statusCode} cellsKey=${Object.keys(createdBody.cells || {}).length}`
    );

    // Assert tile propagation (e.g. tile at col=1 row=1 → localId = 1*5+1 = 6).
    const tileFill = await prisma.tile.findFirst({
      where: { tilesetId: tileset.id, localId: 1 * TILESET_COLS + 1 },
    });
    log(
      'tile(localId=6) has role=fill and links to group',
      tileFill?.autotileRole === 'fill' && tileFill?.autotileGroupId === groupId,
      `role=${tileFill?.autotileRole} groupId=${tileFill?.autotileGroupId}`
    );

    const tileNW = await prisma.tile.findFirst({
      where: { tilesetId: tileset.id, localId: 0 },
    });
    log(
      'tile(localId=0) role=corner_NW',
      tileNW?.autotileRole === 'corner_NW',
      `role=${tileNW?.autotileRole}`
    );

    // 2. PATCH — drop a cell (2,1) and add a new one (0,0 → corner_SW)
    const cellsPatch = {
      '0,0': 'corner_SW',
      '1,1': 'inner_NE',
    };
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/autotile/${groupId}`,
      payload: { cells: cellsPatch },
    });
    log(
      'PATCH /autotile/:id → 200',
      patchRes.statusCode === 200,
      `status=${patchRes.statusCode} body=${patchRes.payload.slice(0, 120)}`
    );

    const tileNWAfter = await prisma.tile.findFirst({
      where: { tilesetId: tileset.id, localId: 0 },
    });
    log(
      'tile(0) role re-stamped to corner_SW',
      tileNWAfter?.autotileRole === 'corner_SW',
      `role=${tileNWAfter?.autotileRole}`
    );

    const tileDropped = await prisma.tile.findFirst({
      where: { tilesetId: tileset.id, localId: 1 * TILESET_COLS + 2 },
    });
    log(
      'tile(localId=7) cleared after cell removed',
      tileDropped?.autotileGroupId == null && tileDropped?.autotileRole == null,
      `groupId=${tileDropped?.autotileGroupId} role=${tileDropped?.autotileRole}`
    );

    // 3. DELETE
    const delRes = await app.inject({ method: 'DELETE', url: `/autotile/${groupId}` });
    log('DELETE /autotile/:id → 200', delRes.statusCode === 200, `status=${delRes.statusCode}`);
    const stillLinked = await prisma.tile.count({
      where: { tilesetId: tileset.id, autotileGroupId: groupId },
    });
    log('all tiles unlinked after delete', stillLinked === 0, `remaining=${stillLinked}`);
    groupId = null;
  } finally {
    await app.close();
    if (groupId) await prisma.autotileGroup.delete({ where: { id: groupId } }).catch(() => {});
    await cleanup(tileset, pack);
    await prisma.$disconnect();
  }
}

run().catch(async (err) => {
  console.error('smoke-autotile-cells threw:', err);
  try { await prisma.$disconnect(); } catch {}
  process.exit(1);
});
