import { useState, useRef, useCallback, useEffect, useMemo } from 'react';

// ── Tunable constants ──
export const BEER_DUEL_DURATION_MS = 90_000;
const PEE_COOLDOWN_MS = 1_000;
const VOMIT_COOLDOWN_MS = 4_500;

const MAX_PEE = 150;
const MAX_VOMIT = 75;
const MAX_BRUISE = 15;
const PEE_RELIEF_AMOUNT = 20;
const VOMIT_RELIEF_AMOUNT = 15;
const BRUISE_PER_TRAP = 3;
const TRAP_WARNING_MS = 250;
const TRAP_DANGER_MS = 1000;

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
  easy:   { drinkMin: 400, drinkMax: 800, peeReliefPct: 0.45, vomitReliefPct: 0.35 },
  medium: { drinkMin: 200, drinkMax: 600, peeReliefPct: 0.30, vomitReliefPct: 0.55 },
  tough:  { drinkMin: 150, drinkMax: 550, peeReliefPct: 0.22, vomitReliefPct: 0.30 },
  hard:   { drinkMin: 100, drinkMax: 500, peeReliefPct: 0.15, vomitReliefPct: 0.10 },
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
    bruise: 0,
    peePending: 0,
    vomitPending: 0,
    isEliminated: false,
    peeCooldownUntil: 0,
    vomitCooldownUntil: 0,
    peeReliefCount: 0,
    vomitReliefCount: 0,
  };
}

/**
 * Real-time beer duel minigame hook — supports 1..N opponents.
 *
 * @param {Object} opts
 * @param {string} opts.playerId
 * @param {string} opts.playerName
 * @param {Array<{id: string, name: string, difficulty?: string}>} opts.opponents
 * @param {boolean} [opts.isMultiplayer]
 * @param {Function} [opts.playSfx]
 */
export function useBeerDuel({
  playerId,
  playerName,
  opponents = [],
  isMultiplayer = false,
  playSfx = () => {},
}) {
  const opponentIds = useMemo(() => opponents.map((o) => o.id), [opponents]);
  const allIds = useMemo(() => [playerId, ...opponentIds], [playerId, opponentIds]);

  const [phase, setPhase] = useState('countdown');
  const [timeRemainingMs, setTimeRemainingMs] = useState(BEER_DUEL_DURATION_MS);
  const [countdownSec, setCountdownSec] = useState(Math.ceil(COUNTDOWN_DURATION_MS / 1000));
  const [players, setPlayers] = useState(() => {
    const map = { [playerId]: createPlayer(playerId, playerName) };
    for (const o of opponents) map[o.id] = createPlayer(o.id, o.name);
    return map;
  });
  const [winnerId, setWinnerId] = useState(null);

  const drainScheduleRef = useRef(() => {
    const s = {};
    for (const id of [playerId, ...opponents.map((o) => o.id)]) {
      s[id] = { nextPeeDrain: 0, nextVomitDrain: 0 };
    }
    return s;
  });
  // Lazy-init on first render
  if (typeof drainScheduleRef.current === 'function') {
    drainScheduleRef.current = drainScheduleRef.current();
  }

  // Per-NPC AI timing: each opponent gets its own next-drink timestamp
  const npcNextDrinkRef = useRef(() => {
    const m = {};
    for (const o of opponents) m[o.id] = 0;
    return m;
  });
  if (typeof npcNextDrinkRef.current === 'function') {
    npcNextDrinkRef.current = npcNextDrinkRef.current();
  }

  const gameStartRef = useRef(0);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const lastSfxTimeRef = useRef({ drip: 0, splat: 0, heartbeat: 0 });
  const dangerFiredRef = useRef(() => {
    const m = {};
    for (const id of [playerId, ...opponents.map((o) => o.id)]) m[id] = false;
    return m;
  });
  if (typeof dangerFiredRef.current === 'function') dangerFiredRef.current = dangerFiredRef.current();

  const halfwayFiredRef = useRef(() => {
    const m = {};
    for (const id of [playerId, ...opponents.map((o) => o.id)]) m[id] = { pee: false, vomit: false };
    return m;
  });
  if (typeof halfwayFiredRef.current === 'function') halfwayFiredRef.current = halfwayFiredRef.current();

  const eliminatedRef = useRef(() => {
    const m = {};
    for (const id of [playerId, ...opponents.map((o) => o.id)]) m[id] = false;
    return m;
  });
  if (typeof eliminatedRef.current === 'function') eliminatedRef.current = eliminatedRef.current();

  const prevCountdownSecRef = useRef(null);

  // Per-opponent NPC last action (for flash animation)
  const [npcLastActions, setNpcLastActions] = useState(() => {
    const m = {};
    for (const o of opponents) m[o.id] = null;
    return m;
  });
  const npcActionTimerRefs = useRef({});

  // ── Per-player trap button state ──
  const [trapPhases, setTrapPhases] = useState(() => {
    const m = {};
    for (const id of [playerId, ...opponents.map((o) => o.id)]) m[id] = null;
    return m;
  });
  const trapPhaseRef = useRef(() => {
    const m = {};
    for (const id of [playerId, ...opponents.map((o) => o.id)]) m[id] = null;
    return m;
  });
  if (typeof trapPhaseRef.current === 'function') trapPhaseRef.current = trapPhaseRef.current();

  const trapQueueRef = useRef(() => {
    const m = {};
    for (const id of [playerId, ...opponents.map((o) => o.id)]) m[id] = [];
    return m;
  });
  if (typeof trapQueueRef.current === 'function') trapQueueRef.current = trapQueueRef.current();
  const trapRunningRef = useRef(() => {
    const m = {};
    for (const id of [playerId, ...opponents.map((o) => o.id)]) m[id] = false;
    return m;
  });
  if (typeof trapRunningRef.current === 'function') trapRunningRef.current = trapRunningRef.current();

  const lastFullBeerRef = useRef(() => {
    const m = {};
    for (const id of [playerId, ...opponents.map((o) => o.id)]) m[id] = 0;
    return m;
  });
  if (typeof lastFullBeerRef.current === 'function') lastFullBeerRef.current = lastFullBeerRef.current();

  // Build difficulty lookup from opponents array
  const difficultyMap = useMemo(() => {
    const m = {};
    for (const o of opponents) m[o.id] = o.difficulty || 'medium';
    return m;
  }, [opponents]);

  const runNextTrap = useCallback((who) => {
    const queue = trapQueueRef.current[who];
    if (!queue || queue.length === 0) {
      trapRunningRef.current[who] = false;
      return;
    }
    trapRunningRef.current[who] = true;
    const delay = queue.shift();
    setTimeout(() => {
      if (phaseRef.current !== 'playing') {
        trapRunningRef.current[who] = false;
        return;
      }
      playSfx('danger');
      setTrapPhases((prev) => ({ ...prev, [who]: 'warning' }));
      trapPhaseRef.current[who] = 'warning';
      setTimeout(() => {
        setTrapPhases((prev) => ({ ...prev, [who]: 'danger' }));
        trapPhaseRef.current[who] = 'danger';
        setTimeout(() => {
          setTrapPhases((prev) => ({ ...prev, [who]: null }));
          trapPhaseRef.current[who] = null;
          runNextTrap(who);
        }, TRAP_DANGER_MS);
      }, TRAP_WARNING_MS);
    }, delay);
  }, [playSfx]);

  const scheduleTrap = useCallback((who) => {
    const delay = randBetween(1500, 5000);
    trapQueueRef.current[who].push(delay);
    if (!trapRunningRef.current[who]) runNextTrap(who);
  }, [runNextTrap]);

  // ── Actions ──

  const drinkBeer = useCallback((who) => {
    if (phaseRef.current !== 'playing') return;
    setPlayers((prev) => {
      const p = prev[who];
      if (!p || p.isEliminated) return prev;
      const sipCount = Math.floor(p.beerPoints * 2) + 1;
      return {
        ...prev,
        [who]: {
          ...p,
          beerPoints: p.beerPoints + 0.5,
          peePending: p.peePending + PEE_BASE_PER_BEER / 2 + Math.ceil(sipCount / 2),
          vomitPending: p.vomitPending + VOMIT_PER_BEER / 2,
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
      const countKey = stat === 'pee' ? 'peeReliefCount' : 'vomitReliefCount';
      return {
        ...prev,
        [who]: {
          ...p,
          [stat]: Math.max(0, p[stat] - reliefAmt),
          [cdKey]: now + cdMs,
          [countKey]: p[countKey] + 1,
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
          const now = Date.now();
          for (const oId of opponentIds) {
            npcNextDrinkRef.current[oId] = now + randBetween(500, 1500);
          }
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

      // ── Drain pee/vomit for ALL participants ──
      setPlayers((prev) => {
        let next = { ...prev };
        let anyChanged = false;
        let sfxDrip = false;
        let sfxSplat = false;
        let sfxDanger = false;
        let sfxEliminated = false;

        for (const pid of allIds) {
          const p = next[pid];
          if (!p || p.isEliminated) continue;
          const sched = drainScheduleRef.current[pid];
          if (!sched) continue;

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
            const eliminated = newPee >= MAX_PEE || newVomit >= MAX_VOMIT || p.bruise >= MAX_BRUISE;
            if (eliminated) { sfxEliminated = true; eliminatedRef.current[pid] = true; }

            const half = halfwayFiredRef.current[pid];
            if (half) {
              if (newPee / MAX_PEE >= 0.5 && !half.pee) { half.pee = true; sfxDanger = true; }
              if (newVomit / MAX_VOMIT >= 0.5 && !half.vomit) { half.vomit = true; sfxDanger = true; }
            }

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
          playSfx('crowdGasp');
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

        const anyPlayerCritical = allIds.some((pid) => {
          const pl = next[pid] || prev[pid];
          return pl && !pl.isEliminated && (pl.pee / MAX_PEE >= 0.8 || pl.vomit / MAX_VOMIT >= 0.8);
        });
        if (anyPlayerCritical && now - lastSfxTimeRef.current.heartbeat >= 1200) {
          playSfx('heartbeat');
          lastSfxTimeRef.current.heartbeat = now;
        }

        return anyChanged ? next : prev;
      });

      // ── NPC AI for each opponent (solo only) ──
      if (!isMultiplayer && phaseRef.current === 'playing') {
        for (const oId of opponentIds) {
          if (eliminatedRef.current[oId]) continue;
          const diff = difficultyMap[oId] || 'medium';
          const profile = NPC_PROFILES[diff] || NPC_PROFILES.medium;

          const flashNpcAction = (action) => {
            clearTimeout(npcActionTimerRefs.current[oId]);
            setNpcLastActions((prev) => ({ ...prev, [oId]: action }));
            npcActionTimerRefs.current[oId] = setTimeout(
              () => setNpcLastActions((prev) => ({ ...prev, [oId]: null })),
              350,
            );
          };

          let npcReliefAction = null;
          setPlayers((prev) => {
            const npc = prev[oId];
            if (!npc || npc.isEliminated) return prev;

            let updated = { ...npc };
            let changed = false;

            if (updated.pee >= MAX_PEE * profile.peeReliefPct && now >= updated.peeCooldownUntil) {
              updated.pee = Math.max(0, updated.pee - PEE_RELIEF_AMOUNT);
              updated.peeCooldownUntil = now + PEE_COOLDOWN_MS;
              updated.peeReliefCount = (updated.peeReliefCount || 0) + 1;
              npcReliefAction = 'pee';
              changed = true;
            }

            if (updated.vomit >= MAX_VOMIT * profile.vomitReliefPct && now >= updated.vomitCooldownUntil) {
              updated.vomit = Math.max(0, updated.vomit - VOMIT_RELIEF_AMOUNT);
              updated.vomitCooldownUntil = now + VOMIT_COOLDOWN_MS;
              updated.vomitReliefCount = (updated.vomitReliefCount || 0) + 1;
              npcReliefAction = 'vomit';
              changed = true;
            }

            return changed ? { ...prev, [oId]: updated } : prev;
          });

          if (npcReliefAction) flashNpcAction(npcReliefAction);

          if (now >= (npcNextDrinkRef.current[oId] || 0)) {
            if (trapPhaseRef.current[oId] === 'danger') {
              const missChance = diff === 'easy' ? 0.25 : diff === 'hard' ? 0.08 : 0.18;
              if (Math.random() < missChance) {
                setPlayers((prev) => {
                  const npc = prev[oId];
                  if (!npc || npc.isEliminated) return prev;
                  const newBruise = Math.min(npc.bruise + BRUISE_PER_TRAP, MAX_BRUISE);
                  const nowElim = newBruise >= MAX_BRUISE;
                  if (nowElim) eliminatedRef.current[oId] = true;
                  return { ...prev, [oId]: { ...npc, bruise: newBruise, isEliminated: npc.isEliminated || nowElim } };
                });
                if (!npcReliefAction) flashNpcAction('drink');
              }
              npcNextDrinkRef.current[oId] = now + randBetween(200, 400);
            } else {
              drinkBeer(oId);
              if (!npcReliefAction) flashNpcAction('drink');
              npcNextDrinkRef.current[oId] = now + randBetween(profile.drinkMin, profile.drinkMax);
            }
          }
        }
      }

      const allOut = allIds.every((pid) => eliminatedRef.current[pid]);
      if (remaining <= 0 || allOut) {
        setPhase('finished');
      }
    }, TICK_INTERVAL_MS);

    return () => clearInterval(id);
  }, [phase, playerId, opponentIds, allIds, isMultiplayer, difficultyMap, drinkBeer, playSfx]);

  // Schedule trap after each full beer milestone — per participant
  useEffect(() => {
    if (phase !== 'playing') return;
    for (const pid of allIds) {
      const p = players[pid];
      if (!p) continue;
      const curTrap = Math.floor(p.beerPoints / 5);
      if (curTrap > (lastFullBeerRef.current[pid] || 0)) {
        lastFullBeerRef.current[pid] = curTrap;
        scheduleTrap(pid);
      }
    }
  }, [phase, players, allIds, scheduleTrap]);

  // Cleanup trap queues
  useEffect(() => () => {
    for (const pid of allIds) {
      trapQueueRef.current[pid] = [];
      trapRunningRef.current[pid] = false;
    }
  }, [allIds]);

  // Determine winner when timer runs out — highest beerPoints among non-eliminated
  useEffect(() => {
    if (phase !== 'finished' || winnerId !== null) return;
    let bestId = null;
    let bestBeers = -1;
    let tie = false;
    for (const pid of allIds) {
      const p = players[pid];
      if (!p) continue;
      if (p.beerPoints > bestBeers) {
        bestBeers = p.beerPoints;
        bestId = pid;
        tie = false;
      } else if (p.beerPoints === bestBeers) {
        tie = true;
      }
    }
    if (!tie && bestId) setWinnerId(bestId);
    // else stays null → draw
  }, [phase, players, allIds, winnerId]);

  const playerDrink = useCallback(() => {
    if (trapPhases[playerId] === 'danger') {
      setPlayers((prev) => {
        const p = prev[playerId];
        if (!p || p.isEliminated) return prev;
        const newBruise = Math.min(p.bruise + BRUISE_PER_TRAP, MAX_BRUISE);
        const nowElim = newBruise >= MAX_BRUISE;
        if (nowElim) eliminatedRef.current[playerId] = true;
        return {
          ...prev,
          [playerId]: { ...p, bruise: newBruise, isEliminated: p.isEliminated || nowElim },
        };
      });
      return 'trap';
    }
    drinkBeer(playerId);
    return 'ok';
  }, [drinkBeer, playerId, trapPhases]);

  // Build opponent states array for the panel
  const opponentStates = useMemo(
    () => opponentIds.map((oId) => players[oId]).filter(Boolean),
    [opponentIds, players],
  );

  return {
    phase,
    countdownSec,
    timeRemainingMs,
    player: players[playerId],
    opponents: opponentStates,
    winnerId,
    npcLastActions,
    trapPhases,
    drinkBeer: playerDrink,
    useRelief: useCallback((stat) => useRelief(playerId, stat), [useRelief, playerId]),
    constants: { MAX_PEE, MAX_VOMIT, MAX_BRUISE, PEE_COOLDOWN_MS, VOMIT_COOLDOWN_MS, PEE_RELIEF_AMOUNT, VOMIT_RELIEF_AMOUNT },
  };
}
