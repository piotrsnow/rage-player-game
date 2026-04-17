import { prisma } from '../../lib/prisma.js';
import { childLogger } from '../../lib/logger.js';
import { config } from '../../config.js';
import { requireServerApiKey } from '../apiKeyService.js';
import { selectBestiaryEncounter } from '../../data/equipment/index.js';

const log = childLogger({ module: 'sceneGenerator' });

/**
 * Try to find which NPC the player is attacking (for disposition guard).
 * Simple name extraction from action text.
 */
async function findCombatTargetNpc(playerAction, dbNpcs) {
  if (!playerAction || !dbNpcs?.length) return null;
  const actionLower = playerAction.toLowerCase();
  for (const npc of dbNpcs) {
    if (npc.alive === false) continue;
    if (actionLower.includes(npc.name.toLowerCase())) return npc;
  }
  return null;
}

/**
 * Generate a short narrative (2-3 sentences) using a standard/nano model.
 * Used for combat fast-path and disposition warnings. Falls back to the raw
 * instruction on any AI failure so the caller still has displayable text.
 */
async function generateShortNarrative(instruction, playerAction, provider = 'openai') {
  let apiKey;
  try {
    apiKey = requireServerApiKey(provider === 'anthropic' ? 'anthropic' : 'openai');
  } catch { return instruction; }

  try {
    if (provider === 'anthropic') {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: config.aiModels.standard.anthropic,
          max_tokens: 200,
          messages: [{ role: 'user', content: `${instruction}\n\nAkcja gracza: "${playerAction}"\n\nOdpowiedz TYLKO narracją, bez JSON.` }],
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        return data.content?.[0]?.text || instruction;
      }
    } else {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: config.aiModels.standard.openai,
          messages: [{ role: 'user', content: `${instruction}\n\nAkcja gracza: "${playerAction}"\n\nOdpowiedz TYLKO narracją, bez JSON.` }],
          max_tokens: 200,
          temperature: 0.8,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        return data.choices?.[0]?.message?.content || instruction;
      }
    }
  } catch (err) {
    log.warn({ err }, 'generateShortNarrative failed');
  }
  return instruction;
}

/**
 * Trade shortcut — skip scene generation for pure trade intent.
 * Returns { handled: true, result } if the shortcut matched, or { handled: false }
 * to fall through to the normal pipeline.
 */
export function tryTradeShortcut(intentResult, coreState, dbNpcs) {
  if (!intentResult._tradeOnly) return { handled: false };

  const npcHint = intentResult._npcHint;
  let matchedNpc = null;
  if (npcHint) {
    const hintLower = npcHint.toLowerCase();
    matchedNpc = dbNpcs.find(n =>
      n.alive !== false && n.name?.toLowerCase().includes(hintLower)
    );
  }
  if (!matchedNpc) {
    const currentLoc = coreState.world?.currentLocation;
    matchedNpc = dbNpcs.find(n =>
      n.alive !== false && (!currentLoc || n.lastLocation === currentLoc)
    ) || dbNpcs.find(n => n.alive !== false);
  }

  if (!matchedNpc) return { handled: false };

  return {
    handled: true,
    result: {
      narrative: '',
      stateChanges: {
        startTrade: { npcName: matchedNpc.name },
      },
      actions: [],
      _tradeShortcut: true,
    },
  };
}

/**
 * Combat fast-path — skip the large model for clear combat intent.
 * Handles the disposition guard (friendly NPC being attacked) and the
 * bestiary-selected enemy encounter. Returns { handled, result } just like
 * tryTradeShortcut.
 */
export async function tryCombatFastPath(intentResult, playerAction, dbNpcs, provider) {
  if (!intentResult.clear_combat || !intentResult.combat_enemies) {
    return { handled: false };
  }

  // Disposition guard: check if target is a friendly NPC
  const targetNpc = await findCombatTargetNpc(playerAction, dbNpcs);
  if (targetNpc && targetNpc.disposition > 0) {
    const newDisposition = Math.max(-100, targetNpc.disposition - 30);
    await prisma.campaignNPC.update({
      where: { id: targetNpc.id },
      data: { disposition: newDisposition },
    });
    const warningNarrative = await generateShortNarrative(
      `NPC "${targetNpc.name}" (${targetNpc.role || 'osoba'}) jest zaskoczony/a agresją gracza. Disposition spadło. NPC reaguje z niedowierzaniem i ostrzega gracza.`,
      playerAction, provider,
    );
    return {
      handled: true,
      intent: 'disposition_warning',
      result: {
        narrative: warningNarrative,
        stateChanges: {
          npcs: [{ action: 'update', name: targetNpc.name, dispositionChange: -30 }],
        },
        actions: [],
        scenePacing: 'tension',
        _combatDispositionGuard: true,
      },
    };
  }

  // Select enemies from bestiary
  const enemies = selectBestiaryEncounter(intentResult.combat_enemies);
  const filledEnemies = enemies.map(e => ({
    name: e.name,
    attributes: e.attributes,
    wounds: e.maxWounds,
    maxWounds: e.maxWounds,
    skills: e.skills,
    traits: e.traits,
    armourDR: e.armourDR,
    weapons: e.weapons,
  }));

  if (filledEnemies.length === 0) return { handled: false };

  const enemyNames = filledEnemies.map(e => e.name).join(', ');
  const combatNarrative = await generateShortNarrative(
    `Gracz rozpoczyna walkę. Przeciwnicy: ${enemyNames}. Napisz krótki opis rozpoczęcia walki (2-3 zdania, po polsku, styl RPG).`,
    playerAction, provider,
  );
  return {
    handled: true,
    intent: 'clear_combat',
    result: {
      narrative: combatNarrative,
      stateChanges: {
        combatUpdate: { active: true, enemies: filledEnemies, reason: playerAction },
      },
      actions: [],
      scenePacing: 'combat',
      _combatFastPath: true,
    },
  };
}
