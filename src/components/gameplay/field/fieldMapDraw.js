import { TILE_PX, STEPS_PER_TURN } from '../../../services/fieldMap/constants';
import { getTileById } from '../../../services/fieldMap/atlasIndex';
import { HERO_SPRITES } from './fieldMapEntities';

export const SCALE = 2;
export const TILE_DRAW = TILE_PX * SCALE;

export function drawTile(ctx, atlasImage, tileId, dx, dy) {
  if (!tileId || !atlasImage) return;
  const tile = getTileById(tileId);
  if (!tile) return;
  ctx.drawImage(
    atlasImage,
    tile.x, tile.y, TILE_PX, TILE_PX,
    dx, dy, TILE_DRAW, TILE_DRAW,
  );
}

export function drawEntity(ctx, atlasImage, spriteId, drawX, drawY, highlight, isSpeaker) {
  const tile = getTileById(spriteId);
  if (!tile || !atlasImage) {
    ctx.fillStyle = highlight ? '#ffdd44' : '#aabbcc';
    ctx.fillRect(drawX + TILE_DRAW * 0.2, drawY + TILE_DRAW * 0.1, TILE_DRAW * 0.6, TILE_DRAW * 0.8);
    return;
  }

  if (highlight) {
    ctx.shadowColor = isSpeaker ? 'rgba(255, 220, 60, 0.8)' : 'rgba(100, 200, 255, 0.6)';
    ctx.shadowBlur = 10;
  }

  ctx.drawImage(
    atlasImage,
    tile.x, tile.y, TILE_PX, TILE_PX,
    drawX, drawY, TILE_DRAW, TILE_DRAW,
  );

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
}

export function drawNameLabel(ctx, name, drawX, drawY, isSpeaker) {
  const label = name.length > 10 ? name.slice(0, 9) + '…' : name;
  ctx.font = `bold ${Math.max(8, TILE_DRAW * 0.25)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  const lx = drawX + TILE_DRAW / 2;
  const ly = drawY - 2;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  const tw = ctx.measureText(label).width;
  ctx.fillRect(lx - tw / 2 - 2, ly - Math.max(8, TILE_DRAW * 0.25) - 1, tw + 4, Math.max(8, TILE_DRAW * 0.25) + 2);
  ctx.fillStyle = isSpeaker ? '#ffdd44' : '#ddeeff';
  ctx.fillText(label, lx, ly);
}

export function drawFieldMap({
  ctx,
  atlasImage,
  fieldMap,
  viewSize,
  mapEntities,
  entityPositions,
  pathQueue,
  characterName,
  getTileAt,
}) {
  const { w, h } = viewSize;
  ctx.imageSmoothingEnabled = false;

  const tilesW = Math.ceil(w / TILE_DRAW) + 2;
  const tilesH = Math.ceil(h / TILE_DRAW) + 2;
  const halfW = Math.floor(tilesW / 2);
  const halfH = Math.floor(tilesH / 2);

  const px = fieldMap.playerPos.x;
  const py = fieldMap.playerPos.y;

  const offsetX = Math.floor(w / 2) - TILE_DRAW / 2;
  const offsetY = Math.floor(h / 2) - TILE_DRAW / 2;

  for (let ty = -halfH; ty <= halfH; ty++) {
    for (let tx = -halfW; tx <= halfW; tx++) {
      const wx = px + tx;
      const wy = py + ty;
      const drawX = offsetX + tx * TILE_DRAW;
      const drawY = offsetY + ty * TILE_DRAW;

      const { ground, object } = getTileAt(wx, wy);
      if (ground) drawTile(ctx, atlasImage, ground, drawX, drawY);
      if (object) drawTile(ctx, atlasImage, object, drawX, drawY);
    }
  }

  if (pathQueue.length > 0) {
    ctx.fillStyle = 'rgba(100, 200, 255, 0.3)';
    for (const step of pathQueue) {
      const sx = offsetX + (step.x - px) * TILE_DRAW;
      const sy = offsetY + (step.y - py) * TILE_DRAW;
      ctx.fillRect(sx, sy, TILE_DRAW, TILE_DRAW);
    }
  }

  for (const entity of mapEntities) {
    const pos = entityPositions.get(entity.name);
    if (!pos) continue;
    const ex = offsetX + (pos.x - px) * TILE_DRAW;
    const ey = offsetY + (pos.y - py) * TILE_DRAW;
    drawEntity(ctx, atlasImage, entity.sprite, ex, ey, entity.highlight, entity.isSpeaker);
    drawNameLabel(ctx, entity.name, ex, ey, entity.isSpeaker);
  }

  const playerSprite = getTileById('hero_gold') || getTileById(HERO_SPRITES[0]);
  if (playerSprite && atlasImage) {
    ctx.shadowColor = 'rgba(255, 220, 60, 0.9)';
    ctx.shadowBlur = 14;
    ctx.drawImage(
      atlasImage,
      playerSprite.x, playerSprite.y, TILE_PX, TILE_PX,
      offsetX, offsetY, TILE_DRAW, TILE_DRAW,
    );
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  } else {
    ctx.fillStyle = '#ffdd44';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.fillRect(offsetX + TILE_DRAW * 0.2, offsetY + TILE_DRAW * 0.1, TILE_DRAW * 0.6, TILE_DRAW * 0.8);
    ctx.strokeRect(offsetX + TILE_DRAW * 0.2, offsetY + TILE_DRAW * 0.1, TILE_DRAW * 0.6, TILE_DRAW * 0.8);
  }

  if (characterName) {
    drawNameLabel(ctx, characterName, offsetX, offsetY, true);
  }

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(8, 8, 160, 28);
  ctx.fillStyle = '#fff';
  ctx.font = '14px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`Steps: ${fieldMap.stepCounter}/${STEPS_PER_TURN}`, 14, 14);

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(8, 40, 260, 20);
  ctx.fillStyle = '#aaa';
  ctx.font = '11px monospace';
  const modeLabel = fieldMap.mapMode === 'trakt' ? `trakt/${fieldMap.roadVariant || 'pola'}` : (fieldMap.mapMode || fieldMap.activeBiome);
  ctx.fillText(`Pos: (${px}, ${py})  Mode: ${modeLabel}`, 14, 43);
}
