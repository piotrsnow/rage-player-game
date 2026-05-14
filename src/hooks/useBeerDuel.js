import { useState, useRef, useCallback, useEffect } from 'react';

// ── Tunable constants ──
export const BEER_DUEL_DURATION_MS = 90_000;
const PEE_COOLDOWN_MS = 4_000;
const VOMIT_COOLDOWN_MS = 6_000;

const MAX_PEE = 100;
const MAX_VOMIT = 50;
const PEE_RELIEF_AMOUNT = 15;
const VOMIT_RELIEF_AMOUNT = 10;

const PEE_DRAIN_FAST_MS = 50;
const PEE_DRAIN_SLOW_MS = 280;
const PEE_DRAIN_AMT = 1;
const PEE_PRESSURE_CAP = 30;

const VOMIT_DRAIN_FAST_MS = 80;
const VOMIT_DRAIN_SLOW_MS = 420;
const VOMIT_DRAIN_AMT = 1;
const VOMIT_PRESSURE_CAP = 20;

const VOMIT_PER_BEER = 5;
const PEE_BASE_PER_BEER = 10;

const TICK_INTERVAL_MS = 100;
const COUNTDOWN_DURATION_MS = 3_000;

const NPC_PROFILES = {
  easy:   { drinkMin: 2000, drinkMax: 4000, reliefPct: 0.80 },
  medium: { drinkMin: 1500, drinkMax: 3000, reliefPct: 0.70 },
  hard:   { drinkMin: 1000, drinkMax: 2000, reliefPct: 0.50 },
};

function randBetween(min, max) {
  return min + Math.random() * (max - min);
}

function drainInterval(pending, pressureCap, fastMs, slowMs) {
  const t = Math.min(pending, pressureCap) / pressureCap;
  const base = slowMs + (fastMs - slowMs) * t;
  return base * (0.85 + Math.random() * 0.3);
}

function createPlayer(id, name) {
  return {
    id,
    name,
    beerPoints: 0,
    pee: 0,
    vomit: 0,
    peePending: 0,
    vomitPending: 0,
    isEliminated: false,
    peeCooldownUntil: 0,
    vomitCooldownUntil: 0,
  };
}

/**
 * Real-time beer duel minigame hook.
 *
 * Each drink click adds 1 beerPoint (= 0.1 L), queues pending pee/vomit
 * that drains into the actual stat over randomized intervals.
 * Elimination at MAX_PEE (100) or MAX_VOMIT (50).
 */
export function useBeerDuel({
  playerId,
  playerName,
  opponentId,
  opponentName,
  difficulty = 'medium',
  isMultiplayer = false,
  playSfx = () => {},
}) {
  const [phase, setPhase] = useState('countdown');
  const [timeRemainingMs, setTimeRemainingMs] = useState(BEER_DUEL_DURATION_MS);
  const [countdownSec, setCountdownSec] = useState(Math.ceil(COUNTDOWN_DURATION_MS / 1000));
  const [players, setPlayers] = useState(() => ({
    [playerId]: createPlayer(playerId, playerName),
    [opponentId]: createPlayer(opponentId, opponentName),
  }));
  const [winnerId, setWinnerId] = useState(null);

  const drainScheduleRef = useRef({
    [playerId]: { nextPeeDrain: 0, nextVomitDrain: 0 },
    [opponentId]: { nextPeeDrain: 0, nextVomitDrain: 0 },
  });
  const npcNextDrinkRef = useRef(0);
  const gameStartRef = useRef(0);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const lastSfxTimeRef = useRef({ drip: 0, splat: 0 });
  const dangerFiredRef = useRef({ [playerId]: false, [opponentId]: false });
  const prevCountdownSecRef = useRef(null);

  // ── Actions ──

  const drinkBeer = useCallback((who) => {
    if (phaseRef.current !== 'playing') return;
    setPlayers((prev) => {
      const p = prev[who];
      if (!p || p.isEliminated) return prev;
      const beerNumber = p.beerPoints + 1;
      return {
        ...prev,
        [who]: {
          ...p,
          beerPoints: p.beerPoints + 1,
          peePending: p.peePending + PEE_BASE_PER_BEER + beerNumber,
          vomitPending: p.vomitPending + VOMIT_PER_BEER,
        },
      };
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
      const reliefAmt = stat === 'pee' ? PEE_RELIEF_AMOUNT : VOMIT_RELIEF_AMOUNT;
      return {
        ...prev,
        [who]: {
          ...p,
          [stat]: Math.max(0, p[stat] - reliefAmt),
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
      prevCountdownSecRef.current = Math.ceil(COUNTDOWN_DURATION_MS / 1000);
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
          const sec = Math.ceil(remaining / 1000);
          if (sec !== prevCountdownSecRef.current) {
            prevCountdownSecRef.current = sec;
            if (sec === 1) {
              playSfx('countdownLast');
            } else {
              playSfx('countdown');
            }
          }
          setCountdownSec(sec);
        }
      }, TICK_INTERVAL_MS);
      return () => clearInterval(id);
    }

    // phase === 'playing'
    const SFX_THROTTLE_MS = 120;
    const id = setInterval(() => {
      const now = Date.now();
      const elapsed = now - gameStartRef.current;
      const remaining = Math.max(0, BEER_DUEL_DURATION_MS - elapsed);
      setTimeRemainingMs(remaining);

      setPlayers((prev) => {
        let next = { ...prev };
        let anyChanged = false;
        let sfxDrip = false;
        let sfxSplat = false;
        let sfxDanger = false;
        let sfxEliminated = false;

        for (const pid of [playerId, opponentId]) {
          const p = next[pid];
          if (p.isEliminated) continue;
          const sched = drainScheduleRef.current[pid];

          let newPee = p.pee;
          let newVomit = p.vomit;
          let newPeePending = p.peePending;
          let newVomitPending = p.vomitPending;
          let playerChanged = false;

          if (newPeePending > 0 && now >= sched.nextPeeDrain) {
            newPee = Math.min(newPee + PEE_DRAIN_AMT, MAX_PEE);
            newPeePending -= PEE_DRAIN_AMT;
            sched.nextPeeDrain = now + drainInterval(newPeePending, PEE_PRESSURE_CAP, PEE_DRAIN_FAST_MS, PEE_DRAIN_SLOW_MS);
            playerChanged = true;
            sfxDrip = true;
          }

          if (newVomitPending > 0 && now >= sched.nextVomitDrain) {
            newVomit = Math.min(newVomit + VOMIT_DRAIN_AMT, MAX_VOMIT);
            newVomitPending -= VOMIT_DRAIN_AMT;
            sched.nextVomitDrain = now + drainInterval(newVomitPending, VOMIT_PRESSURE_CAP, VOMIT_DRAIN_FAST_MS, VOMIT_DRAIN_SLOW_MS);
            playerChanged = true;
            sfxSplat = true;
          }

          if (playerChanged) {
            const eliminated = newPee >= MAX_PEE || newVomit >= MAX_VOMIT;
            if (eliminated) sfxEliminated = true;

            const wasDanger = dangerFiredRef.current[pid];
            const isDanger = (newPee / MAX_PEE >= 0.8) || (newVomit / MAX_VOMIT >= 0.8);
            if (isDanger && !wasDanger) {
              sfxDanger = true;
              dangerFiredRef.current[pid] = true;
            }

            next = {
              ...next,
              [pid]: {
                ...p,
                pee: newPee,
                vomit: newVomit,
                peePending: newPeePending,
                vomitPending: newVomitPending,
                isEliminated: eliminated,
              },
            };
            anyChanged = true;
          }
        }

        if (sfxEliminated) {
          playSfx('eliminated');
        } else if (sfxDanger) {
          playSfx('danger');
        } else {
          if (sfxDrip && now - lastSfxTimeRef.current.drip >= SFX_THROTTLE_MS) {
            playSfx('drip');
            lastSfxTimeRef.current.drip = now;
          }
          if (sfxSplat && now - lastSfxTimeRef.current.splat >= SFX_THROTTLE_MS) {
            playSfx('splat');
            lastSfxTimeRef.current.splat = now;
          }
        }

        return anyChanged ? next : prev;
      });

      // NPC AI (solo only)
      if (!isMultiplayer && phaseRef.current === 'playing') {
        const profile = NPC_PROFILES[difficulty] || NPC_PROFILES.medium;

        setPlayers((prev) => {
          const npc = prev[opponentId];
          if (!npc || npc.isEliminated) return prev;

          if (npc.pee >= MAX_PEE * profile.reliefPct && now >= npc.peeCooldownUntil) {
            return {
              ...prev,
              [opponentId]: {
                ...npc,
                pee: Math.max(0, npc.pee - PEE_RELIEF_AMOUNT),
                peeCooldownUntil: now + PEE_COOLDOWN_MS,
              },
            };
          }
          if (npc.vomit >= MAX_VOMIT * profile.reliefPct && now >= npc.vomitCooldownUntil) {
            return {
              ...prev,
              [opponentId]: {
                ...npc,
                vomit: Math.max(0, npc.vomit - VOMIT_RELIEF_AMOUNT),
                vomitCooldownUntil: now + VOMIT_COOLDOWN_MS,
              },
            };
          }

          return prev;
        });

        if (now >= npcNextDrinkRef.current) {
          drinkBeer(opponentId);
          npcNextDrinkRef.current = now + randBetween(profile.drinkMin, profile.drinkMax);
        }
      }

      if (remaining <= 0) {
        setPhase('finished');
      }
    }, TICK_INTERVAL_MS);

    return () => clearInterval(id);
  }, [phase, playerId, opponentId, isMultiplayer, difficulty, drinkBeer, playSfx]);

  // Determine winner when phase transitions to finished or someone is eliminated
  useEffect(() => {
    const p = players[playerId];
    const o = players[opponentId];

    if (phase === 'playing') {
      if (p.isEliminated && !o.isEliminated) {
        setWinnerId(opponentId);
        setPhase('finished');
      } else if (o.isEliminated && !p.isEliminated) {
        setWinnerId(playerId);
        setPhase('finished');
      } else if (p.isEliminated && o.isEliminated) {
        setWinnerId(null);
        setPhase('finished');
      }
    } else if (phase === 'finished' && winnerId === null) {
      if (p.isEliminated && !o.isEliminated) setWinnerId(opponentId);
      else if (o.isEliminated && !p.isEliminated) setWinnerId(playerId);
      else if (p.beerPoints > o.beerPoints) setWinnerId(playerId);
      else if (o.beerPoints > p.beerPoints) setWinnerId(opponentId);
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
    opponentDrink: useCallback(() => drinkBeer(opponentId), [drinkBeer, opponentId]),
    opponentRelief: useCallback((stat) => useRelief(opponentId, stat), [useRelief, opponentId]),
    constants: { MAX_PEE, MAX_VOMIT, PEE_COOLDOWN_MS, VOMIT_COOLDOWN_MS, PEE_RELIEF_AMOUNT, VOMIT_RELIEF_AMOUNT },
  };
}
