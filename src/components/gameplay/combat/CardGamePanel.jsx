import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useCardGame } from '../../../hooks/useCardGame';
import { useMinigameAudio } from '../../../hooks/useMinigameAudio';

const SUIT_CONFIG = {
  hearts:   { symbol: '♥', color: 'text-red-500', tint: 'bg-red-500/15' },
  diamonds: { symbol: '♦', color: 'text-orange-300', tint: 'bg-orange-300/15' },
  clubs:    { symbol: '♣', color: 'text-sky-200', tint: 'bg-sky-200/15' },
  spades:   { symbol: '♠', color: 'text-purple-800', tint: 'bg-purple-700/20' },
};

function PlayingCard({ card, faceDown = false, animate = false }) {
  if (faceDown) {
    return (
      <div className="w-20 h-28 md:w-24 md:h-36 rounded-xl border-2 border-emerald-400/70 bg-emerald-900/60 flex items-center justify-center shrink-0 -ml-5 md:-ml-6 first:ml-0 shadow-2xl ring-1 ring-black/50">
        <div className="w-14 h-24 md:w-16 md:h-32 rounded-lg border-2 border-emerald-300/35 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(16,185,129,0.15)_4px,rgba(16,185,129,0.15)_8px)]" />
      </div>
    );
  }

  const suit = SUIT_CONFIG[card.suit] || SUIT_CONFIG['♠'];
  return (
    <div
      className={`
        w-20 h-28 md:w-24 md:h-36 rounded-xl border-2 border-white/45 ${suit.tint} backdrop-blur-sm
        flex flex-col items-center justify-between py-2 md:py-3 px-1.5 md:px-2 shrink-0
        -ml-5 md:-ml-6 first:ml-0 shadow-2xl ring-1 ring-black/55
        ${animate ? 'animate-card-deal' : ''}
      `}
      style={{ boxShadow: 'inset 0 1px 14px rgba(255,255,255,0.08), 0 18px 36px rgba(0,0,0,0.35)' }}
    >
      <span className={`text-sm md:text-base font-mono leading-none ${suit.color}`}>{card.rank}</span>
      <span className={`text-4xl md:text-5xl leading-none ${suit.color}`}>{suit.symbol}</span>
      <span className={`text-sm md:text-base font-mono leading-none rotate-180 ${suit.color}`}>{card.rank}</span>
    </div>
  );
}

function HandDisplay({ hand, total, name, isBust, showAll = true, align = 'left' }) {
  const handAlignment = align === 'right' ? 'justify-end' : 'justify-start';

  return (
    <div className="flex-1 flex flex-col items-center gap-3 md:gap-4 min-w-0 relative">
      <div
        className="text-base md:text-xl font-headline text-on-surface-variant truncate max-w-full"
        style={{ textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}
      >
        {name}
      </div>

      <div className={`w-full flex items-end ${handAlignment} min-h-[124px] md:min-h-[156px]`}>
        {hand.map((card, i) => (
          <PlayingCard
            key={`${card.suit}-${card.rank}-${i}`}
            card={card}
            faceDown={!showAll && card.hidden}
            animate={card.isNew}
          />
        ))}
        {hand.length === 0 && (
          <div className="w-20 h-28 md:w-24 md:h-36 rounded-xl border border-dashed border-white/10" />
        )}
      </div>

      <div className="relative">
        {isBust && (
          <div className="absolute -inset-x-2 -inset-y-0.5 bg-red-500/20 rounded border border-red-500/30 flex items-center justify-center">
            <span className="text-xs font-headline text-red-400 tracking-wider">BUST</span>
          </div>
        )}
        <span
          className={`text-4xl md:text-5xl font-headline tabular-nums ${isBust ? 'text-red-400 opacity-0' : 'text-emerald-300'}`}
          style={{ textShadow: '0 0 12px rgba(16, 185, 129, 0.4)' }}
        >
          {total != null ? total : '—'}
        </span>
      </div>
    </div>
  );
}

function CommentaryBubble({ name, text }) {
  if (!text) return null;
  return (
    <div className="flex items-start gap-3 px-4 animate-fade-in">
      <span className="text-sm md:text-base font-headline text-emerald-400 shrink-0">{name}:</span>
      <span className="text-sm md:text-base font-headline text-on-surface-variant/80 italic">{text}</span>
    </div>
  );
}

export default function CardGamePanel({
  combat,
  character,
  dispatch,
  onEndCombat,
  isMultiplayer = false,
  mpCharacters,
}) {
  const { t } = useTranslation();
  const playSfx = useMinigameAudio();

  const playerCombatant = combat.combatants.find((c) => c.type === 'player');
  const enemyCombatant = combat.combatants.find((c) => c.type === 'enemy');
  const npcDifficulty = combat.modeConfig?.difficulty || 'medium';
  const anteGold = combat.modeConfig?.anteGold || 5;

  const {
    phase,
    countdownSec,
    round,
    totalRounds,
    playerHand,
    playerTotal,
    playerBust,
    opponentHand,
    opponentTotal,
    opponentBust,
    opponentShowAll,
    playerScore,
    opponentScore,
    goldDelta,
    winnerId,
    commentary,
    hit: rawHit,
    stand: rawStand,
    forfeit,
  } = useCardGame({
    playerId: playerCombatant?.id || 'player',
    playerName: character?.name || playerCombatant?.name || 'Gracz',
    opponentId: enemyCombatant?.id || 'opponent',
    opponentName: enemyCombatant?.name || 'Przeciwnik',
    difficulty: npcDifficulty,
    anteGold,
  });

  const playerName = character?.name || playerCombatant?.name || 'Gracz';
  const opponentName = enemyCombatant?.name || 'Przeciwnik';

  const isPlaying = phase === 'player_turn';
  const isFinished = phase === 'finished';

  // ── SFX on actions ──
  const hit = useCallback(() => { playSfx('cardHit'); rawHit(); }, [rawHit, playSfx]);
  const stand = useCallback(() => { playSfx('cardStand'); rawStand(); }, [rawStand, playSfx]);

  // ── SFX on phase transitions ──
  const prevPhaseRef = useRef(phase);
  const prevCountdownRef = useRef(countdownSec);

  useEffect(() => {
    if (countdownSec !== prevCountdownRef.current && phase === 'countdown' && countdownSec > 0) {
      playSfx(countdownSec === 1 ? 'countdownLast' : 'countdown');
    }
    prevCountdownRef.current = countdownSec;
  }, [countdownSec, phase, playSfx]);

  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;
    if (prev === phase) return;

    if (phase === 'dealing') playSfx('cardDeal');
    if (phase === 'opponent_turn' && playerBust) playSfx('cardBust');
    if (phase === 'round_result') {
      if (playerBust || opponentBust) playSfx('cardBust');
    }
    if (phase === 'finished') {
      const playerWon = winnerId === (playerCombatant?.id || 'player');
      playSfx(playerWon ? 'success' : winnerId == null ? 'failure' : 'failure');
    }
  }, [phase, playerBust, opponentBust, winnerId, playerCombatant, playSfx]);

  const buildSummary = useCallback(() => {
    const playerWon = winnerId === (playerCombatant?.id || 'player');
    const tie = winnerId === null;
    const winnerLabel = tie ? null : (playerWon ? playerName : opponentName);

    return {
      mode: 'card_game',
      outcome: playerWon ? 'victory' : (tie ? 'draw' : 'defeat'),
      playerSurvived: true,
      rounds: round,
      woundsChange: 0,
      manaChange: 0,
      skillProgress: null,
      combatStats: null,
      enemiesDefeated: 0,
      totalEnemies: 1,
      flawless: false,
      skirmishSummary: {
        type: 'card_game',
        playerScore,
        opponentScore,
        goldChange: goldDelta,
        winnerName: winnerLabel,
        isTie: tie,
      },
    };
  }, [winnerId, round, playerScore, opponentScore, goldDelta, playerName, opponentName, playerCombatant]);

  const playerWon = winnerId === (playerCombatant?.id || 'player');
  const tie = winnerId === null;

  return (
    <div className="h-full flex flex-col justify-between gap-6 md:gap-7 p-6 md:p-8 rounded-2xl border border-emerald-500/25 bg-surface-container/85 backdrop-blur-md relative overflow-hidden animate-fade-in shadow-[0_20px_80px_rgba(0,0,0,0.45)]">

      {/* ── Countdown overlay ── */}
      {phase === 'countdown' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/75 backdrop-blur-sm">
          <div
            key={countdownSec}
            className="text-8xl font-headline text-emerald-300 animate-beer-countdown"
            style={{ textShadow: '0 0 40px rgba(16, 185, 129, 0.6), 0 4px 8px rgba(0,0,0,0.8)' }}
          >
            {countdownSec}
          </div>
        </div>
      )}

      {/* ── Finished overlay ── */}
      {isFinished && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm gap-4 animate-fade-in">
          <div
            className={`text-3xl font-headline ${playerWon ? 'text-emerald-300' : tie ? 'text-on-surface-variant' : 'text-red-400'}`}
            style={{
              textShadow: playerWon
                ? '0 0 30px rgba(16, 185, 129, 0.6), 0 2px 4px rgba(0,0,0,0.6)'
                : '0 2px 4px rgba(0,0,0,0.6)',
            }}
          >
            {tie
              ? t('cardGame.draw', 'Remis!')
              : playerWon
                ? t('cardGame.youWin', 'Wygrałeś!')
                : t('cardGame.youLose', 'Przegrałeś!')}
          </div>

          <div className="flex items-center gap-6 text-sm">
            <div className="text-center">
              <div className="text-on-surface-variant font-headline text-xs">{playerName}</div>
              <div className="text-2xl font-headline text-emerald-300 mt-1">{playerScore}</div>
            </div>
            <div className="font-headline text-lg text-on-surface-variant/50" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
              vs
            </div>
            <div className="text-center">
              <div className="text-on-surface-variant font-headline text-xs">{opponentName}</div>
              <div className="text-2xl font-headline text-emerald-300 mt-1">{opponentScore}</div>
            </div>
          </div>

          {goldDelta !== 0 && (
            <div className={`text-sm font-mono ${goldDelta > 0 ? 'text-amber-300' : 'text-red-400'}`}>
              {goldDelta > 0 ? '+' : ''}{goldDelta} MK
            </div>
          )}

          <button
            onClick={() => onEndCombat?.(buildSummary())}
            className="mt-2 px-6 py-2.5 rounded-lg font-headline text-sm
              border border-emerald-500/50 bg-emerald-600/25 text-emerald-200
              hover:bg-emerald-500/40 hover:border-emerald-400/70 hover:text-emerald-100
              hover:shadow-[0_0_16px_rgba(16,185,129,0.3)]
              active:scale-95 transition-all duration-150"
          >
            {t('cardGame.exit', 'Wyjdź')}
          </button>
        </div>
      )}

      {/* ── Scoreboard header ── */}
      <div className="relative flex items-center min-h-11 text-sm md:text-base font-headline text-on-surface-variant px-1">
        <span className="shrink-0">
          {t('cardGame.round', {
            current: round,
            total: totalRounds,
            defaultValue: 'Runda {{current}}/{{total}}',
          })}
        </span>
        <span className="absolute left-1/2 -translate-x-1/2 font-mono text-3xl md:text-4xl text-on-surface tabular-nums">
          {playerScore} – {opponentScore}
        </span>
        {goldDelta !== 0 && (
          <span className={`ml-auto text-base md:text-lg font-mono tabular-nums ${goldDelta > 0 ? 'text-amber-300' : 'text-red-400'}`}>
            {goldDelta > 0 ? '+' : ''}{goldDelta} MK
          </span>
        )}
        {goldDelta === 0 && <span className="ml-auto" />}
      </div>

      {/* ── Card table — two hands ── */}
      <div className="grid grid-cols-[minmax(0,1fr)_clamp(4rem,6vw,6rem)_minmax(0,1fr)] items-start gap-0">
        <HandDisplay
          hand={playerHand}
          total={playerTotal}
          name={playerName}
          isBust={playerBust}
          align="right"
        />

        <div className="flex flex-col items-center justify-start pt-12 md:pt-16">
          <div
            className="w-10 h-10 md:w-12 md:h-12 rounded-full border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center"
            style={{ boxShadow: '0 0 10px rgba(16, 185, 129, 0.15)' }}
          >
            <span
              className="font-headline text-xs md:text-sm text-emerald-400/70"
              style={{ textShadow: '0 0 6px rgba(16,185,129,0.3)' }}
            >
              vs
            </span>
          </div>
          <div className="h-24 md:h-32 w-px bg-gradient-to-b from-emerald-500/20 via-emerald-500/10 to-transparent mt-2" />
        </div>

        <HandDisplay
          hand={opponentHand}
          total={opponentShowAll ? opponentTotal : null}
          name={opponentName}
          isBust={opponentBust}
          showAll={opponentShowAll}
          align="left"
        />
      </div>

      {/* ── Commentary bubble ── */}
      <CommentaryBubble name={opponentName} text={commentary} />

      {/* ── Action buttons ── */}
      <div className="flex items-center justify-center gap-4 md:gap-5">
        <button
          onClick={hit}
          disabled={!isPlaying}
          className="flex items-center gap-2 px-6 md:px-8 py-3 md:py-4 rounded-xl font-headline text-base md:text-lg
            border border-emerald-500/50 bg-emerald-600/20 text-emerald-300
            hover:bg-emerald-500/35 hover:border-emerald-400/70 hover:shadow-[0_0_12px_rgba(16,185,129,0.3)]
            active:scale-95 transition-all duration-150
            disabled:opacity-30 disabled:cursor-not-allowed disabled:scale-100"
        >
          <span className="material-symbols-outlined text-2xl md:text-3xl">add_card</span>
          {t('cardGame.hit', 'Dobierz')}
        </button>

        <button
          onClick={stand}
          disabled={!isPlaying}
          className="flex items-center gap-2 px-6 md:px-8 py-3 md:py-4 rounded-xl font-headline text-base md:text-lg
            border border-blue-500/50 bg-blue-600/20 text-blue-300
            hover:bg-blue-500/35 hover:border-blue-400/70 hover:shadow-[0_0_12px_rgba(59,130,246,0.3)]
            active:scale-95 transition-all duration-150
            disabled:opacity-30 disabled:cursor-not-allowed disabled:scale-100"
        >
          <span className="material-symbols-outlined text-2xl md:text-3xl">front_hand</span>
          {t('cardGame.stand', 'Stój')}
        </button>

        <button
          onClick={forfeit}
          disabled={phase === 'finished' || phase === 'countdown'}
          className="flex items-center gap-2 px-6 md:px-8 py-3 md:py-4 rounded-xl font-headline text-base md:text-lg
            border border-rose-500/50 bg-rose-600/20 text-rose-300
            hover:bg-rose-500/35 hover:border-rose-400/70 hover:shadow-[0_0_12px_rgba(244,63,94,0.3)]
            active:scale-95 transition-all duration-150
            disabled:opacity-30 disabled:cursor-not-allowed disabled:scale-100"
        >
          <span className="material-symbols-outlined text-2xl md:text-3xl">logout</span>
          {t('cardGame.forfeit', 'Poddaj')}
        </button>
      </div>
    </div>
  );
}
