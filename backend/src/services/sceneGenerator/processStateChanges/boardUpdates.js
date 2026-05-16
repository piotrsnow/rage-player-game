/**
 * Process `stateChanges.boardUpdates` — narrative-driven board mutations.
 *
 * AI emits `boardUpdates: [{ x, y, action, ... }]` when a scene-level event
 * should change the exploration board (e.g. a door is broken, a chest is
 * looted, an explosion destroys a wall). Applies mutations to the location's
 * `tacticalGrid` JSONB.
 */

import { prisma } from '../../../lib/prisma.js';
import { childLogger } from '../../../lib/logger.js';
import { applyBoardMutations, BoardMutationSchema } from '../../../../../shared/domain/explorationBoard.js';
import { z } from 'zod';

const log = childLogger({ module: 'boardUpdates' });

const BoardUpdatesArraySchema = z.array(BoardMutationSchema).max(10);

export function parseBoardUpdates(raw) {
  return BoardUpdatesArraySchema.safeParse(raw);
}

export async function processBoardUpdates(campaignId, mutations, { currentRef = null } = {}) {
  if (!currentRef?.kind || !currentRef?.id) {
    log.debug({ campaignId }, 'boardUpdates: no currentRef — skipped');
    return;
  }
  if (!Array.isArray(mutations) || mutations.length === 0) return;

  try {
    const tblName = currentRef.kind === 'world' ? 'worldLocation' : 'campaignLocation';
    const locRow = await prisma[tblName].findUnique({
      where: { id: currentRef.id },
      select: { tacticalGrid: true },
    });

    if (!locRow?.tacticalGrid?.version) {
      log.debug({ campaignId, ref: `${currentRef.kind}:${currentRef.id}` }, 'boardUpdates: no tacticalGrid on location — skipped');
      return;
    }

    const updated = applyBoardMutations({ ...locRow.tacticalGrid }, mutations);
    await prisma[tblName].update({
      where: { id: currentRef.id },
      data: { tacticalGrid: updated },
    });

    log.info({ campaignId, count: mutations.length }, 'boardUpdates applied to location tacticalGrid');
  } catch (err) {
    log.warn({ err: err?.message, campaignId }, 'boardUpdates processing failed (non-fatal)');
  }
}
