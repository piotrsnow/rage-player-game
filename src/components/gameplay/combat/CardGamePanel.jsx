import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useCardGame } from '../../../hooks/useCardGame';

const SUIT_CONFIG = {
  hearts:   { symbol: '♥', color: 'text-red-500' },
  diamonds: { symbol: '♦', color: 'text-red-500' },
  clubs:    { symbol: '♣', color: 'text-white' },
  spades:   { symbol: '♠', color: 'text-white' },
};

function PlayingCard({ card, faceDown = false, animate = false }) {
  if (faceDown) {
    return (
      <div className="w-12 h-16 rounded-md border border-emerald-500/30 bg-emerald-900/60 flex items-center justify-center shrink-0 -ml-3 first:ml-0 shadow-md">
        <div className="w-8 h-12 rounded-sm border border-emerald-400/20 bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(16,185,129,0.15)_3px,rgba(16,185,129,0.15)_6px)]" />
      </div>
    );
  }

  const suit = SUIT_CONFIG[card.suit] || SUIT_CONFIG['♠'];
  return (
    <div
      className={`
        w-12 h-16 rounded-md border border-white/15 bg-white/[0.08] backdrop-blur-sm
        flex flex-col items-center justify-between py-1 px-0.5 shrink-0
        -ml-3 first:ml-0 shadow-md
        ${animate ? 'animate-card-deal' : ''}
      `}
    >
      <span className={`text-[10px] font-mono leading-none ${suit.color}`}>{card.rank}</span>
      <span className={`text-lg leading-none ${suit.color}`}>{suit.symbol}</span>
      <span className={`text-[10px] font-mono leading-none rotate-180 ${suit.color}`}>{card.rank}</span>
    </div>
  );
}

function HandDisplay({ hand, total, name, isBust, showAll = true }) {
  return (
    <div className="flex-1 flex flex-col items-center gap-2 min-w-0 relative">
      <div
        className="text-sm font-accent text-on-surface-variant truncate max-w-full"
        style={{ textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}
      >
        {name}
      </div>

      <div className="flex items-end justify-center pl-3 min-h-[68px]">
        {hand.map((card, i) => (
          <PlayingCard
            key={`${card.suit}-${card.rank}-${i}`}
            card={card}
            faceDown={!showAll && card.hidden}
            animate={card.isNew}
          />
        ))}
        {hand.length === 0 && (
          <div className="w-12 h-16 rounded-md border border-dashed border-white/10" />
        )}
      </div>

      <div className="relative">
        {isBust && (
          <div className="absolute -inset-x-2 -inset-y-0.5 bg-red-500/20 rounded border border-red-500/30 flex items-center justify-center">
            <span className="text-xs font-headline text-red-400 tracking-wider">BUST</span>
          </div>
        )}
        <span
          className={`text-xl font-headline tabular-nums ${isBust ? 'text-red-400 opacity-0' : 'text-emerald-300'}`}
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
    <div className="flex items-start gap-2 px-2 animate-fade-in">
      <span className="text-xs font-accent text-emerald-400 shrink-0">{name}:</span>
      <span className="text-xs font-body text-on-surface-variant/80 italic">{text}</span>
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
    hit,
    stand,
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
    <div className="flex flex-col gap-4 p-4 rounded-xl border border-emerald-500/25 bg-surface-container/80 backdrop-blur-md relative overflow-hidden animate-fade-in">

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
              <div className="text-on-surface-variant font-accent text-xs">{playerName}</div>
              <div className="text-2xl font-headline text-emerald-300 mt-1">{playerScore}</div>
            </div>
            <div className="font-accent text-lg text-on-surface-variant/50" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
              vs
            </div>
            <div className="text-center">
              <div className="text-on-surface-variant font-accent text-xs">{opponentName}</div>
              <div className="text-2xl font-headline text-emerald-300 mt-1">{opponentScore}</div>
            </div>
          </div>

          {goldDelta !== 0 && (
            <div className={`text-sm font-accent ${goldDelta > 0 ? 'text-amber-300' : 'text-red-400'}`}>
              {goldDelta > 0 ? '+' : ''}{goldDelta} MK
            </div>
          )}

          <button
            onClick={() => onEndCombat?.(buildSummary())}
            className="mt-2 px-6 py-2.5 rounded-lg font-accent text-sm
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
      <div className="flex items-center justify-between text-xs font-label text-on-surface-variant px-1">
        <span>
          {t('cardGame.round', 'Runda')} {round}/{totalRounds}
        </span>
        <span className="font-headline text-sm text-on-surface tabular-nums">
          {playerScore} – {opponentScore}
        </span>
        {goldDelta !== 0 && (
          <span className={`tabular-nums ${goldDelta > 0 ? 'text-amber-300' : 'text-red-400'}`}>
            {goldDelta > 0 ? '+' : ''}{goldDelta} MK
          </span>
        )}
        {goldDelta === 0 && <span />}
      </div>

      {/* ── Card table — two hands ── */}
      <div className="flex items-start gap-0">
        <HandDisplay
          hand={playerHand}
          total={playerTotal}
          name={playerName}
          isBust={playerBust}
        />

        <div className="flex flex-col items-center justify-start pt-6 px-1">
          <div
            className="w-9 h-9 rounded-full border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center"
            style={{ boxShadow: '0 0 10px rgba(16, 185, 129, 0.15)' }}
          >
            <span
              className="font-accent text-xs text-emerald-400/70"
              style={{ textShadow: '0 0 6px rgba(16,185,129,0.3)' }}
            >
              vs
            </span>
          </div>
          <div className="w-px flex-1 bg-gradient-to-b from-emerald-500/20 via-emerald-500/10 to-transparent mt-2" />
        </div>

        <HandDisplay
          hand={opponentHand}
          total={opponentShowAll ? opponentTotal : null}
          name={opponentName}
          isBust={opponentBust}
          showAll={opponentShowAll}
        />
      </div>

      {/* ── Commentary bubble ── */}
      <CommentaryBubble name={opponentName} text={commentary} />

      {/* ── Action buttons ── */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={hit}
          disabled={!isPlaying}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-accent text-sm
            border border-emerald-500/50 bg-emerald-600/20 text-emerald-300
            hover:bg-emerald-500/35 hover:border-emerald-400/70 hover:shadow-[0_0_12px_rgba(16,185,129,0.3)]
            active:scale-95 transition-all duration-150
            disabled:opacity-30 disabled:cursor-not-allowed disabled:scale-100"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add_card</span>
          {t('cardGame.hit', 'Dobierz')}
        </button>

        <button
          onClick={stand}
          disabled={!isPlaying}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-accent text-sm
            border border-blue-500/50 bg-blue-600/20 text-blue-300
            hover:bg-blue-500/35 hover:border-blue-400/70 hover:shadow-[0_0_12px_rgba(59,130,246,0.3)]
            active:scale-95 transition-all duration-150
            disabled:opacity-30 disabled:cursor-not-allowed disabled:scale-100"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>front_hand</span>
          {t('cardGame.stand', 'Stój')}
        </button>

        <button
          onClick={forfeit}
          disabled={phase === 'finished' || phase === 'countdown'}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-accent text-sm
            border border-rose-500/50 bg-rose-600/20 text-rose-300
            hover:bg-rose-500/35 hover:border-rose-400/70 hover:shadow-[0_0_12px_rgba(244,63,94,0.3)]
            active:scale-95 transition-all duration-150
            disabled:opacity-30 disabled:cursor-not-allowed disabled:scale-100"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>logout</span>
          {t('cardGame.forfeit', 'Poddaj')}
        </button>
      </div>
    </div>
  );
}
