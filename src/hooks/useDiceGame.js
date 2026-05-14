import { useState, useRef, useCallback, useEffect } from 'react';

// ── Constants ──
const COUNTDOWN_MS = 3_000;
const ROLL_ANIM_MS = 1_500;
const ROUND_RESULT_MS = 1_500;
const DEFAULT_ANTE = 5;
const DEFAULT_ROUNDS = 7;
const TICK_MS = 100;

const NPC_FOLD_CHANCE = { easy: 0.40, medium: 0.20, hard: 0.05 };
const NPC_RAISE_CHANCE = { easy: 0.05, medium: 0.15, hard: 0.30 };

const COMMENTARY = {
  early:  ['Kości rzucone!', 'Zobaczymy kto ma szczęście.', 'Niech bogowie zdecydują!'],
  mid:    ['Wyrównana gra!', 'Kto się podda pierwszy?', 'Każdy rzut się liczy!'],
  final:  ['Ostatni rzut!', 'Teraz albo nigdy!', 'Wszystko albo nic!'],
  win:    ['Kości mnie kochają!', 'Tym razem mam cię!', 'Płać, przegrany!'],
  loss:   ['Psi pech!', 'Kości mnie zdradzają!', 'Grrr...'],
  dragon: ['SMOCZE OCZY!', 'Bogowie sprzyjają!', 'Podwójne szóstki!'],
  dog:    ['PSI PECH!', 'Podwójne jedynki...', 'Klątwa!'],
};

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rollDie() {
  return 1 + Math.floor(Math.random() * 6);
}

function rollPair() {
  return [rollDie(), rollDie()];
}

function diceTotal(dice) {
  return dice[0] + dice[1];
}

function isDragonEyes(dice) {
  return dice[0] === 6 && dice[1] === 6;
}

function isDogLuck(dice) {
  return dice[0] === 1 && dice[1] === 1;
}

function detectCombo(dice) {
  if (isDragonEyes(dice)) return 'dragon_eyes';
  if (isDogLuck(dice)) return 'dog_luck';
  return null;
}

function roundCommentary(round, totalRounds) {
  if (round === totalRounds) return pick(COMMENTARY.final);
  if (round <= 3) return pick(COMMENTARY.early);
  if (round >= 5) return pick(COMMENTARY.mid);
  return null;
}

/**
 * Dice game minigame hook — 2d6, best-of-N with raise mechanic.
 */
export function useDiceGame({
  playerId,
  playerName,
  opponentId,
  opponentName,
  difficulty = 'medium',
  anteGold = DEFAULT_ANTE,
  totalRounds = DEFAULT_ROUNDS,
}) {
  const [phase, setPhase] = useState('countdown');
  const [countdownSec, setCountdownSec] = useState(Math.ceil(COUNTDOWN_MS / 1000));
  const [round, setRound] = useState(1);
  const [playerDice, setPlayerDice] = useState([0, 0]);
  const [opponentDice, setOpponentDice] = useState([0, 0]);
  const [playerScore, setPlayerScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [playerGold, setPlayerGold] = useState(0);
  const [opponentGold, setOpponentGold] = useState(0);
  const [winnerId, setWinnerId] = useState(null);
  const [commentary, setCommentary] = useState(null);
  const [lastCombo, setLastCombo] = useState(null);
  const [raised, setRaised] = useState(false);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // Refs for synchronous logic
  const pScoreRef = useRef(0);
  const oScoreRef = useRef(0);
  const pGoldRef = useRef(0);
  const oGoldRef = useRef(0);
  const roundRef = useRef(1);
  const raisedRef = useRef(false);

  // ── Resolve a finished roll ──
  const resolveRoll = useCallback((pDice, oDice, potMultiplier) => {
    const pCombo = detectCombo(pDice);
    const oCombo = detectCombo(oDice);
    const pot = anteGold * potMultiplier;
    let bonusGold = 0;

    let roundWinner = null;
    let combo = null;
    let note = null;

    // Dragon Eyes = instant win + bonus gold
    if (pCombo === 'dragon_eyes' && oCombo === 'dragon_eyes') {
      // Both dragon eyes — tie, re-roll
      combo = 'dragon_eyes';
      note = pick(COMMENTARY.dragon);
      // No winner — will be handled as tie
    } else if (pCombo === 'dragon_eyes') {
      roundWinner = playerId;
      combo = 'dragon_eyes';
      bonusGold = anteGold;
      note = pick(COMMENTARY.dragon);
    } else if (oCombo === 'dragon_eyes') {
      roundWinner = opponentId;
      combo = 'dragon_eyes';
      bonusGold = anteGold;
      note = pick(COMMENTARY.dragon);
    } else if (pCombo === 'dog_luck' && oCombo === 'dog_luck') {
      combo = 'dog_luck';
      note = pick(COMMENTARY.dog);
    } else if (pCombo === 'dog_luck') {
      roundWinner = opponentId;
      combo = 'dog_luck';
      note = pick(COMMENTARY.dog);
    } else if (oCombo === 'dog_luck') {
      roundWinner = playerId;
      combo = 'dog_luck';
      note = pick(COMMENTARY.dog);
    } else {
      const pTotal = diceTotal(pDice);
      const oTotal = diceTotal(oDice);
      if (pTotal > oTotal) roundWinner = playerId;
      else if (oTotal > pTotal) roundWinner = opponentId;
      // else tie — no winner
    }

    setLastCombo(combo);

    const totalPot = pot + bonusGold;
    if (roundWinner === playerId) {
      pScoreRef.current += 1;
      pGoldRef.current += totalPot;
      oGoldRef.current -= totalPot;
      setPlayerScore(pScoreRef.current);
      setPlayerGold(pGoldRef.current);
      setOpponentGold(oGoldRef.current);
      note = note || pick(COMMENTARY.win);
    } else if (roundWinner === opponentId) {
      oScoreRef.current += 1;
      oGoldRef.current += totalPot;
      pGoldRef.current -= totalPot;
      setOpponentScore(oScoreRef.current);
      setOpponentGold(oGoldRef.current);
      setPlayerGold(pGoldRef.current);
      note = note || pick(COMMENTARY.loss);
    }

    const c = roundCommentary(roundRef.current, totalRounds);
    setCommentary(note || c);
    setPhase('round_result');

    const winsNeeded = Math.ceil(totalRounds / 2);
    const matchOver =
      pScoreRef.current >= winsNeeded ||
      oScoreRef.current >= winsNeeded ||
      roundRef.current >= totalRounds;

    setTimeout(() => {
      if (matchOver) {
        if (pScoreRef.current > oScoreRef.current) setWinnerId(playerId);
        else if (oScoreRef.current > pScoreRef.current) setWinnerId(opponentId);
        setPhase('finished');
      } else {
        roundRef.current += 1;
        setRound(roundRef.current);
        raisedRef.current = false;
        setRaised(false);
        setPhase('betting');
      }
    }, ROUND_RESULT_MS);
  }, [playerId, opponentId, anteGold, totalRounds]);

  // ── Roll both dice simultaneously ──
  const executeRoll = useCallback((potMultiplier) => {
    setPhase('rolling');
    const pDice = rollPair();
    const oDice = rollPair();
    setPlayerDice(pDice);
    setOpponentDice(oDice);

    setTimeout(() => resolveRoll(pDice, oDice, potMultiplier), ROLL_ANIM_MS);
  }, [resolveRoll]);

  // ── Countdown ──
  useEffect(() => {
    if (phase !== 'countdown') return;
    const start = Date.now();
    const id = setInterval(() => {
      const remaining = COUNTDOWN_MS - (Date.now() - start);
      if (remaining <= 0) {
        clearInterval(id);
        setCountdownSec(0);
        setPhase('betting');
      } else {
        setCountdownSec(Math.ceil(remaining / 1000));
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [phase]);

  // ── Player actions ──

  /** Normal bet — roll at 1x ante. */
  const roll = useCallback(() => {
    if (phaseRef.current !== 'betting') return;
    // NPC might raise when it has score advantage
    const npcRaiseChance = NPC_RAISE_CHANCE[difficulty] || NPC_RAISE_CHANCE.medium;
    const npcAhead = oScoreRef.current > pScoreRef.current;
    if (npcAhead && Math.random() < npcRaiseChance) {
      raisedRef.current = true;
      setRaised(true);
      setCommentary('Podbijam!');
      executeRoll(2);
    } else {
      executeRoll(1);
    }
  }, [difficulty, executeRoll]);

  /** Player raises — double the pot. NPC can fold. */
  const raise = useCallback(() => {
    if (phaseRef.current !== 'betting') return;
    raisedRef.current = true;
    setRaised(true);

    const foldChance = NPC_FOLD_CHANCE[difficulty] || NPC_FOLD_CHANCE.medium;
    if (Math.random() < foldChance) {
      // NPC folds — player wins the ante without rolling
      pScoreRef.current += 1;
      pGoldRef.current += anteGold;
      oGoldRef.current -= anteGold;
      setPlayerScore(pScoreRef.current);
      setPlayerGold(pGoldRef.current);
      setOpponentGold(oGoldRef.current);
      setCommentary('Przeciwnik spasował!');
      setPhase('round_result');

      const winsNeeded = Math.ceil(totalRounds / 2);
      const matchOver =
        pScoreRef.current >= winsNeeded || roundRef.current >= totalRounds;

      setTimeout(() => {
        if (matchOver) {
          if (pScoreRef.current > oScoreRef.current) setWinnerId(playerId);
          else if (oScoreRef.current > pScoreRef.current) setWinnerId(opponentId);
          setPhase('finished');
        } else {
          roundRef.current += 1;
          setRound(roundRef.current);
          raisedRef.current = false;
          setRaised(false);
          setPhase('betting');
        }
      }, ROUND_RESULT_MS);
    } else {
      executeRoll(2);
    }
  }, [difficulty, anteGold, totalRounds, playerId, opponentId, executeRoll]);

  const forfeit = useCallback(() => {
    if (phaseRef.current === 'finished') return;
    setWinnerId(opponentId);
    setPhase('finished');
  }, [opponentId]);

  const pTotal = playerDice[0] + playerDice[1];
  const oTotal = opponentDice[0] + opponentDice[1];
  const pCombo = detectCombo(playerDice);
  const oCombo = detectCombo(opponentDice);
  const isRolling = phase === 'rolling';

  return {
    phase,
    countdownSec,
    round,
    totalRounds,
    playerDice,
    playerTotal: pTotal || null,
    playerCombo: pCombo,
    opponentDice,
    opponentTotal: oTotal || null,
    opponentCombo: oCombo,
    playerScore,
    opponentScore,
    playerGold,
    opponentGold,
    goldDelta: playerGold,
    potMultiplier: raised ? 2 : 1,
    winnerId,
    commentary,
    lastCombo,
    combosHit: { player: pCombo, opponent: oCombo },
    raised,
    rolling: isRolling,
    roll,
    play: roll,
    raise,
    forfeit,
    constants: { ROLL_ANIM_MS, ROUND_RESULT_MS, DEFAULT_ANTE: anteGold },
  };
}
