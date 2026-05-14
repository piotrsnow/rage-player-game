import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useBeerDuel } from '../../../hooks/useBeerDuel';
import { playBeerSfx } from '../../../services/beerDuelAudio';
import { useCombatSprites } from '../../../hooks/useCombatSprites';
import LpcSprite from '../../shared/LpcSprite';

const COOLDOWN_RING_R = 19;
const COOLDOWN_RING_C = 2 * Math.PI * COOLDOWN_RING_R;

const BAR_COLORS = {
  blue: {
    fill: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
    pending: 'linear-gradient(90deg, rgba(59,130,246,0.3), rgba(96,165,250,0.3))',
    dangerShadow: '0 0 8px rgba(59, 130, 246, 0.5)',
  },
  green: {
    fill: 'linear-gradient(90deg, #10b981, #34d399)',
    pending: 'linear-gradient(90deg, rgba(16,185,129,0.3), rgba(52,211,153,0.3))',
    dangerShadow: '0 0 8px rgba(16, 185, 129, 0.5)',
  },
};

function StatBar({ value, max, pending = 0, label, color }) {
  const pct = Math.min(100, (value / max) * 100);
  const pendingPct = Math.min(100 - pct, (pending / max) * 100);
  const isDanger = pct >= 80;
  const scheme = BAR_COLORS[color] || BAR_COLORS.blue;

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm w-20 text-right text-on-surface-variant font-body truncate">
        {label}
      </span>
      <div className="flex-1 relative">
        <div
          className={`h-7 w-full rounded-full overflow-hidden bg-white/[0.06] border border-white/[0.08] ${isDanger ? 'animate-beer-stat-danger' : ''}`}
        >
          <div className="h-full flex">
            <div
              className="h-full transition-all duration-200 ease-out"
              style={{
                width: `${pct}%`,
                borderRadius: pendingPct > 0 ? '9999px 0 0 9999px' : '9999px',
                background: scheme.fill,
                boxShadow: isDanger ? scheme.dangerShadow : 'none',
              }}
            />
            {pendingPct > 0 && (
              <div
                className="h-full transition-all duration-300 ease-out"
                style={{
                  width: `${pendingPct}%`,
                  borderRadius: pct > 0 ? '0 9999px 9999px 0' : '9999px',
                  background: scheme.pending,
                }}
              />
            )}
          </div>
        </div>
      </div>
      <span className="text-sm font-mono w-10 text-right tabular-nums text-on-surface-variant">
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
          style={{ fontSize: Math.round(size * 0.4) }}
        >
          {icon}
        </span>
      </button>
    </div>
  );
}

function BeerDisplay({ beerPoints }) {
  const fullBeers = Math.floor(beerPoints / 5);
  const volume = (beerPoints * 0.1).toFixed(1);

  return (
    <div className="relative text-center">
      {fullBeers > 0 && (
        <div className="flex flex-wrap justify-center gap-1 min-h-[36px] mb-1.5">
          {Array.from({ length: fullBeers }, (_, i) => (
            <span
              key={i}
              className="material-symbols-outlined text-amber-400"
              style={{ fontSize: 30, textShadow: '0 0 8px rgba(251,191,36,0.3)' }}
            >
              sports_bar
            </span>
          ))}
        </div>
      )}
      <div
        className="text-4xl font-headline tabular-nums leading-none text-amber-300"
        style={{ textShadow: '0 0 16px rgba(251, 191, 36, 0.4), 0 2px 4px rgba(0,0,0,0.5)' }}
      >
        {volume}L
      </div>
    </div>
  );
}

function PlayerColumn({ player, maxPee, maxVomit, isLocal, onDrink, onPee, onVomit, disabled, t, peeCD, vomitCD, spriteSheetUrl }) {
  return (
    <div className={`flex-1 flex flex-col gap-4 min-w-0 p-5 rounded-xl border border-white/10 bg-black/30 backdrop-blur-sm ${player.isEliminated ? 'beer-eliminated' : ''}`}>
      <div className="text-center">
        {spriteSheetUrl && (
          <div className="flex justify-center mb-1">
            <LpcSprite
              sheetUrl={spriteSheetUrl}
              animation="idle_down"
              width={64}
              height={64}
              pixelated
            />
          </div>
        )}
        <div
          className="text-base font-accent text-on-surface-variant truncate"
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}
        >
          {player.name}
        </div>
        <div className="mt-3 mb-1">
          <BeerDisplay beerPoints={player.beerPoints} />
        </div>
      </div>

      <div className="space-y-2.5">
        <StatBar
          value={player.pee}
          max={maxPee}
          pending={player.peePending}
          label={t('beerDuel.pee', 'Sikanie')}
          color="blue"
        />
        <StatBar
          value={player.vomit}
          max={maxVomit}
          pending={player.vomitPending}
          label={t('beerDuel.vomit', 'Rzyganie')}
          color="green"
        />
      </div>

      {isLocal && (
        <div className="flex items-center justify-center gap-4 mt-3">
          <ActionButton
            icon="wc"
            onClick={onPee}
            disabled={disabled || player.pee === 0}
            cooldownUntil={player.peeCooldownUntil}
            cooldownDuration={peeCD}
            size={62}
            colorClass="border-blue-500/50 bg-blue-600/20 text-blue-300 hover:bg-blue-500/30 hover:border-blue-400/70 hover:shadow-[0_0_12px_rgba(59,130,246,0.3)]"
            title={t('beerDuel.toilet', 'TOALETA')}
          />
          <ActionButton
            icon="sports_bar"
            onClick={onDrink}
            disabled={disabled}
            size={82}
            colorClass="border-amber-500/60 bg-amber-600/25 text-amber-300 hover:bg-amber-500/40 hover:border-amber-400/80 hover:shadow-[0_0_16px_rgba(245,158,11,0.4)]"
            title={t('beerDuel.drink', 'PIWO')}
          />
          <ActionButton
            icon="sick"
            onClick={onVomit}
            disabled={disabled || player.vomit === 0}
            cooldownUntil={player.vomitCooldownUntil}
            cooldownDuration={vomitCD}
            size={62}
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
  const { spriteSheets } = useCombatSprites(combat.combatants);

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
  const victoryPlayedRef = useRef(false);

  const handleDrink = useCallback(() => {
    drinkBeer();
    playBeerSfx('gulp');
  }, [drinkBeer]);

  const handlePee = useCallback(() => {
    useRelief('pee');
    playBeerSfx('relief');
  }, [useRelief]);

  const handleVomit = useCallback(() => {
    useRelief('vomit');
    playBeerSfx('relief');
  }, [useRelief]);

  useEffect(() => {
    if (isFinished && !victoryPlayedRef.current) {
      victoryPlayedRef.current = true;
      playBeerSfx('victory');
    }
  }, [isFinished]);

  const buildSummary = useCallback(() => {
    const playerWon = winnerId === player.id;
    const tie = winnerId === null;
    const winnerLabel = tie ? 'draw' : (playerWon ? player.name : opponent.name);

    return {
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
        beersCollectedByPlayer: player.beerPoints,
        fullBeers: Math.floor(player.beerPoints / 5),
        volumeL: +(player.beerPoints * 0.1).toFixed(1),
        winnerIds: winnerId ? [winnerId] : [],
        winnerName: winnerLabel,
        isTie: tie,
        playerPee: player.pee,
        playerVomit: player.vomit,
        opponentBeers: opponent.beerPoints,
      },
    };
  }, [winnerId, player, opponent]);

  const timerClasses =
    timeRemainingMs < 10_000 ? 'text-red-400 animate-beer-timer-urgent' :
    timeRemainingMs < 30_000 ? 'text-yellow-300' :
    'text-on-surface';

  const playerWon = winnerId === player.id;
  const tie = winnerId === null;

  return (
    <div className="flex flex-col gap-4 p-3 rounded-xl relative overflow-hidden animate-beer-panel-in">
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
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm gap-5 animate-fade-in">
          {!tie && <div className="absolute inset-0 animate-beer-victory-sweep" />}

          <div
            className={`relative text-4xl font-headline ${playerWon ? 'text-amber-300' : tie ? 'text-on-surface-variant' : 'text-red-400'}`}
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

          <div className="relative flex items-center gap-8 text-base">
            <div className="text-center">
              <div className="text-on-surface-variant font-accent text-sm">{player.name}</div>
              <div className="mt-2">
                <BeerDisplay beerPoints={player.beerPoints} />
              </div>
            </div>
            <div
              className="font-accent text-xl text-on-surface-variant/50"
              style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
            >
              vs
            </div>
            <div className="text-center">
              <div className="text-on-surface-variant font-accent text-sm">{opponent.name}</div>
              <div className="mt-2">
                <BeerDisplay beerPoints={opponent.beerPoints} />
              </div>
            </div>
          </div>

          {(player.isEliminated || opponent.isEliminated) && (
            <div className="relative text-sm text-red-400/80 font-body">
              {player.isEliminated && opponent.isEliminated
                ? t('beerDuel.bothEliminated', 'Obaj nie wytrzymali!')
                : player.isEliminated
                  ? t('beerDuel.playerEliminated', 'Nie wytrzymałeś...')
                  : t('beerDuel.opponentEliminated', '{{name}} nie wytrzymał!', { name: opponent.name })}
            </div>
          )}

          <button
            onClick={() => onEndCombat?.(buildSummary())}
            className="relative mt-3 px-8 py-3 rounded-lg font-accent text-base
              border border-amber-500/50 bg-amber-600/25 text-amber-200
              hover:bg-amber-500/40 hover:border-amber-400/70 hover:text-amber-100
              hover:shadow-[0_0_16px_rgba(245,158,11,0.3)]
              active:scale-95 transition-all duration-150"
          >
            {t('beerDuel.exit', 'Wyjdź')}
          </button>
        </div>
      )}

      {/* Timer */}
      <div className="text-center">
        <span className={`text-3xl font-mono font-bold tabular-nums ${timerClasses}`}>
          {formatTime(timeRemainingMs)}
        </span>
      </div>

      {/* Two-column layout with VS badge */}
      <div className="flex items-stretch gap-4">
        <PlayerColumn
          player={player}
          maxPee={constants.MAX_PEE}
          maxVomit={constants.MAX_VOMIT}
          isLocal
          onDrink={handleDrink}
          onPee={handlePee}
          onVomit={handleVomit}
          disabled={!isPlaying}
          t={t}
          peeCD={constants.PEE_COOLDOWN_MS}
          vomitCD={constants.VOMIT_COOLDOWN_MS}
          spriteSheetUrl={spriteSheets[playerCombatant?.id]}
        />

        <div className="flex flex-col items-center justify-center shrink-0">
          <div
            className="w-12 h-12 rounded-full border border-amber-500/30 bg-amber-500/10 flex items-center justify-center"
            style={{ boxShadow: '0 0 12px rgba(245, 158, 11, 0.15)' }}
          >
            <span
              className="font-accent text-sm text-amber-400/70"
              style={{ textShadow: '0 0 6px rgba(245,158,11,0.3)' }}
            >
              vs
            </span>
          </div>
        </div>

        <PlayerColumn
          player={opponent}
          maxPee={constants.MAX_PEE}
          maxVomit={constants.MAX_VOMIT}
          isLocal={false}
          disabled
          t={t}
          spriteSheetUrl={spriteSheets[enemyCombatant?.id]}
        />
      </div>
    </div>
  );
}
