import { useState, useRef, useCallback, useEffect } from 'react';

// ── Tunable constants ──
export const BEER_DUEL_DURATION_MS = 90_000;
const PEE_COOLDOWN_MS = 4_000;
const VOMIT_COOLDOWN_MS = 6_000;
const PEE_DELAY_MIN_MS = 1_000;
const PEE_DELAY_MAX_MS = 3_000;
const VOMIT_DELAY_MIN_MS = 5_000;
const VOMIT_DELAY_MAX_MS = 15_000;
const MAX_STAT = 10;
const RELIEF_AMOUNT = 5;
const TICK_INTERVAL_MS = 100;
const COUNTDOWN_DURATION_MS = 3_000;

// NPC AI profiles keyed by difficulty
const NPC_PROFILES = {
  easy:   { drinkMin: 2000, drinkMax: 4000, reliefThreshold: 8 },
  medium: { drinkMin: 1500, drinkMax: 3000, reliefThreshold: 7 },
  hard:   { drinkMin: 1000, drinkMax: 2000, reliefThreshold: 5 },
};

function randBetween(min, max) {
  return min + Math.random() * (max - min);
}

function createPlayer(id, name) {
  return {
    id,
    name,
    beersDrunk: 0,
    pee: 0,
    vomit: 0,
    isEliminated: false,
    peeCooldownUntil: 0,
    vomitCooldownUntil: 0,
  };
}

/**
 * Real-time beer duel minigame hook.
 *
 * @param {{ playerId: string, playerName: string, opponentId: string, opponentName: string, difficulty?: string, isMultiplayer?: boolean }} opts
 */
export function useBeerDuel({
  playerId,
  playerName,
  opponentId,
  opponentName,
  difficulty = 'medium',
  isMultiplayer = false,
}) {
  const [phase, setPhase] = useState('countdown'); // countdown | playing | finished
  const [timeRemainingMs, setTimeRemainingMs] = useState(BEER_DUEL_DURATION_MS);
  const [countdownSec, setCountdownSec] = useState(Math.ceil(COUNTDOWN_DURATION_MS / 1000));
  const [players, setPlayers] = useState(() => ({
    [playerId]: createPlayer(playerId, playerName),
    [opponentId]: createPlayer(opponentId, opponentName),
  }));
  const [winnerId, setWinnerId] = useState(null);

  const pendingTimersRef = useRef({ [playerId]: [], [opponentId]: [] });
  const npcNextDrinkRef = useRef(0);
  const gameStartRef = useRef(0);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // ── Actions ──

  const drinkBeer = useCallback((who) => {
    if (phaseRef.current !== 'playing') return;
    const now = Date.now();
    setPlayers((prev) => {
      const p = prev[who];
      if (!p || p.isEliminated) return prev;
      const peeDelay = randBetween(PEE_DELAY_MIN_MS, PEE_DELAY_MAX_MS);
      const vomitDelay = randBetween(VOMIT_DELAY_MIN_MS, VOMIT_DELAY_MAX_MS);
      pendingTimersRef.current[who].push(
        { type: 'pee', triggersAt: now + peeDelay },
        { type: 'vomit', triggersAt: now + vomitDelay },
      );
      return { ...prev, [who]: { ...p, beersDrunk: p.beersDrunk + 1 } };
    });
  }, []);

  const useRelief = useCallback((who, stat) => {
    if (phaseRef.current !== 'playing') return;
    const now = Date.now();
    setPlayers((prev) => {
      const p = prev[who];
      if (!p || p.isEliminated) return prev;
      const cdKey = stat === 'pee' ? 'peeCooldownUntil' : 'vomitCooldownUntil';
      if (now < p[cdKey]) return prev;
      const cdMs = stat === 'pee' ? PEE_COOLDOWN_MS : VOMIT_COOLDOWN_MS;
      return {
        ...prev,
        [who]: {
          ...p,
          [stat]: Math.max(0, p[stat] - RELIEF_AMOUNT),
          [cdKey]: now + cdMs,
        },
      };
    });
  }, []);

  // ── Game tick ──

  useEffect(() => {
    if (phase === 'finished') return undefined;

    if (phase === 'countdown') {
      const start = Date.now();
      const id = setInterval(() => {
        const elapsed = Date.now() - start;
        const remaining = COUNTDOWN_DURATION_MS - elapsed;
        if (remaining <= 0) {
          clearInterval(id);
          gameStartRef.current = Date.now();
          npcNextDrinkRef.current = Date.now() + randBetween(500, 1500);
          setCountdownSec(0);
          setPhase('playing');
        } else {
          setCountdownSec(Math.ceil(remaining / 1000));
        }
      }, TICK_INTERVAL_MS);
      return () => clearInterval(id);
    }

    // phase === 'playing'
    const id = setInterval(() => {
      const now = Date.now();
      const elapsed = now - gameStartRef.current;
      const remaining = Math.max(0, BEER_DUEL_DURATION_MS - elapsed);
      setTimeRemainingMs(remaining);

      setPlayers((prev) => {
        let next = { ...prev };
        let changed = false;

        for (const pid of [playerId, opponentId]) {
          const p = next[pid];
          if (p.isEliminated) continue;

          let peeInc = 0;
          let vomitInc = 0;
          const kept = [];
          for (const t of pendingTimersRef.current[pid]) {
            if (now >= t.triggersAt) {
              if (t.type === 'pee') peeInc++;
              else vomitInc++;
            } else {
              kept.push(t);
            }
          }
          pendingTimersRef.current[pid] = kept;

          if (peeInc || vomitInc) {
            const newPee = Math.min(p.pee + peeInc, MAX_STAT);
            const newVomit = Math.min(p.vomit + vomitInc, MAX_STAT);
            const eliminated = newPee >= MAX_STAT || newVomit >= MAX_STAT;
            next = {
              ...next,
              [pid]: { ...p, pee: newPee, vomit: newVomit, isEliminated: eliminated },
            };
            changed = true;
          }
        }
        return changed ? next : prev;
      });

      // NPC AI (solo only)
      if (!isMultiplayer && phaseRef.current === 'playing') {
        const profile = NPC_PROFILES[difficulty] || NPC_PROFILES.medium;

        setPlayers((prev) => {
          const npc = prev[opponentId];
          if (!npc || npc.isEliminated) return prev;

          // Relief decisions
          if (npc.pee >= profile.reliefThreshold && now >= npc.peeCooldownUntil) {
            const cdMs = PEE_COOLDOWN_MS;
            const newPee = Math.max(0, npc.pee - RELIEF_AMOUNT);
            return { ...prev, [opponentId]: { ...npc, pee: newPee, peeCooldownUntil: now + cdMs } };
          }
          if (npc.vomit >= profile.reliefThreshold && now >= npc.vomitCooldownUntil) {
            const cdMs = VOMIT_COOLDOWN_MS;
            const newVomit = Math.max(0, npc.vomit - RELIEF_AMOUNT);
            return { ...prev, [opponentId]: { ...npc, vomit: newVomit, vomitCooldownUntil: now + cdMs } };
          }

          return prev;
        });

        // NPC drinking
        if (now >= npcNextDrinkRef.current) {
          const profile2 = NPC_PROFILES[difficulty] || NPC_PROFILES.medium;
          drinkBeer(opponentId);
          npcNextDrinkRef.current = now + randBetween(profile2.drinkMin, profile2.drinkMax);
        }
      }

      // End-game check
      if (remaining <= 0) {
        setPhase('finished');
      }
    }, TICK_INTERVAL_MS);

    return () => clearInterval(id);
  }, [phase, playerId, opponentId, isMultiplayer, difficulty, drinkBeer]);

  // Determine winner when phase transitions to finished or someone is eliminated
  useEffect(() => {
    const p = players[playerId];
    const o = players[opponentId];

    if (phase === 'playing') {
      // Mid-game elimination check
      if (p.isEliminated && !o.isEliminated) {
        setWinnerId(opponentId);
        setPhase('finished');
      } else if (o.isEliminated && !p.isEliminated) {
        setWinnerId(playerId);
        setPhase('finished');
      } else if (p.isEliminated && o.isEliminated) {
        setWinnerId(null); // draw
        setPhase('finished');
      }
    } else if (phase === 'finished' && winnerId === null) {
      if (p.isEliminated && !o.isEliminated) setWinnerId(opponentId);
      else if (o.isEliminated && !p.isEliminated) setWinnerId(playerId);
      else if (p.beersDrunk > o.beersDrunk) setWinnerId(playerId);
      else if (o.beersDrunk > p.beersDrunk) setWinnerId(opponentId);
      // else: tie → winnerId stays null
    }
  }, [phase, players, playerId, opponentId, winnerId]);

  return {
    phase,
    countdownSec,
    timeRemainingMs,
    player: players[playerId],
    opponent: players[opponentId],
    winnerId,
    drinkBeer: useCallback(() => drinkBeer(playerId), [drinkBeer, playerId]),
    useRelief: useCallback((stat) => useRelief(playerId, stat), [useRelief, playerId]),
    // MP: apply remote opponent actions
    opponentDrink: useCallback(() => drinkBeer(opponentId), [drinkBeer, opponentId]),
    opponentRelief: useCallback((stat) => useRelief(opponentId, stat), [useRelief, opponentId]),
    constants: { MAX_STAT, PEE_COOLDOWN_MS, VOMIT_COOLDOWN_MS, RELIEF_AMOUNT },
  };
}
