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
 *   - +3 exit vocabulary + model re-emitted the current location (exit_reanchor)
 *   - +3 exit vocabulary + emitted loc name follows "z " in player text (exit_as_destination)
 *   - bypass to 0 if intentResult signals an explicit travel intent
 *
 * Caller convention: score >= 3 → retry; score == 2 → log only; < 2 → pass.
 */

const PL_MOVE = /\b(id[ęeę]|idziemy|wracam|wracamy|wychodz|wchodz|biegn|jad[eęą]|teleport|przenosz|udaj.*si[ęe]|ruszam|wyrusz|opuszcz|p[óo]jd[ęe]|p[óo]jdziemy|chodzimy|kieruj.*si[ęe])/i;
const EN_MOVE = /\b(go|going|walk|walking|return|returning|leave|leaving|enter|entering|run|running|travel|traveling|teleport|move|moving|head\s+to|head\s+toward|set\s+out|depart|departing)\b/i;
const PL_EXIT = /(?:wychodz|opuszcz|uciekam\s+z|wracam\s+z|wydostaj)/i;

function hasMovementCue(playerAction) {
  if (!playerAction || typeof playerAction !== 'string') return false;
  return PL_MOVE.test(playerAction) || EN_MOVE.test(playerAction);
}

export function hasExitCue(playerAction) {
  if (!playerAction || typeof playerAction !== 'string') return false;
  return PL_EXIT.test(playerAction);
}

function normalizeLocName(name) {
  if (!name || typeof name !== 'string') return null;
  return name.trim().toLowerCase();
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

  const sameAsPrev = normalizeLocName(aiLoc) === normalizeLocName(prevLocName);

  // Signal C: exit vocabulary present + model re-emitted the SAME location
  // the player is trying to leave. This is not a harmless no-op — the player
  // wanted to depart and the model anchored them back.
  if (sameAsPrev && hasExitCue(playerAction)) {
    verdict.score += 3;
    verdict.signals.push('exit_reanchor');
    return verdict;
  }

  if (sameAsPrev) return verdict; // Genuine no-op emit.

  // Bypass — player explicitly travels. Trust intent classifier.
  if (intentResult?._intent === 'travel' || intentResult?._travelTarget) {
    return verdict;
  }

  // Signal D: exit vocabulary + emitted location name appears after "z " in
  // the player action. Model confused source for destination — e.g. player
  // says "wychodząc z piwnicy", model emits currentLocation: "Piwnica".
  // Polish declension changes word endings (Piwnica→piwnicy, Karczma→karczmy)
  // so we prefix-match: drop last 2 chars of the first word of the location
  // name and check if any word following "z " starts with that stem.
  if (hasExitCue(playerAction)) {
    const exitedName = normalizeLocName(aiLoc);
    if (exitedName && exitedName.length >= 4) {
      const actionLower = playerAction.toLowerCase();
      const zWords = [...actionLower.matchAll(/\bz\s+(\S+)/g)].map((m) => m[1]);
      if (zWords.length) {
        const firstWord = exitedName.split(/\s+/)[0];
        const prefixLen = Math.max(3, firstWord.length - 2);
        const stem = firstWord.slice(0, prefixLen);
        if (zWords.some((w) => w.startsWith(stem))) {
          verdict.score += 3;
          verdict.signals.push('exit_as_destination');
        }
      }
    }
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
  // Skip when the player has explicit movement vocabulary — returning to a
  // parent location from a sublocation (e.g. "wracam do świątyni") is a valid
  // A→B→A transition, not a hallucinated teleport.
  if (!hasMovementCue(playerAction) && recentTrail.length >= 2) {
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
