import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useBeerDuel } from '../../../hooks/useBeerDuel';

const COOLDOWN_RING_R = 19;
const COOLDOWN_RING_C = 2 * Math.PI * COOLDOWN_RING_R;

function StatBar({ value, max, label }) {
  const pct = Math.min(100, (value / max) * 100);
  const isDanger = value >= 8;

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] w-16 text-right text-on-surface-variant font-body truncate">
        {label}
      </span>
      <div className="flex-1 relative">
        <div
          className={`h-3.5 w-full rounded-full overflow-hidden bg-white/[0.06] border border-white/[0.08] ${isDanger ? 'animate-beer-stat-danger' : ''}`}
        >
          <div
            className="h-full rounded-full transition-all duration-200 ease-out"
            style={{
              width: `${pct}%`,
              background: pct >= 80
                ? 'linear-gradient(90deg, #ef4444, #dc2626)'
                : pct >= 50
                  ? 'linear-gradient(90deg, #eab308, #f59e0b)'
                  : 'linear-gradient(90deg, #22c55e, #10b981)',
              boxShadow: isDanger ? '0 0 8px rgba(239, 68, 68, 0.5)' : 'none',
            }}
          />
        </div>
      </div>
      <span className="text-xs font-mono w-5 text-right tabular-nums text-on-surface-variant">
        {value}
      </span>
    </div>
  );
}

function CooldownRing({ cooldownUntil, cooldownDuration }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!cooldownUntil) { setProgress(0); return; }
    const id = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, cooldownUntil - now);
      setProgress(remaining / cooldownDuration);
      if (remaining <= 0) clearInterval(id);
    }, 50);
    return () => clearInterval(id);
  }, [cooldownUntil, cooldownDuration]);

  if (progress <= 0) return null;

  const offset = COOLDOWN_RING_C * (1 - progress);
  return (
    <svg className="absolute inset-0 -rotate-90 pointer-events-none" viewBox="0 0 44 44">
      <circle
        cx="22" cy="22" r={COOLDOWN_RING_R}
        fill="none"
        stroke="rgba(255,255,255,0.15)"
        strokeWidth="3"
      />
      <circle
        cx="22" cy="22" r={COOLDOWN_RING_R}
        fill="none"
        stroke="rgba(255,255,255,0.7)"
        strokeWidth="3"
        strokeDasharray={COOLDOWN_RING_C}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="beer-cooldown-ring"
      />
    </svg>
  );
}

function ActionButton({ icon, onClick, disabled, size = 44, colorClass, title, cooldownUntil, cooldownDuration }) {
  const [gulping, setGulping] = useState(false);
  const btnRef = useRef(null);

  const handleClick = useCallback(() => {
    if (disabled) return;
    onClick?.();
    setGulping(true);
  }, [disabled, onClick]);

  useEffect(() => {
    if (!gulping) return;
    const el = btnRef.current;
    if (!el) return;
    const handler = () => setGulping(false);
    el.addEventListener('animationend', handler);
    return () => el.removeEventListener('animationend', handler);
  }, [gulping]);

  const isOnCooldown = cooldownUntil && Date.now() < cooldownUntil;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {cooldownUntil > 0 && (
        <CooldownRing cooldownUntil={cooldownUntil} cooldownDuration={cooldownDuration} />
      )}
      <button
        ref={btnRef}
        onClick={handleClick}
        disabled={disabled || isOnCooldown}
        title={title}
        className={`
          relative w-full h-full rounded-full flex items-center justify-center
          border-2 transition-all duration-150
          disabled:opacity-30 disabled:cursor-not-allowed disabled:scale-100
          hover:scale-110 active:scale-95
          ${colorClass}
          ${gulping ? 'animate-beer-gulp' : ''}
        `}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: size > 48 ? 28 : 22 }}
        >
          {icon}
        </span>
      </button>
    </div>
  );
}

function BeerCount({ count }) {
  return (
    <div className="relative">
      <div
        key={count}
        className="text-5xl font-headline tabular-nums leading-none text-amber-300 animate-beer-count-pop"
        style={{ textShadow: '0 0 20px rgba(251, 191, 36, 0.4), 0 2px 4px rgba(0,0,0,0.5)' }}
      >
        {count}
      </div>
    </div>
  );
}

function PlayerColumn({ player, max, isLocal, onDrink, onPee, onVomit, disabled, t, peeCD, vomitCD }) {
  return (
    <div className={`flex-1 flex flex-col gap-3 min-w-0 ${player.isEliminated ? 'beer-eliminated' : ''}`}>
      <div className="text-center">
        <div
          className="text-sm font-accent text-on-surface-variant truncate"
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}
        >
          {player.name}
        </div>
        <div className="mt-2 mb-1">
          <BeerCount count={player.beersDrunk} />
        </div>
        <div className="text-[10px] text-on-surface-variant/60 font-body tracking-wider uppercase">
          {t('beerDuel.beers', 'piw')}
        </div>
      </div>

      <div className="space-y-1.5">
        <StatBar value={player.pee} max={max} label={t('beerDuel.pee', 'Sikanie')} />
        <StatBar value={player.vomit} max={max} label={t('beerDuel.vomit', 'Rzyganie')} />
      </div>

      {isLocal && (
        <div className="flex items-center justify-center gap-3 mt-2">
          <ActionButton
            icon="wc"
            onClick={onPee}
            disabled={disabled || player.pee === 0}
            cooldownUntil={player.peeCooldownUntil}
            cooldownDuration={peeCD}
            size={42}
            colorClass="border-blue-500/50 bg-blue-600/20 text-blue-300 hover:bg-blue-500/30 hover:border-blue-400/70 hover:shadow-[0_0_12px_rgba(59,130,246,0.3)]"
            title={t('beerDuel.toilet', 'TOALETA')}
          />
          <ActionButton
            icon="sports_bar"
            onClick={onDrink}
            disabled={disabled}
            size={56}
            colorClass="border-amber-500/60 bg-amber-600/25 text-amber-300 hover:bg-amber-500/40 hover:border-amber-400/80 hover:shadow-[0_0_16px_rgba(245,158,11,0.4)]"
            title={t('beerDuel.drink', 'PIWO')}
          />
          <ActionButton
            icon="sick"
            onClick={onVomit}
            disabled={disabled || player.vomit === 0}
            cooldownUntil={player.vomitCooldownUntil}
            cooldownDuration={vomitCD}
            size={42}
            colorClass="border-emerald-500/50 bg-emerald-600/20 text-emerald-300 hover:bg-emerald-500/30 hover:border-emerald-400/70 hover:shadow-[0_0_12px_rgba(16,185,129,0.3)]"
            title={t('beerDuel.throwUp', 'RZYGANIE')}
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

  const timerClasses =
    timeRemainingMs < 10_000 ? 'text-red-400 animate-beer-timer-urgent' :
    timeRemainingMs < 30_000 ? 'text-yellow-300' :
    'text-on-surface';

  const playerWon = winnerId === player.id;
  const tie = winnerId === null;

  return (
    <div className="flex flex-col gap-4 p-4 rounded-xl border border-amber-500/25 bg-surface-container/80 backdrop-blur-md relative overflow-hidden animate-beer-panel-in animate-beer-panel-glow">
      {/* Countdown overlay */}
      {phase === 'countdown' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/75 backdrop-blur-sm">
          <div
            key={countdownSec}
            className="text-8xl font-headline text-amber-300 animate-beer-countdown"
            style={{ textShadow: '0 0 40px rgba(251, 191, 36, 0.6), 0 4px 8px rgba(0,0,0,0.8)' }}
          >
            {countdownSec}
          </div>
        </div>
      )}

      {/* Finished overlay */}
      {isFinished && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm gap-4 animate-fade-in">
          {!tie && <div className="absolute inset-0 animate-beer-victory-sweep" />}

          <div
            className={`relative text-3xl font-headline ${playerWon ? 'text-amber-300' : tie ? 'text-on-surface-variant' : 'text-red-400'}`}
            style={{
              textShadow: playerWon
                ? '0 0 30px rgba(251, 191, 36, 0.6), 0 2px 4px rgba(0,0,0,0.6)'
                : '0 2px 4px rgba(0,0,0,0.6)',
            }}
          >
            {tie
              ? t('beerDuel.draw', 'Remis!')
              : playerWon
                ? t('beerDuel.youWin', 'Wygrałeś!')
                : t('beerDuel.youLose', 'Przegrałeś!')}
          </div>

          <div className="relative flex items-center gap-6 text-sm">
            <div className="text-center">
              <div className="text-on-surface-variant font-accent text-xs">{player.name}</div>
              <div
                className="text-3xl font-headline text-amber-300 mt-1"
                style={{ textShadow: '0 0 12px rgba(251,191,36,0.3)' }}
              >
                {player.beersDrunk}
              </div>
            </div>
            <div
              className="font-accent text-lg text-on-surface-variant/50"
              style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
            >
              vs
            </div>
            <div className="text-center">
              <div className="text-on-surface-variant font-accent text-xs">{opponent.name}</div>
              <div
                className="text-3xl font-headline text-amber-300 mt-1"
                style={{ textShadow: '0 0 12px rgba(251,191,36,0.3)' }}
              >
                {opponent.beersDrunk}
              </div>
            </div>
          </div>

          {(player.isEliminated || opponent.isEliminated) && (
            <div className="relative text-xs text-red-400/80 font-body">
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
        <span className={`text-2xl font-mono font-bold tabular-nums ${timerClasses}`}>
          {formatTime(timeRemainingMs)}
        </span>
      </div>

      {/* Two-column layout with VS badge */}
      <div className="flex items-start gap-0">
        <PlayerColumn
          player={player}
          max={constants.MAX_STAT}
          isLocal
          onDrink={drinkBeer}
          onPee={() => useRelief('pee')}
          onVomit={() => useRelief('vomit')}
          disabled={!isPlaying}
          t={t}
          peeCD={constants.PEE_COOLDOWN_MS}
          vomitCD={constants.VOMIT_COOLDOWN_MS}
        />

        <div className="flex flex-col items-center justify-start pt-6 px-1">
          <div
            className="w-9 h-9 rounded-full border border-amber-500/30 bg-amber-500/10 flex items-center justify-center"
            style={{ boxShadow: '0 0 10px rgba(245, 158, 11, 0.15)' }}
          >
            <span
              className="font-accent text-xs text-amber-400/70"
              style={{ textShadow: '0 0 6px rgba(245,158,11,0.3)' }}
            >
              vs
            </span>
          </div>
          <div className="w-px flex-1 bg-gradient-to-b from-amber-500/20 via-amber-500/10 to-transparent mt-2" />
        </div>

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
