import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { loadUserApiKeys } from '../../services/apiKeyService.js';
import { analyzeSpellInvention } from '../../services/spellInventionAnalyzer.js';
import { getCampaignCharacterIds } from '../../services/campaignSync.js';
import { loadCharacterSnapshotById, persistCharacterSnapshot } from '../../services/characterRelations.js';
import { applyCharacterStateChanges } from '../../services/characterMutations.js';
import { processStateChanges } from '../../services/sceneGenerator/processStateChanges/index.js';

const log = childLogger({ module: 'inventSpell' });

const INVENT_SPELL_PARAMS = {
  type: 'object',
  properties: {
    campaignId: { type: 'string', format: 'uuid' },
  },
  required: ['campaignId'],
};

const INVENT_SPELL_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['intent', 'successRoll', 'powerRoll'],
  properties: {
    intent: { type: 'string', minLength: 10, maxLength: 500 },
    successRoll: { type: 'integer', minimum: 1, maximum: 50 },
    powerRoll: { type: 'integer', minimum: 1, maximum: 50 },
    characterId: { type: 'string', format: 'uuid' },
  },
};

const STARTER_SPELLS = [
  { name: 'Iskra', school: 'Ogien', source: 'starter', summary: 'Podstawowe zaklęcie ognia.' },
  { name: 'Piorun', school: 'Blyskawice', source: 'starter', summary: 'Podstawowe zaklęcie błyskawic.' },
  { name: 'Ochrona', school: 'Ochrona', source: 'starter', summary: 'Krótka osłona ochronna.' },
  { name: 'Niewidzialnosc', school: 'Niewidzialnosc', source: 'starter', summary: 'Krótkie ukrycie postaci.' },
  { name: 'Lodowy Dotyk', school: 'Lod', source: 'starter', summary: 'Dotyk mrozu spowalniający cel.' },
  { name: 'Leczenie Ran', school: 'Leczenie', source: 'starter', summary: 'Leczy lekkie obrażenia.' },
  { name: 'Telekineza', school: 'Przestrzen', source: 'starter', summary: 'Przesuwanie obiektów siłą woli.' },
  { name: 'Strach', school: 'Umysl', source: 'starter', summary: 'Wzbudza lęk u celu.' },
  { name: 'Wykrycie Magii', school: 'Wiatr i percepcja', source: 'starter', summary: 'Wyczucie aktywnej magii.' },
];

function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function normalizeSpellName(name) {
  return String(name || '').trim().toLowerCase();
}

function powerTierFromRoll(powerRoll) {
  if (powerRoll <= 15) return 'cantrip';
  if (powerRoll <= 30) return 'standard';
  if (powerRoll <= 45) return 'strong';
  return 'legendary';
}

function manaCostFromPowerTier(powerTier) {
  if (powerTier === 'cantrip') return 1;
  if (powerTier === 'legendary') return 5;
  if (powerTier === 'strong') return 4;
  return 2;
}

function mapCodexToSpellCandidate(entry) {
  const fragments = Array.isArray(entry.fragments) ? entry.fragments : [];
  const firstFragment = fragments[0] && typeof fragments[0] === 'object' ? fragments[0] : null;
  const schoolTag = Array.isArray(entry.tags)
    ? entry.tags.find((tag) => typeof tag === 'string' && tag !== 'spell' && tag !== 'custom')
    : null;

  return {
    name: entry.name,
    school: schoolTag || null,
    source: 'codex',
    summary: firstFragment?.content || null,
    tags: Array.isArray(entry.tags) ? entry.tags : [],
  };
}

function dedupeCandidates(candidates) {
  const byName = new Map();
  for (const candidate of candidates) {
    const key = normalizeSpellName(candidate?.name);
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, candidate);
  }
  return Array.from(byName.values());
}

function isKnownSpell(character, spellName) {
  const known = Array.isArray(character?.spells?.known) ? character.spells.known : [];
  const target = normalizeSpellName(spellName);
  return known.some((name) => normalizeSpellName(name) === target);
}

async function resolveUniqueCodexKey(campaignId, spellName, description) {
  const base = slugify(spellName) || `spell-${Date.now()}`;
  let key = `spell-${base}`;
  let suffix = 2;

  while (true) {
    const existing = await prisma.campaignCodex.findUnique({
      where: { campaignId_codexKey: { campaignId, codexKey: key } },
      select: { fragments: true },
    });
    if (!existing) return key;

    const existingContent = Array.isArray(existing.fragments)
      ? existing.fragments.map((f) => (typeof f?.content === 'string' ? f.content : '')).join(' ').trim()
      : '';
    if (existingContent === description.trim()) return key;

    key = `spell-${base}-mk${suffix}`;
    suffix += 1;
  }
}

function buildSpellCard({ spellName, school, manaCost, description, effect, icon }) {
  return {
    name: spellName,
    school: school || 'Ogolna',
    manaCost,
    description,
    effect,
    ...(icon ? { icon } : {}),
  };
}

export async function inventSpellRoutes(fastify) {
  fastify.post(
    '/campaigns/:campaignId/invent-spell',
    {
      schema: { params: INVENT_SPELL_PARAMS, body: INVENT_SPELL_BODY },
      config: { rateLimit: { max: 3, timeWindow: '5 minutes' } },
    },
    async (request, reply) => {
      const { campaignId } = request.params;
      const { intent, successRoll, powerRoll, characterId: requestedCharacterId } = request.body;
      const userId = request.user.id;

      const campaign = await prisma.campaign.findFirst({
        where: { id: campaignId, userId },
        select: {
          id: true,
          coreState: true,
          currentLocationName: true,
          currentLocationId: true,
        },
      });
      if (!campaign) {
        return reply.code(404).send({ error: 'Campaign not found' });
      }

      const recentScenes = await prisma.campaignScene.findMany({
        where: { campaignId },
        orderBy: { sceneIndex: 'desc' },
        take: 5,
        select: {
          sceneIndex: true,
          narrative: true,
          chosenAction: true,
        },
      });
      recentScenes.reverse();

      const codexSpells = await prisma.campaignCodex.findMany({
        where: { campaignId, tags: { array_contains: 'spell' } },
        select: {
          codexKey: true,
          name: true,
          tags: true,
          fragments: true,
        },
      });
      const spellCandidates = dedupeCandidates([
        ...STARTER_SPELLS,
        ...codexSpells.map(mapCodexToSpellCandidate),
      ]);

      const characterIds = await getCampaignCharacterIds(campaignId);
      let activeCharacterId = characterIds[0] || null;
      if (requestedCharacterId) {
        if (!characterIds.includes(requestedCharacterId)) {
          return reply.code(400).send({ error: 'Character does not belong to this campaign' });
        }
        activeCharacterId = requestedCharacterId;
      }
      if (!activeCharacterId) {
        return reply.code(400).send({ error: 'No active character in campaign' });
      }

      const activeCharacter = await loadCharacterSnapshotById(activeCharacterId);
      if (!activeCharacter) {
        return reply.code(404).send({ error: 'Character not found' });
      }

      const userApiKeys = await loadUserApiKeys(prisma, userId);

      let analyzed;
      try {
        analyzed = await analyzeSpellInvention({
          intent: intent.trim(),
          successRoll,
          powerRoll,
          character: activeCharacter,
          recentScenes,
          candidateSpells: spellCandidates,
          userApiKeys,
          userId,
        });
      } catch (err) {
        const status = err.statusCode || 502;
        return reply.code(status).send({ error: err.message, code: err.code || 'AI_REQUEST_FAILED' });
      }

      const success = analyzed.outcome === 'success_existing' || analyzed.outcome === 'success_new';
      const fallbackPowerTier = powerTierFromRoll(powerRoll);
      const powerTier = analyzed.powerTier || fallbackPowerTier;

      if (!success) {
        return {
          outcome: analyzed.outcome,
          threshold: analyzed.threshold,
          sum: analyzed.sum,
          favorability: analyzed.favorability,
          intelligence: analyzed.intelligence,
          luck: analyzed.luck,
          hasTeacher: analyzed.hasTeacher,
          successRoll,
          powerRoll,
          powerTier,
          luckRoll: analyzed.luckRoll,
          luckySuccess: analyzed.luckySuccess,
          luckAttribute: analyzed.luckAttribute,
          spell: null,
          isNew: false,
          verdict: analyzed.verdict,
          narrativeComment: analyzed.narrativeComment,
        };
      }

      let chosenSpellName = analyzed.existingSpellName;
      let isNew = analyzed.outcome === 'success_new';
      let spellCard = null;
      let codexUpdates = null;

      if (isNew) {
        const invented = analyzed.inventedSpell;
        if (!invented?.name) {
          return reply.code(502).send({
            error: 'AI returned incomplete invented spell data',
            code: 'AI_PARSE_FAILED',
          });
        }

        chosenSpellName = invented.name;
        const manaCost = invented.manaCost || manaCostFromPowerTier(powerTier);
        spellCard = buildSpellCard({
          spellName: invented.name,
          school: invented.school,
          manaCost,
          description: invented.description,
          effect: invented.effect,
          icon: analyzed.spellIcon,
        });

        const codexKey = await resolveUniqueCodexKey(campaignId, invented.name, spellCard.effect || spellCard.description);
        codexUpdates = [{
          id: codexKey,
          name: invented.name,
          category: 'concept',
          tags: ['spell', 'custom', spellCard.school || 'Ogolna'],
          fragment: {
            content: spellCard.effect || spellCard.description,
            source: analyzed.hasTeacher ? 'Nauka od nauczyciela' : 'Inwencja własna',
            aspect: 'description',
          },
        }];
      } else {
        const existing = spellCandidates.find((candidate) => normalizeSpellName(candidate.name) === normalizeSpellName(chosenSpellName));
        if (!existing) {
          return reply.code(409).send({
            error: 'Chosen existing spell is not in candidate pool',
            code: 'SPELL_NOT_FOUND',
          });
        }
        spellCard = buildSpellCard({
          spellName: existing.name,
          school: existing.school,
          manaCost: manaCostFromPowerTier(powerTier),
          description: existing.summary || 'Znane zaklęcie opanowane podczas badań magicznych.',
          effect: existing.summary || 'Znane zaklęcie opanowane podczas badań magicznych.',
          icon: analyzed.spellIcon,
        });
      }

      if (!chosenSpellName) {
        return reply.code(502).send({ error: 'AI did not provide spell name', code: 'AI_PARSE_FAILED' });
      }

      if (isKnownSpell(activeCharacter, chosenSpellName)) {
        return reply.code(409).send({
          outcome: 'fail_circumstances',
          threshold: analyzed.threshold,
          sum: analyzed.sum,
          favorability: analyzed.favorability,
          intelligence: analyzed.intelligence,
          luck: analyzed.luck,
          hasTeacher: analyzed.hasTeacher,
          successRoll,
          powerRoll,
          powerTier,
          luckRoll: analyzed.luckRoll,
          luckySuccess: analyzed.luckySuccess,
          luckAttribute: analyzed.luckAttribute,
          spell: null,
          isNew: false,
          verdict: `To zaklęcie jest już ci znane: ${chosenSpellName}. Spróbuj wymyślić inną formułę.`,
          narrativeComment: analyzed.narrativeComment,
          code: 'SPELL_ALREADY_KNOWN',
        });
      }

      let customSpellId = null;

      if (isNew) {
        try {
          const row = await prisma.customSpell.upsert({
            where: { name: chosenSpellName },
            create: {
              name: chosenSpellName,
              school: spellCard.school || null,
              description: spellCard.description || null,
              icon: spellCard.icon || null,
              manaCost: spellCard.manaCost || 2,
              createdById: userId,
              globallyActive: true,
              originCampaignId: campaignId,
            },
            update: {},
            select: { id: true },
          });
          customSpellId = row.id;
        } catch (err) {
          log.warn({ err: err?.message, campaignId, spell: chosenSpellName }, 'CustomSpell upsert failed — falling back to known[]');
        }
      } else {
        const existing = await prisma.customSpell.findUnique({
          where: { name: chosenSpellName },
          select: { id: true },
        }).catch(() => null);
        if (existing) customSpellId = existing.id;
      }

      const stateChanges = {
        learnSpell: chosenSpellName,
        ...(analyzed.spellIcon ? { learnSpellIcon: analyzed.spellIcon } : {}),
        ...(spellCard?.school ? { learnSpellSchool: spellCard.school } : {}),
      };
      const updatedCharacter = applyCharacterStateChanges(activeCharacter, stateChanges);

      try {
        await prisma.$transaction(async (tx) => {
          await persistCharacterSnapshot(activeCharacterId, updatedCharacter, tx);
        });
      } catch (err) {
        log.error({ err: err?.message, campaignId, activeCharacterId }, 'Failed to persist invented spell character changes');
        return reply.code(502).send({
          error: 'Failed to save invented spell',
          code: 'SPELL_APPLY_FAILED',
        });
      }

      if (isNew && codexUpdates) {
        try {
          const currentRef = campaign.currentLocationId
            ? { id: campaign.currentLocationId, name: campaign.currentLocationName }
            : null;
          await processStateChanges(campaignId, { codexUpdates }, {
            prevLoc: campaign.currentLocationName || null,
            sceneIndex: recentScenes[recentScenes.length - 1]?.sceneIndex || 0,
            currentRef,
          });
        } catch (err) {
          log.warn({ err: err?.message, campaignId }, 'processStateChanges for codexUpdates failed (non-fatal)');
        }
      }

      return {
        outcome: analyzed.outcome,
        threshold: analyzed.threshold,
        sum: analyzed.sum,
        favorability: analyzed.favorability,
        intelligence: analyzed.intelligence,
        luck: analyzed.luck,
        hasTeacher: analyzed.hasTeacher,
        successRoll,
        powerRoll,
        powerTier,
        luckRoll: analyzed.luckRoll,
        luckySuccess: analyzed.luckySuccess,
        luckAttribute: analyzed.luckAttribute,
        spell: spellCard,
        customSpellId: customSpellId || null,
        isNew,
        verdict: analyzed.verdict,
        narrativeComment: analyzed.narrativeComment,
      };
    },
  );
}
