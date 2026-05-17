/**
 * Append-only movement log for NPC location transitions.
 */

export const NPC_LOCATION_MOVE_SOURCE_SCENE = 'scene_process';
export const NPC_LOCATION_MOVE_SOURCE_GRAPH = 'location_graph_manual';

/**
 * @param {import('@prisma/client').PrismaClient} prismaClient
 * @param {object} args
 * @param {string} args.campaignNpcId
 * @param {string|null|undefined} args.fromId  — nullable FK to Location
 * @param {string} args.toId                   — FK to Location
 * @param {string} args.source
 * @param {number|null|undefined} args.sceneIndex
 */
export async function appendCampaignNpcLocationMovement(prismaClient, args) {
  const {
    campaignNpcId,
    fromId,
    toId,
    source,
    sceneIndex,
  } = args;
  if (!campaignNpcId || !toId || !source) return;
  const fid = fromId || null;
  if (fid === toId) return;
  await prismaClient.campaignNpcLocationMovement.create({
    data: {
      campaignNpcId,
      fromId: fid,
      toId,
      source,
      sceneIndex: typeof sceneIndex === 'number' && sceneIndex >= 0 ? sceneIndex : null,
    },
  });
}
