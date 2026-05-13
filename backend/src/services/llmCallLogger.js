import { prisma } from '../lib/prisma.js';
import { childLogger } from '../lib/logger.js';

const log = childLogger({ module: 'llmCallLogger' });

const _userId = { current: null };

const MAX_ROWS_PER_USER = 1000;

export function setLlmCallUserId(userId) {
  _userId.current = userId;
}

export function getLlmCallUserId() {
  return _userId.current;
}

async function pruneOldRows(userId) {
  try {
    const cutoff = await prisma.llmCallLog.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      skip: MAX_ROWS_PER_USER,
      take: 1,
      select: { startedAt: true },
    });
    if (cutoff.length > 0) {
      await prisma.llmCallLog.deleteMany({
        where: { userId, startedAt: { lt: cutoff[0].startedAt } },
      });
    }
  } catch (err) {
    log.warn({ err: err?.message }, 'llmCallLogger.prune failed');
  }
}

export async function logLlmCallStart({ userId, type, label, provider, model, request = null }) {
  const uid = userId || _userId.current;
  if (!uid) return null;
  try {
    await pruneOldRows(uid);
    const row = await prisma.llmCallLog.create({
      data: {
        userId: uid,
        type,
        label: (label || type).slice(0, 255),
        provider,
        model,
        status: 'pending',
        request,
      },
    });
    return row.id;
  } catch (err) {
    log.warn({ err: err?.message }, 'llmCallLogger.start failed');
    return null;
  }
}

export async function logLlmCallFinish(id, { durationMs, response = null } = {}) {
  if (!id) return;
  try {
    await prisma.llmCallLog.update({
      where: { id },
      data: {
        status: 'success',
        finishedAt: new Date(),
        durationMs: durationMs ?? null,
        response,
      },
    });
  } catch (err) {
    log.warn({ err: err?.message, id }, 'llmCallLogger.finish failed');
  }
}

export async function logLlmCallFail(id, error) {
  if (!id) return;
  try {
    const errStr = typeof error === 'string' ? error : error?.message || 'Unknown error';
    await prisma.llmCallLog.update({
      where: { id },
      data: { status: 'error', finishedAt: new Date(), error: errStr.slice(0, 1000) },
    });
  } catch (err) {
    log.warn({ err: err?.message, id }, 'llmCallLogger.fail failed');
  }
}
