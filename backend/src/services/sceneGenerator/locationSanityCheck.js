/**
 * Detect suspicious location changes emitted by the LLM. The premium model
 * sometimes flips location (e.g. teleports the party back to a tavern they
 * left two scenes ago) without any movement cue in the player action. This
 * heuristic scores three signals and returns a verdict the caller uses to
 * decide whether to retry the scene with an explicit corrective hint.
 *
 * Scoring:
 *   - +2 location changed but no movement vocabulary in player action
 *   - +3 A → B → A flip (current emit equals scene N-2 and scene N-1 differs)
 *   - bypass to 0 if intentResult signals an explicit travel intent
 *
 * Caller convention: score >= 3 → retry; score == 2 → log only; < 2 → pass.
 */

const PL_MOVE = /\b(id[ęeę]|idziemy|wracam|wracamy|wychodz|wchodz|biegn|jad[eęą]|teleport|przenosz|udaj.*si[ęe]|ruszam|wyrusz|opuszcz|p[óo]jd[ęe]|p[óo]jdziemy|chodzimy|kieruj.*si[ęe])/i;
const EN_MOVE = /\b(go|going|walk|walking|return|returning|leave|leaving|enter|entering|run|running|travel|traveling|teleport|move|moving|head\s+to|head\s+toward|set\s+out|depart|departing)\b/i;

function hasMovementCue(playerAction) {
  if (!playerAction || typeof playerAction !== 'string') return false;
  return PL_MOVE.test(playerAction) || EN_MOVE.test(playerAction);
}

function normalizeLocName(name) {
  if (!name || typeof name !== 'string') return null;
  return name.trim().toLowerCase();
}

/**
 * Check whether the proposed destination is reachable from the current location
 * via the location graph (movement edges). Returns `{ reachable, path }`.
 * If not reachable, logs a warning but does NOT block the change (preserves
 * existing behavior). Flags potential teleport for the graph extractor.
 *
 * @param {object} args
 * @param {string} args.fromKind  Current location kind
 * @param {string} args.fromId    Current location ID
 * @param {string} args.toKind    Proposed destination kind
 * @param {string} args.toId      Proposed destination ID
 * @param {string} args.campaignId
 * @returns {Promise<{reachable:boolean, teleportWarning:boolean}>}
 */
export async function checkGraphReachability({ fromKind, fromId, toKind, toId, campaignId }) {
  if (!fromKind || !fromId || !toKind || !toId) return { reachable: true, teleportWarning: false };
  if (fromKind === toKind && fromId === toId) return { reachable: true, teleportWarning: false };

  try {
    const { prisma } = await import('../../lib/prisma.js');
    const edges = await prisma.locationEdge.findMany({
      where: {
        isActive: true,
        category: 'movement',
        OR: [{ campaignId: null }, { campaignId }],
      },
      select: { fromKind: true, fromId: true, toKind: true, toId: true, bidirectional: true },
    });

    const startKey = `${fromKind}:${fromId}`;
    const endKey = `${toKind}:${toId}`;

    // BFS on movement edges
    const adj = new Map();
    for (const e of edges) {
      const fk = `${e.fromKind}:${e.fromId}`;
      const tk = `${e.toKind}:${e.toId}`;
      if (!adj.has(fk)) adj.set(fk, []);
      adj.get(fk).push(tk);
      if (e.bidirectional) {
        if (!adj.has(tk)) adj.set(tk, []);
        adj.get(tk).push(fk);
      }
    }

    const visited = new Set([startKey]);
    const queue = [startKey];
    while (queue.length > 0) {
      const cur = queue.shift();
      if (cur === endKey) return { reachable: true, teleportWarning: false };
      for (const neighbor of (adj.get(cur) || [])) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    return { reachable: false, teleportWarning: true };
  } catch {
    return { reachable: true, teleportWarning: false };
  }
}

/**
 * @param {object} args
 * @param {string} args.playerAction        Raw player action text.
 * @param {object} args.sceneResult         Scene object returned by the LLM.
 * @param {string|null} args.prevLocName    Location name BEFORE this scene ran.
 * @param {Array<{idx:number, loc:string|null}>} args.recentTrail  Chronological trail (oldest→newest), latest entry = scene N-1.
 * @param {object|null} args.intentResult   Intent classifier result; bypass when travel.
 * @returns {{score:number, signals:string[], suspect:{from:string|null,to:string|null}}}
 */
export function detectSuspiciousLocationChange({ playerAction, sceneResult, prevLocName, recentTrail = [], intentResult = null } = {}) {
  const aiLoc = sceneResult?.stateChanges?.currentLocation ?? null;
  const verdict = { score: 0, signals: [], suspect: { from: prevLocName ?? null, to: aiLoc } };

  if (!aiLoc) return verdict; // No change emitted — nothing to validate.
  if (normalizeLocName(aiLoc) === normalizeLocName(prevLocName)) return verdict; // No-op emit.

  // Bypass — player explicitly travels. Trust intent classifier.
  if (intentResult?._intent === 'travel' || intentResult?._travelTarget) {
    return verdict;
  }

  // Signal A: change without movement vocabulary in player action.
  if (!hasMovementCue(playerAction)) {
    verdict.score += 2;
    verdict.signals.push('no_movement_cue');
  }

  // Signal B: A → B → A flip. recentTrail is chronological (oldest→newest);
  // the LATEST entry is scene N-1 (the prior scene); the one before it is N-2.
  // The current scene is being generated NOW so it is NOT in recentTrail yet.
  // Flip pattern means N-1 is some other location AND N-2 equals the new emit.
  if (recentTrail.length >= 2) {
    const nMinus1 = recentTrail[recentTrail.length - 1];
    const nMinus2 = recentTrail[recentTrail.length - 2];
    const aiLocN = normalizeLocName(aiLoc);
    if (
      nMinus1 && nMinus2
      && nMinus1.loc && nMinus2.loc
      && normalizeLocName(nMinus1.loc) !== aiLocN
      && normalizeLocName(nMinus2.loc) === aiLocN
    ) {
      verdict.score += 3;
      verdict.signals.push('flip_pattern');
    }
  }

  return verdict;
}
