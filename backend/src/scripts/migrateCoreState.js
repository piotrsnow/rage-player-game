/**
 * One-time migration: decompose Campaign.coreState into normalized collections.
 *
 * 1a) Extract character  → Campaign.characterState
 * 1b) Extract world.npcs → CampaignNPC  (upsert, skip existing)
 *     Extract world.knowledgeBase.events/decisions → CampaignKnowledge (skip existing)
 * 1c) Extract quests     → CampaignQuest (upsert)
 *
 * After extraction the fields are removed from coreState to slim the blob.
 *
 * Idempotent: safe to re-run. Already-extracted campaigns are detected and skipped.
 *
 * Usage:
 *   node backend/src/scripts/migrateCoreState.js            # dry-run (default)
 *   node backend/src/scripts/migrateCoreState.js --apply     # actually write
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BATCH_SIZE = 50;
const DRY_RUN = !process.argv.includes('--apply');

async function migrate() {
  if (DRY_RUN) {
    console.log('=== DRY RUN (pass --apply to write) ===\n');
  }

  const total = await prisma.campaign.count();
  console.log(`Found ${total} campaigns to process.\n`);

  let offset = 0;
  let processed = 0;
  let skipped = 0;
  let migrated = 0;

  while (offset < total) {
    const campaigns = await prisma.campaign.findMany({
      select: { id: true, coreState: true, characterState: true },
      orderBy: { createdAt: 'asc' },
      skip: offset,
      take: BATCH_SIZE,
    });

    for (const campaign of campaigns) {
      processed++;
      let coreState;
      try {
        coreState = JSON.parse(campaign.coreState);
      } catch {
        console.warn(`  [SKIP] Campaign ${campaign.id}: invalid coreState JSON`);
        skipped++;
        continue;
      }

      const hasCharacter = coreState.character && Object.keys(coreState.character).length > 0;
      const hasNpcs = Array.isArray(coreState.world?.npcs) && coreState.world.npcs.length > 0;
      const hasKnowledgeEvents = Array.isArray(coreState.world?.knowledgeBase?.events) && coreState.world.knowledgeBase.events.length > 0;
      const hasKnowledgeDecisions = Array.isArray(coreState.world?.knowledgeBase?.decisions) && coreState.world.knowledgeBase.decisions.length > 0;
      const hasQuests = (coreState.quests?.active?.length > 0 || coreState.quests?.completed?.length > 0);

      if (!hasCharacter && !hasNpcs && !hasKnowledgeEvents && !hasKnowledgeDecisions && !hasQuests) {
        skipped++;
        continue;
      }

      console.log(`  [${processed}/${total}] Campaign ${campaign.id}:`);

      // --- 1a: Character ---
      let characterState = {};
      const existingCharState = campaign.characterState ? JSON.parse(campaign.characterState) : {};
      if (hasCharacter && Object.keys(existingCharState).length === 0) {
        characterState = coreState.character;
        delete coreState.character;
        console.log(`    character: extracted`);
      } else if (hasCharacter) {
        delete coreState.character;
        console.log(`    character: removed from blob (already in characterState)`);
      }

      // --- 1b: NPCs ---
      if (hasNpcs) {
        let syncCount = 0;
        for (const npc of coreState.world.npcs) {
          if (!npc.name) continue;
          const npcId = npc.name.toLowerCase().replace(/\s+/g, '_');
          if (!DRY_RUN) {
            try {
              await prisma.campaignNPC.upsert({
                where: { campaignId_npcId: { campaignId: campaign.id, npcId } },
                create: {
                  campaignId: campaign.id,
                  npcId,
                  name: npc.name,
                  gender: npc.gender || 'unknown',
                  role: npc.role || null,
                  personality: npc.personality || null,
                  attitude: npc.attitude || 'neutral',
                  disposition: npc.disposition ?? 0,
                  alive: npc.alive ?? true,
                  lastLocation: npc.lastLocation || null,
                  factionId: npc.factionId || null,
                  notes: npc.notes || null,
                  relationships: JSON.stringify(npc.relationships || []),
                },
                update: {
                  attitude: npc.attitude || 'neutral',
                  disposition: npc.disposition ?? 0,
                  alive: npc.alive ?? true,
                  lastLocation: npc.lastLocation || null,
                  factionId: npc.factionId || null,
                  relationships: JSON.stringify(npc.relationships || []),
                },
              });
              syncCount++;
            } catch (err) {
              console.warn(`    NPC "${npc.name}" upsert failed: ${err.message}`);
            }
          } else {
            syncCount++;
          }
        }
        delete coreState.world.npcs;
        console.log(`    npcs: ${syncCount} synced, removed from blob`);
      }

      // --- 1b: Knowledge ---
      if (hasKnowledgeEvents || hasKnowledgeDecisions) {
        let syncCount = 0;
        const existingKnowledge = DRY_RUN ? [] : await prisma.campaignKnowledge.findMany({
          where: { campaignId: campaign.id, entryType: { in: ['event', 'decision'] } },
          select: { summary: true, entryType: true },
        });
        const existingKeys = new Set(existingKnowledge.map((e) => `${e.entryType}:${e.summary}`));

        for (const e of (coreState.world?.knowledgeBase?.events || [])) {
          const summary = e.summary || (typeof e === 'string' ? e : '');
          if (!summary || existingKeys.has(`event:${summary}`)) continue;
          if (!DRY_RUN) {
            try {
              await prisma.campaignKnowledge.create({
                data: {
                  campaignId: campaign.id,
                  entryType: 'event',
                  summary,
                  content: JSON.stringify(e),
                  importance: e.importance || null,
                  tags: JSON.stringify(e.tags || []),
                  sceneIndex: e.sceneIndex ?? null,
                },
              });
              syncCount++;
            } catch (err) {
              console.warn(`    Knowledge event sync failed: ${err.message}`);
            }
          } else {
            syncCount++;
          }
        }

        for (const d of (coreState.world?.knowledgeBase?.decisions || [])) {
          const summary = `${d.choice || ''} -> ${d.consequence || ''}`;
          if (!d.choice || existingKeys.has(`decision:${summary}`)) continue;
          if (!DRY_RUN) {
            try {
              await prisma.campaignKnowledge.create({
                data: {
                  campaignId: campaign.id,
                  entryType: 'decision',
                  summary,
                  content: JSON.stringify(d),
                  importance: d.importance || null,
                  tags: JSON.stringify(d.tags || []),
                  sceneIndex: d.sceneIndex ?? null,
                },
              });
              syncCount++;
            } catch (err) {
              console.warn(`    Knowledge decision sync failed: ${err.message}`);
            }
          } else {
            syncCount++;
          }
        }

        if (coreState.world?.knowledgeBase) {
          delete coreState.world.knowledgeBase.events;
          delete coreState.world.knowledgeBase.decisions;
        }
        console.log(`    knowledge: ${syncCount} entries synced, events/decisions removed from blob`);
      }

      // --- 1c: Quests ---
      if (hasQuests) {
        let syncCount = 0;
        const all = [
          ...(coreState.quests.active || []).map((q) => ({ ...q, _status: 'active' })),
          ...(coreState.quests.completed || []).map((q) => ({ ...q, _status: 'completed' })),
        ];

        for (const q of all) {
          if (!q.id || !q.name) continue;
          if (!DRY_RUN) {
            try {
              await prisma.campaignQuest.upsert({
                where: { campaignId_questId: { campaignId: campaign.id, questId: q.id } },
                create: {
                  campaignId: campaign.id,
                  questId: q.id,
                  name: q.name,
                  type: q.type || 'side',
                  description: q.description || '',
                  completionCondition: q.completionCondition || null,
                  questGiverId: q.questGiverId || null,
                  turnInNpcId: q.turnInNpcId || q.questGiverId || null,
                  locationId: q.locationId || null,
                  prerequisiteQuestIds: JSON.stringify(q.prerequisiteQuestIds || []),
                  objectives: JSON.stringify(q.objectives || []),
                  reward: q.reward ? JSON.stringify(q.reward) : null,
                  status: q._status,
                  completedAt: q.completedAt ? new Date(q.completedAt) : null,
                },
                update: {
                  name: q.name,
                  type: q.type || 'side',
                  description: q.description || '',
                  objectives: JSON.stringify(q.objectives || []),
                  reward: q.reward ? JSON.stringify(q.reward) : null,
                  status: q._status,
                  completedAt: q.completedAt ? new Date(q.completedAt) : null,
                },
              });
              syncCount++;
            } catch (err) {
              console.warn(`    Quest "${q.name}" upsert failed: ${err.message}`);
            }
          } else {
            syncCount++;
          }
        }
        delete coreState.quests;
        console.log(`    quests: ${syncCount} synced, removed from blob`);
      }

      // --- Write slimmed coreState + characterState ---
      if (!DRY_RUN) {
        const updateData = { coreState: JSON.stringify(coreState) };
        if (Object.keys(characterState).length > 0) {
          updateData.characterState = JSON.stringify(characterState);
        }
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: updateData,
        });
      }
      migrated++;
    }

    offset += BATCH_SIZE;
  }

  console.log(`\nDone. Processed: ${processed}, Migrated: ${migrated}, Skipped: ${skipped}`);
  if (DRY_RUN) {
    console.log('This was a dry run. Pass --apply to write changes.');
  }
}

migrate()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
