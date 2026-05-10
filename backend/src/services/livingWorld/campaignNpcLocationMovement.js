/**
 * Append-only movement log for CampaignNPC graph nodes (world | campaign).
 */

export const NPC_LOCATION_MOVE_SOURCE_SCENE = 'scene_process';
export const NPC_LOCATION_MOVE_SOURCE_GRAPH = 'location_graph_manual';

/**
 * @param {import('@prisma/client').PrismaClient} prismaClient
 * @param {object} args
 * @param {string} args.campaignNpcId
 * @param {string|null|undefined} args.fromKind
 * @param {string|null|undefined} args.fromId
 * @param {string} args.toKind
 * @param {string} args.toId
 * @param {string} args.source
 * @param {number|null|undefined} args.sceneIndex
 */
export async function appendCampaignNpcLocationMovement(prismaClient, args) {
  const {
    campaignNpcId,
    fromKind,
    fromId,
    toKind,
    toId,
    source,
    sceneIndex,
  } = args;
  if (!campaignNpcId || !toKind || !toId || !source) return;
  const fk = fromKind || null;
  const fid = fromId || null;
  if (fk === toKind && fid === toId) return;
  await prismaClient.campaignNpcLocationMovement.create({
    data: {
      campaignNpcId,
      fromKind: fk,
      fromId: fid,
      toKind,
      toId,
      source,
      sceneIndex: typeof sceneIndex === 'number' && sceneIndex >= 0 ? sceneIndex : null,
    },
  });
}
