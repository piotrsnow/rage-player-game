import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useBeerDuel, BEER_DUEL_DURATION_MS } from '../../../hooks/useBeerDuel';

function StatBar({ value, max, colorClass }) {
  const pct = Math.min(100, (value / max) * 100);
  const bg =
    pct >= 80 ? 'bg-red-500' :
    pct >= 50 ? 'bg-yellow-500' :
    'bg-emerald-500';
  return (
    <div className="h-4 w-full rounded-sm overflow-hidden bg-white/10 border border-white/10">
      <div
        className={`h-full transition-all duration-150 ${colorClass || bg}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function CooldownButton({ label, onClick, cooldownUntil, disabled, className }) {
  const now = Date.now();
  const remaining = Math.max(0, (cooldownUntil || 0) - now);
  const onCd = remaining > 0;
  const cdSec = Math.ceil(remaining / 1000);

  return (
    <button
      onClick={onClick}
      disabled={disabled || onCd}
      className={`
        relative px-4 py-2.5 rounded-md font-bold text-sm
        transition-all duration-150
        disabled:opacity-40 disabled:cursor-not-allowed
        ${className}
      `}
    >
      {label}
      {onCd && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-md text-xs font-mono text-white/80">
          {cdSec}s
        </span>
      )}
    </button>
  );
}

function PlayerColumn({ player, max, isLocal, onDrink, onPee, onVomit, disabled, t }) {
  return (
    <div className="flex-1 flex flex-col gap-3 min-w-0">
      <div className="text-center">
        <div className="text-sm text-on-surface-variant truncate">{player.name}</div>
        <div className={`text-4xl font-black tabular-nums leading-none mt-1 ${player.isEliminated ? 'text-red-400 line-through' : 'text-amber-300'}`}>
          {player.beersDrunk}
        </div>
        <div className="text-[10px] text-on-surface-variant mt-0.5">{t('beerDuel.beers', 'piw')}</div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] w-14 text-right text-on-surface-variant">{t('beerDuel.pee', 'Sikanie')}</span>
          <div className="flex-1">
            <StatBar value={player.pee} max={max} />
          </div>
          <span className="text-xs font-mono w-6 text-right tabular-nums">{player.pee}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] w-14 text-right text-on-surface-variant">{t('beerDuel.vomit', 'Rzyganie')}</span>
          <div className="flex-1">
            <StatBar value={player.vomit} max={max} />
          </div>
          <span className="text-xs font-mono w-6 text-right tabular-nums">{player.vomit}</span>
        </div>
      </div>

      {isLocal && (
        <div className="flex flex-col gap-1.5 mt-1">
          <button
            onClick={onDrink}
            disabled={disabled}
            className="px-3 py-2.5 rounded-md font-bold text-sm bg-amber-600 hover:bg-amber-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            🍺 {t('beerDuel.drink', 'PIWO')}
          </button>
          <CooldownButton
            label={`🚽 ${t('beerDuel.toilet', 'TOALETA')}`}
            onClick={onPee}
            cooldownUntil={player.peeCooldownUntil}
            disabled={disabled || player.pee === 0}
            className="bg-blue-700 hover:bg-blue-600 text-white"
          />
          <CooldownButton
            label={`🤮 ${t('beerDuel.throwUp', 'RZYGANIE')}`}
            onClick={onVomit}
            cooldownUntil={player.vomitCooldownUntil}
            disabled={disabled || player.vomit === 0}
            className="bg-green-800 hover:bg-green-700 text-white"
          />
        </div>
      )}
    </div>
  );
}

function formatTime(ms) {
  const totalSec = Math.ceil(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

export default function BeerDuelPanel({
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

  const {
    phase,
    countdownSec,
    timeRemainingMs,
    player,
    opponent,
    winnerId,
    drinkBeer,
    useRelief,
    constants,
  } = useBeerDuel({
    playerId: playerCombatant?.id || 'player',
    playerName: character?.name || playerCombatant?.name || 'Player',
    opponentId: enemyCombatant?.id || 'opponent',
    opponentName: enemyCombatant?.name || 'Opponent',
    difficulty: npcDifficulty,
    isMultiplayer,
  });

  const isPlaying = phase === 'playing';
  const isFinished = phase === 'finished';

  // Build a summary compatible with useCombatResolution when finished
  useEffect(() => {
    if (!isFinished) return;

    const playerWon = winnerId === player.id;
    const tie = winnerId === null;
    const winnerLabel = tie ? 'draw' : (playerWon ? player.name : opponent.name);

    const summary = {
      mode: 'beer_duel',
      outcome: playerWon ? 'victory' : (tie ? 'draw' : 'defeat'),
      playerSurvived: !player.isEliminated,
      rounds: 0,
      woundsChange: 0,
      manaChange: 0,
      skillProgress: null,
      combatStats: null,
      enemiesDefeated: 0,
      totalEnemies: 1,
      flawless: false,
      skirmishSummary: {
        type: 'beer_duel',
        beersCollectedByPlayer: player.beersDrunk,
        winnerIds: winnerId ? [winnerId] : [],
        winnerName: winnerLabel,
        isTie: tie,
        playerPee: player.pee,
        playerVomit: player.vomit,
        opponentBeers: opponent.beersDrunk,
      },
    };

    const timer = setTimeout(() => onEndCombat?.(summary), 2500);
    return () => clearTimeout(timer);
  }, [isFinished, winnerId, player, opponent, onEndCombat]);

  const timerColor =
    timeRemainingMs < 10_000 ? 'text-red-400 animate-pulse' :
    timeRemainingMs < 30_000 ? 'text-yellow-300' :
    'text-on-surface';

  return (
    <div className="flex flex-col gap-3 p-3 rounded-lg border border-yellow-500/20 bg-surface-container/80 backdrop-blur relative overflow-hidden">
      {/* Countdown overlay */}
      {phase === 'countdown' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="text-7xl font-black text-amber-300 animate-bounce tabular-nums">
            {countdownSec}
          </div>
        </div>
      )}

      {/* Finished overlay */}
      {isFinished && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm gap-3">
          <div className="text-2xl font-black text-amber-300">
            {winnerId === null
              ? t('beerDuel.draw', 'Remis!')
              : winnerId === player.id
                ? t('beerDuel.youWin', 'Wygrałeś!')
                : t('beerDuel.youLose', 'Przegrałeś!')}
          </div>
          <div className="flex gap-6 text-sm">
            <div className="text-center">
              <div className="text-on-surface-variant">{player.name}</div>
              <div className="text-2xl font-bold text-amber-300">{player.beersDrunk}</div>
            </div>
            <div className="text-on-surface-variant self-center">vs</div>
            <div className="text-center">
              <div className="text-on-surface-variant">{opponent.name}</div>
              <div className="text-2xl font-bold text-amber-300">{opponent.beersDrunk}</div>
            </div>
          </div>
          {(player.isEliminated || opponent.isEliminated) && (
            <div className="text-xs text-red-400">
              {player.isEliminated && opponent.isEliminated
                ? t('beerDuel.bothEliminated', 'Obaj nie wytrzymali!')
                : player.isEliminated
                  ? t('beerDuel.playerEliminated', 'Nie wytrzymałeś...')
                  : t('beerDuel.opponentEliminated', '{{name}} nie wytrzymał!', { name: opponent.name })}
            </div>
          )}
        </div>
      )}

      {/* Timer */}
      <div className="text-center">
        <span className={`text-2xl font-mono font-bold tabular-nums ${timerColor}`}>
          {formatTime(timeRemainingMs)}
        </span>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-4">
        <PlayerColumn
          player={player}
          max={constants.MAX_STAT}
          isLocal
          onDrink={drinkBeer}
          onPee={() => useRelief('pee')}
          onVomit={() => useRelief('vomit')}
          disabled={!isPlaying}
          t={t}
        />

        <div className="w-px bg-white/10 self-stretch" />

        <PlayerColumn
          player={opponent}
          max={constants.MAX_STAT}
          isLocal={false}
          disabled
          t={t}
        />
      </div>
    </div>
  );
}
