import { useState, useRef, useCallback, useEffect } from 'react';

// ── Constants ──
const COUNTDOWN_MS = 3_000;
const DEAL_DELAY_MS = 600;
const ROUND_RESULT_MS = 1_500;
const DEFAULT_ANTE = 5;
const DEFAULT_ROUNDS = 5;
const TICK_MS = 100;

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

const NPC_THRESHOLD = { easy: 15, medium: 17, hard: 18 };

const COMMENTARY = {
  early: ['Niezły początek!', 'Hmm, zobaczmy co dalej...', 'Karty mówią same za siebie.'],
  mid:   ['To się robi ciekawe!', 'Kto tu blefuje?', 'Stawka rośnie!'],
  final: ['Ostatnia runda!', 'Teraz albo nigdy!', 'Chwila prawdy!'],
  win:   ['Ha! Mam cię!', 'Lepiej graj następnym razem!', 'Złoto jest moje!'],
  loss:  ['Cholera...', 'Masz szczęście!', 'Następnym razem wygrywam!'],
  bust:  ['Za dużo!', 'Przeholowałeś!', 'Ha, bust!'],
};

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push({ suit, rank, faceUp: true });
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function cardValue(rank) {
  if (rank === 'A') return 11;
  if ('KQJ'.includes(rank)) return 10;
  return parseInt(rank, 10);
}

export function handValue(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardValue(c.rank);
    if (c.rank === 'A') aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 && total <= 21 };
}

function roundCommentary(round, totalRounds) {
  if (round === totalRounds) return pick(COMMENTARY.final);
  if (round <= 2) return pick(COMMENTARY.early);
  if (round >= totalRounds - 1) return pick(COMMENTARY.mid);
  return null;
}

/**
 * Card game (Oczko) minigame hook — Blackjack variant, best-of-N rounds.
 */
export function useCardGame({
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
  const [playerHand, setPlayerHand] = useState([]);
  const [opponentHand, setOpponentHand] = useState([]);
  const [playerScore, setPlayerScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [playerGold, setPlayerGold] = useState(0);
  const [opponentGold, setOpponentGold] = useState(0);
  const [winnerId, setWinnerId] = useState(null);
  const [commentary, setCommentary] = useState(null);

  const deckRef = useRef([]);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // Refs mirror hand state so synchronous game logic always reads the latest value
  const pHandRef = useRef([]);
  const oHandRef = useRef([]);
  const pScoreRef = useRef(0);
  const oScoreRef = useRef(0);
  const pGoldRef = useRef(0);
  const oGoldRef = useRef(0);
  const roundRef = useRef(1);

  const drawCard = useCallback((faceUp = true) => {
    if (deckRef.current.length === 0) deckRef.current = createDeck();
    return { ...deckRef.current.pop(), faceUp };
  }, []);

  // ── Resolve a finished round (synchronous, called from hit-bust / stand / opponent-turn) ──
  const resolveAndAdvance = useCallback(() => {
    const pH = pHandRef.current;
    const oH = oHandRef.current;
    const pVal = handValue(pH);
    const oVal = handValue(oH);
    const pBust = pVal.total > 21;
    const oBust = oVal.total > 21;

    let roundWinner = null;
    let note = null;

    if (pBust && oBust) {
      note = pick(COMMENTARY.bust);
    } else if (pBust) {
      roundWinner = opponentId;
      note = pick(COMMENTARY.bust);
    } else if (oBust) {
      roundWinner = playerId;
      note = pick(COMMENTARY.bust);
    } else if (pVal.total > oVal.total) {
      roundWinner = playerId;
    } else if (oVal.total > pVal.total) {
      roundWinner = opponentId;
    }

    if (roundWinner === playerId) {
      pScoreRef.current += 1;
      pGoldRef.current += anteGold;
      oGoldRef.current -= anteGold;
      setPlayerScore(pScoreRef.current);
      setPlayerGold(pGoldRef.current);
      setOpponentGold(oGoldRef.current);
      note = note || pick(COMMENTARY.loss);
    } else if (roundWinner === opponentId) {
      oScoreRef.current += 1;
      oGoldRef.current += anteGold;
      pGoldRef.current -= anteGold;
      setOpponentScore(oScoreRef.current);
      setOpponentGold(oGoldRef.current);
      setPlayerGold(pGoldRef.current);
      note = note || pick(COMMENTARY.win);
    }

    if (note) setCommentary(note);
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
        setPhase('dealing');
      }
    }, ROUND_RESULT_MS);
  }, [playerId, opponentId, anteGold, totalRounds]);

  // ── Countdown ──
  useEffect(() => {
    if (phase !== 'countdown') return;
    const start = Date.now();
    const id = setInterval(() => {
      const remaining = COUNTDOWN_MS - (Date.now() - start);
      if (remaining <= 0) {
        clearInterval(id);
        setCountdownSec(0);
        setPhase('dealing');
      } else {
        setCountdownSec(Math.ceil(remaining / 1000));
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [phase]);

  // ── Dealing — runs once per entry into 'dealing' ──
  const dealRanRef = useRef(false);
  useEffect(() => {
    if (phase !== 'dealing') { dealRanRef.current = false; return; }
    if (dealRanRef.current) return;
    dealRanRef.current = true;

    deckRef.current = createDeck();
    const pH = [drawCard(true), drawCard(true)];
    const oH = [drawCard(false), drawCard(true)];
    pHandRef.current = pH;
    oHandRef.current = oH;
    setPlayerHand(pH);
    setOpponentHand(oH);

    const c = roundCommentary(roundRef.current, totalRounds);
    if (c) setCommentary(c);

    const id = setTimeout(() => setPhase('player_turn'), DEAL_DELAY_MS);
    return () => clearTimeout(id);
  }, [phase, totalRounds, drawCard]);

  // ── Player actions ──
  const hit = useCallback(() => {
    if (phaseRef.current !== 'player_turn') return;
    const card = drawCard(true);
    const next = [...pHandRef.current, card];
    pHandRef.current = next;
    setPlayerHand(next);

    if (handValue(next).total > 21) {
      // Bust — reveal opponent hand and resolve
      const revealed = oHandRef.current.map(c => ({ ...c, faceUp: true }));
      oHandRef.current = revealed;
      setOpponentHand(revealed);
      setPhase('opponent_turn');
      setTimeout(() => resolveAndAdvance(), DEAL_DELAY_MS);
    }
  }, [drawCard, resolveAndAdvance]);

  const stand = useCallback(() => {
    if (phaseRef.current !== 'player_turn') return;
    setPhase('opponent_turn');

    const threshold = NPC_THRESHOLD[difficulty] || NPC_THRESHOLD.medium;
    const revealed = oHandRef.current.map(c => ({ ...c, faceUp: true }));
    let oH = [...revealed];
    while (handValue(oH).total < threshold) {
      oH.push(drawCard(true));
    }
    oHandRef.current = oH;
    setOpponentHand(oH);

    setTimeout(() => resolveAndAdvance(), DEAL_DELAY_MS);
  }, [difficulty, drawCard, resolveAndAdvance]);

  const forfeit = useCallback(() => {
    if (phaseRef.current === 'finished') return;
    setWinnerId(opponentId);
    setPhase('finished');
  }, [opponentId]);

  const pVal = handValue(playerHand);
  const oVal = handValue(opponentHand);
  const opponentShowAll = phase !== 'dealing' && phase !== 'player_turn' && phase !== 'countdown';

  return {
    phase,
    countdownSec,
    round,
    totalRounds,
    playerHand,
    playerTotal: pVal.total,
    playerBust: pVal.total > 21,
    opponentHand,
    opponentTotal: oVal.total,
    opponentBust: oVal.total > 21,
    opponentShowAll,
    playerScore,
    opponentScore,
    playerGold,
    opponentGold,
    goldDelta: playerGold,
    winnerId,
    commentary,
    hit,
    stand,
    forfeit,
    constants: { DEAL_DELAY_MS, ROUND_RESULT_MS, DEFAULT_ANTE: anteGold, SUITS, RANKS },
  };
}
