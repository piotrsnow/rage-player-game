import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { generatePixelSprite, scaleToSpriteSize } from '../pixelLabClient.js';
import { buildPixelSpriteDescription } from '../pixelLabSpritePrompt.js';
import { createMediaStore } from '../mediaStore.js';
import { config } from '../../config.js';

const log = childLogger({ module: 'spriteJobService' });

const activeJobs = new Map();

async function loadLocationRow(id) {
  const row = await prisma.location.findUnique({
    where: { id },
    select: {
      id: true, canonicalName: true, displayName: true, description: true,
      locationType: true, scale: true, tags: true, atmosphere: true,
      biome: true, dangerLevel: true,
    },
  });
  if (row) row.name = row.canonicalName || row.displayName;
  return row;
}

export async function generateSpriteForNode(locationId) {
  const loc = await loadLocationRow(locationId);
  if (!loc) throw new Error(`Location ${locationId} not found`);

  const { width, height } = scaleToSpriteSize(loc.scale ?? 5);
  const description = buildPixelSpriteDescription(loc, null);

  const result = await generatePixelSprite({
    apiKey: config.pixellabApiKey,
    description,
    width,
    height,
  });

  const b64 = result.image.base64;
  const raw = b64.includes(',') ? b64.split(',')[1] : b64;
  const buffer = Buffer.from(raw, 'base64');
  const store = createMediaStore(config);
  const storagePath = `world/node-sprites/${loc.id}.png`;
  const storeResult = await store.put(storagePath, buffer, 'image/png');

  const key = `node-sprite:${loc.id}`;
  const metadata = { description, width, height, bulkGenerated: true };
  await prisma.mediaAsset.upsert({
    where: { key },
    create: {
      userId: null,
      campaignId: null,
      key,
      type: 'node-sprite',
      contentType: 'image/png',
      size: buffer.length,
      backend: config.mediaBackend,
      path: storagePath,
      metadata,
    },
    update: {
      size: buffer.length,
      path: storagePath,
      metadata,
      lastAccessedAt: new Date(),
    },
  });

  const nodeImageUrl = storeResult.url;
  await prisma.location.update({ where: { id: loc.id }, data: { nodeImageUrl } });

  return nodeImageUrl;
}

async function processItem(item) {
  await prisma.locationSpriteJobItem.update({
    where: { id: item.id },
    data: { status: 'running', attempts: { increment: 1 } },
  });

  try {
    const url = await generateSpriteForNode(item.locationId);
    await prisma.locationSpriteJobItem.update({
      where: { id: item.id },
      data: { status: 'done', resultingUrl: url, error: null },
    });
    return true;
  } catch (err) {
    const msg = err.message?.slice(0, 500) || 'unknown error';
    log.warn({ err, itemId: item.id, locationId: item.locationId }, 'sprite item failed');
    await prisma.locationSpriteJobItem.update({
      where: { id: item.id },
      data: { status: 'failed', error: msg },
    });
    return false;
  }
}

async function runJobWorker(jobId) {
  const job = await prisma.locationSpriteJob.findUnique({ where: { id: jobId } });
  if (!job || job.status === 'cancelled') return;

  await prisma.locationSpriteJob.update({
    where: { id: jobId },
    data: { status: 'running', startedAt: new Date() },
  });

  const concurrency = job.concurrency || 3;

  while (true) {
    const fresh = await prisma.locationSpriteJob.findUnique({
      where: { id: jobId },
      select: { status: true },
    });
    if (!fresh || fresh.status === 'cancelled') break;

    const batch = await prisma.locationSpriteJobItem.findMany({
      where: { jobId, status: 'pending' },
      take: concurrency,
      orderBy: { createdAt: 'asc' },
    });

    if (batch.length === 0) break;

    const results = await Promise.allSettled(
      batch.map((item) => processItem(item)),
    );

    let doneInc = 0;
    let failedInc = 0;
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) doneInc++;
      else failedInc++;
    }

    await prisma.locationSpriteJob.update({
      where: { id: jobId },
      data: {
        done: { increment: doneInc },
        failed: { increment: failedInc },
      },
    });
  }

  const final = await prisma.locationSpriteJob.findUnique({
    where: { id: jobId },
    select: { status: true },
  });
  if (final && final.status !== 'cancelled') {
    await prisma.locationSpriteJob.update({
      where: { id: jobId },
      data: { status: 'completed', finishedAt: new Date() },
    });
  }

  activeJobs.delete(jobId);
  log.info({ jobId }, 'sprite job finished');
}

export async function startSpriteJob(nodes, { userId } = {}) {
  if (!config.pixellabApiKey) {
    throw new Error('PIXELLAB_API_KEY not configured');
  }

  const job = await prisma.locationSpriteJob.create({
    data: {
      total: nodes.length,
      createdBy: userId || null,
      concurrency: 3,
    },
  });

  await prisma.locationSpriteJobItem.createMany({
    data: nodes.map((n) => ({
      jobId: job.id,
      locationId: n.id,
    })),
    skipDuplicates: true,
  });

  const promise = runJobWorker(job.id).catch((err) => {
    log.error({ err, jobId: job.id }, 'sprite job worker crashed');
    prisma.locationSpriteJob.update({
      where: { id: job.id },
      data: { status: 'failed', finishedAt: new Date() },
    }).catch(() => {});
  });

  activeJobs.set(job.id, promise);

  return { jobId: job.id, total: nodes.length };
}

export async function getSpriteJobStatus(jobId) {
  const job = await prisma.locationSpriteJob.findUnique({
    where: { id: jobId },
    select: {
      id: true, status: true, total: true, done: true, failed: true,
      concurrency: true, startedAt: true, finishedAt: true, createdAt: true,
    },
  });
  if (!job) return null;

  let recentErrors = [];
  if (job.failed > 0) {
    recentErrors = await prisma.locationSpriteJobItem.findMany({
      where: { jobId, status: 'failed' },
      take: 5,
      orderBy: { updatedAt: 'desc' },
      select: { locationId: true, error: true },
    });
  }

  return { ...job, recentErrors };
}

export async function cancelSpriteJob(jobId) {
  const job = await prisma.locationSpriteJob.findUnique({
    where: { id: jobId },
    select: { status: true },
  });
  if (!job) return null;
  if (job.status === 'completed' || job.status === 'cancelled') return job;

  await prisma.locationSpriteJob.update({
    where: { id: jobId },
    data: { status: 'cancelled', finishedAt: new Date() },
  });

  return { status: 'cancelled' };
}

export async function getActiveJobId() {
  const active = await prisma.locationSpriteJob.findFirst({
    where: { status: { in: ['pending', 'running'] } },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  return active?.id || null;
}
