import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useBeerDuel } from '../../../hooks/useBeerDuel';
import { useMinigameAudio } from '../../../hooks/useMinigameAudio';
import { useCombatSprites } from '../../../hooks/useCombatSprites';
import LpcSprite from '../../shared/LpcSprite';

const COOLDOWN_RING_R = 19;
const COOLDOWN_RING_C = 2 * Math.PI * COOLDOWN_RING_R;

let floatIdCounter = 0;

function useFloatingTexts() {
  const [items, setItems] = useState([]);
  const push = useCallback((text, color = 'text-amber-300') => {
    const id = ++floatIdCounter;
    setItems((prev) => [...prev, { id, text, color }]);
    setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), 850);
  }, []);
  return { items, push };
}

function FloatingTexts({ items }) {
  if (items.length === 0) return null;
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {items.map((item) => (
        <div
          key={item.id}
          className={`absolute left-1/2 top-1/2 -translate-x-1/2 text-2xl font-headline animate-beer-float-up ${item.color}`}
          style={{ textShadow: '0 2px 8px rgba(0,0,0,0.7)' }}
        >
          {item.text}
        </div>
      ))}
    </div>
  );
}

const JITTER_INTERVAL_MS = 60;
const JITTER_MAX_PX = 18;

function useDrunkJitter(beerPoints, active) {
  const ref = useRef(null);

  useEffect(() => {
    if (!active || beerPoints <= 0) {
      if (ref.current) ref.current.style.transform = '';
      return;
    }
    const amplitude = Math.min(JITTER_MAX_PX, beerPoints * 1.2);
    let id;
    const tick = () => {
      if (ref.current) {
        const dx = (Math.random() - 0.5) * 2 * amplitude;
        const dy = (Math.random() - 0.5) * 2 * amplitude;
        ref.current.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
      }
      id = setTimeout(tick, JITTER_INTERVAL_MS + Math.random() * 40);
    };
    id = setTimeout(tick, JITTER_INTERVAL_MS);
    return () => { clearTimeout(id); if (ref.current) ref.current.style.transform = ''; };
  }, [beerPoints, active]);

  return ref;
}



function useDrunkBlur(beerPoints, active) {
  const [blur, setBlur] = useState(0);

  useEffect(() => {
    if (!active || beerPoints <= 0) { setBlur(0); return; }
    const maxBlur = Math.min(6, beerPoints * 0.4);
    const intervalBase = Math.max(800, 4000 - beerPoints * 200);
    let id;
    const tick = () => {
      const strength = maxBlur * (0.5 + Math.random() * 0.5);
      setBlur(strength);
      const holdMs = 300 + Math.random() * 400;
      setTimeout(() => setBlur(0), holdMs);
      id = setTimeout(tick, intervalBase + Math.random() * intervalBase * 0.5);
    };
    id = setTimeout(tick, intervalBase);
    return () => { clearTimeout(id); setBlur(0); };
  }, [beerPoints, active]);

  return blur;
}

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
  red: {
    fill: 'linear-gradient(90deg, #ef4444, #f87171)',
    pending: 'linear-gradient(90deg, rgba(239,68,68,0.3), rgba(248,113,113,0.3))',
    dangerShadow: '0 0 8px rgba(239, 68, 68, 0.5)',
  },
};

function StatBar({ value, max, pending = 0, icon, iconColor, color }) {
  const pct = Math.min(100, (value / max) * 100);
  const pendingPct = Math.min(100 - pct, (pending / max) * 100);
  const isDanger = pct >= 80;
  const scheme = BAR_COLORS[color] || BAR_COLORS.blue;

  return (
    <div className="flex items-center gap-2">
      <span className={`material-symbols-outlined shrink-0 ${iconColor}`} style={{ fontSize: 20 }}>
        {icon}
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
      <span className="text-sm font-mono w-8 text-right tabular-nums text-on-surface-variant">
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
          style={{ fontSize: Math.round(size * 0.6) }}
        >
          {icon}
        </span>
      </button>
    </div>
  );
}

function BeerDisplay({ beerPoints }) {
  const fullBeers = Math.floor(beerPoints / 2.5);
  const volume = (beerPoints * 0.2).toFixed(2);

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

const ALL_DIFFICULTIES = ['easy', 'medium', 'tough', 'hard'];

const DIFFICULTY_LABELS = {
  easy:   { label: 'Łatwy',      color: 'text-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-500/10' },
  medium: { label: 'Średni',     color: 'text-amber-400',   border: 'border-amber-500/30',   bg: 'bg-amber-500/10' },
  tough:  { label: 'Wymagający', color: 'text-orange-400',  border: 'border-orange-500/30',  bg: 'bg-orange-500/10' },
  hard:   { label: 'Trudny',     color: 'text-red-400',     border: 'border-red-500/30',     bg: 'bg-red-500/10' },
};

function PlayerColumn({ player, maxPee, maxVomit, maxBruise, isLocal, onDrink, onPee, onVomit, disabled, t, peeCD, vomitCD, spriteSheetUrl, difficulty, npcLastAction, floats, playSfx, trapPhase }) {
  const diff = !isLocal && difficulty ? DIFFICULTY_LABELS[difficulty] || DIFFICULTY_LABELS.medium : null;
  const fakePress = (action) => !isLocal && npcLastAction === action ? 'scale-90 brightness-150' : '';
  const drunkBlur = useDrunkBlur(player.beerPoints, isLocal && !disabled);
  const prevBeersRef = useRef(player.beerPoints);
  const [milestoneKey, setMilestoneKey] = useState(0);
  const [animatingBeerIndex, setAnimatingBeerIndex] = useState(-1);

  useEffect(() => {
    const prevFull = Math.floor(prevBeersRef.current / 2.5);
    const curFull = Math.floor(player.beerPoints / 2.5);
    prevBeersRef.current = player.beerPoints;
    if (curFull > prevFull && curFull > 0) {
      setMilestoneKey((k) => k + 1);
      setAnimatingBeerIndex(curFull - 1);
      if (isLocal && playSfx) playSfx('beerMilestone');
      const tid = setTimeout(() => setAnimatingBeerIndex(-1), 600);
      return () => clearTimeout(tid);
    }
  }, [player.beerPoints, isLocal, playSfx]);

  return (
    <div className={`flex-1 flex flex-col gap-2 min-w-0 ${player.isEliminated ? 'beer-eliminated' : ''}`}>
      <div className="relative flex flex-col gap-5 p-7 md:p-9 rounded-xl border border-white/10 bg-black/50 backdrop-blur-sm">
        {floats && <FloatingTexts items={floats.items} />}
        <div className="text-center flex flex-col items-center justify-end">
          {isLocal && spriteSheetUrl && (
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
            className="text-lg font-headline text-on-surface-variant truncate max-w-full"
            style={{ textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}
          >
            {player.name}
          </div>
          {diff ? (
            <span className={`inline-block mt-1 px-3 py-1 rounded-full text-sm font-accent ${diff.color} ${diff.border} ${diff.bg} border`}>
              {diff.label}
            </span>
          ) : (
            <span className="inline-block mt-1 px-3 py-1 rounded-full text-sm font-accent text-sky-400 border-sky-500/30 bg-sky-500/10 border">
              {t('beerDuel.player', 'Gracz')}
            </span>
          )}
        </div>

        <div className="relative">
          <div
            className="text-4xl font-headline tabular-nums leading-none text-amber-300 text-center"
            style={{ textShadow: '0 0 16px rgba(251, 191, 36, 0.4), 0 2px 4px rgba(0,0,0,0.5)' }}
          >
            {(player.beerPoints * 0.2).toFixed(2)}L
          </div>
          {milestoneKey > 0 && (
            <div
              key={milestoneKey}
              className="absolute inset-0 flex items-center justify-center animate-beer-milestone"
            >
              <span
                className="text-5xl font-headline text-amber-200"
                style={{ textShadow: '0 0 20px rgba(251,191,36,0.8)' }}
              >
                🍺
              </span>
            </div>
          )}
        </div>

        <div className="space-y-2.5">
          <StatBar
            value={player.pee}
            max={maxPee}
            pending={player.peePending}
            icon="water_drop"
            iconColor="text-blue-400"
            color="blue"
          />
          <StatBar
            value={player.vomit}
            max={maxVomit}
            pending={player.vomitPending}
            icon="sick"
            iconColor="text-emerald-400"
            color="green"
          />
          <StatBar
            value={player.bruise}
            max={maxBruise}
            icon="skull"
            iconColor="text-red-400"
            color="red"
          />
        </div>

        <div
          className="flex items-center justify-center gap-4 mt-3 transition-[filter] duration-300"
          style={drunkBlur > 0 ? { filter: `blur(${drunkBlur.toFixed(1)}px)` } : undefined}
        >
          {isLocal ? (
            <>
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
                icon={trapPhase === 'danger' ? 'skull' : trapPhase === 'warning' ? 'warning' : 'sports_bar'}
                onClick={onDrink}
                disabled={disabled}
                size={82}
                colorClass={
                  trapPhase === 'danger'
                    ? 'border-red-500 bg-red-600/50 text-red-200 shadow-[0_0_24px_rgba(239,68,68,0.6)] hover:bg-red-500/60 animate-pulse'
                    : trapPhase === 'warning'
                      ? 'border-orange-400 bg-orange-500/40 text-orange-200 shadow-[0_0_20px_rgba(249,115,22,0.6)] animate-beer-trap-warn'
                      : 'border-amber-500/60 bg-amber-600/25 text-amber-300 hover:bg-amber-500/40 hover:border-amber-400/80 hover:shadow-[0_0_16px_rgba(245,158,11,0.4)]'
                }
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
            </>
          ) : (
            <>
              <div className={`w-[62px] h-[62px] rounded-full flex items-center justify-center border-2 transition-all duration-150 border-blue-500/50 bg-blue-600/20 text-blue-300 opacity-60 ${fakePress('pee')}`}>
                <span className="material-symbols-outlined" style={{ fontSize: 37 }}>wc</span>
              </div>
              <div className={`w-[82px] h-[82px] rounded-full flex items-center justify-center border-2 transition-all duration-150 opacity-60 ${
                trapPhase === 'danger'
                  ? 'border-red-500 bg-red-600/50 text-red-200 shadow-[0_0_24px_rgba(239,68,68,0.6)] animate-pulse'
                  : trapPhase === 'warning'
                    ? 'border-orange-400 bg-orange-500/40 text-orange-200 shadow-[0_0_20px_rgba(249,115,22,0.6)] animate-beer-trap-warn'
                    : 'border-amber-500/60 bg-amber-600/25 text-amber-300'
              } ${fakePress('drink')}`}>
                <span className="material-symbols-outlined" style={{ fontSize: 49 }}>{trapPhase === 'danger' ? 'skull' : trapPhase === 'warning' ? 'warning' : 'sports_bar'}</span>
              </div>
              <div className={`w-[62px] h-[62px] rounded-full flex items-center justify-center border-2 transition-all duration-150 border-emerald-500/50 bg-emerald-600/20 text-emerald-300 opacity-60 ${fakePress('vomit')}`}>
                <span className="material-symbols-outlined" style={{ fontSize: 37 }}>sick</span>
              </div>
            </>
          )}
        </div>
      </div>

      {(Math.floor(player.beerPoints / 2.5) > 0 || player.peeReliefCount > 0 || player.vomitReliefCount > 0) && (
        <div className="flex flex-wrap justify-start gap-1 px-4 py-3 rounded-xl border border-amber-500/15 bg-black/40 backdrop-blur-sm">
          {Array.from({ length: Math.floor(player.beerPoints / 2.5) }, (_, i) => (
            <span
              key={i === animatingBeerIndex ? `beer-${milestoneKey}` : i}
              className={`material-symbols-outlined text-amber-400 ${i === animatingBeerIndex ? 'animate-beer-icon-enter' : ''}`}
              style={{ fontSize: 38, textShadow: '0 0 8px rgba(251,191,36,0.3)' }}
            >
              sports_bar
            </span>
          ))}
          {Array.from({ length: player.peeReliefCount }, (_, i) => (
            <span
              key={`pee-${i}`}
              className="material-symbols-outlined text-blue-400"
              style={{ fontSize: 38, textShadow: '0 0 8px rgba(59,130,246,0.3)' }}
            >
              wc
            </span>
          ))}
          {Array.from({ length: player.vomitReliefCount }, (_, i) => (
            <span
              key={`vomit-${i}`}
              className="material-symbols-outlined text-emerald-400"
              style={{ fontSize: 38, textShadow: '0 0 8px rgba(16,185,129,0.3)' }}
            >
              sick
            </span>
          ))}
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
  const playSfx = useMinigameAudio();

  const playerCombatant = combat.combatants.find((c) => c.type === 'player');
  const enemyCombatants = useMemo(
    () => combat.combatants.filter((c) => c.type === 'enemy'),
    [combat.combatants],
  );
  const { spriteSheets } = useCombatSprites(combat.combatants);

  const hookOpponents = useMemo(() => {
    const shuffled = [...ALL_DIFFICULTIES].sort(() => Math.random() - 0.5);
    return enemyCombatants.map((e, i) => ({
      id: e.id,
      name: e.name,
      difficulty: shuffled[i % shuffled.length],
    }));
  }, [enemyCombatants]);

  const difficultyById = useMemo(() => {
    const m = {};
    for (const o of hookOpponents) m[o.id] = o.difficulty;
    return m;
  }, [hookOpponents]);

  const {
    phase,
    countdownSec,
    timeRemainingMs,
    player,
    opponents,
    winnerId,
    npcLastActions,
    trapPhases,
    drinkBeer,
    useRelief,
    constants,
  } = useBeerDuel({
    playerId: playerCombatant?.id || 'player',
    playerName: character?.name || playerCombatant?.name || 'Player',
    opponents: hookOpponents,
    isMultiplayer,
    playSfx,
  });

  const isPlaying = phase === 'playing';
  const isFinished = phase === 'finished';
  const victoryPlayedRef = useRef(false);
  const playerFloats = useFloatingTexts();

  // One floating-text hook per opponent (max 8 to be safe)
  const oppFloat0 = useFloatingTexts();
  const oppFloat1 = useFloatingTexts();
  const oppFloat2 = useFloatingTexts();
  const oppFloat3 = useFloatingTexts();
  const oppFloat4 = useFloatingTexts();
  const oppFloat5 = useFloatingTexts();
  const oppFloat6 = useFloatingTexts();
  const oppFloat7 = useFloatingTexts();
  const oppFloatPool = [oppFloat0, oppFloat1, oppFloat2, oppFloat3, oppFloat4, oppFloat5, oppFloat6, oppFloat7];

  const sipCountRef = useRef(0);
  const prevLeadRef = useRef(null);

  const handleDrink = useCallback(() => {
    const result = drinkBeer();
    if (result === 'trap') {
      playSfx('trapHit');
      playerFloats.push('+3 💀', 'text-red-400');
    } else {
      sipCountRef.current += 1;
      if (sipCountRef.current % 5 === 0) {
        playSfx('mugSlam');
      } else {
        playSfx('gulp');
      }
      if (Math.random() < 0.25) setTimeout(() => playSfx('burp'), 200);
      playerFloats.push('+100ml', 'text-amber-300');
    }
  }, [drinkBeer, playSfx, playerFloats]);

  const handlePee = useCallback(() => {
    useRelief('pee');
    playSfx('peeRelief');
    playerFloats.push(`-${constants.PEE_RELIEF_AMOUNT}`, 'text-blue-400');
  }, [useRelief, playSfx, playerFloats, constants]);

  const handleVomit = useCallback(() => {
    useRelief('vomit');
    playSfx('vomitRelief');
    playerFloats.push(`-${constants.VOMIT_RELIEF_AMOUNT}`, 'text-emerald-400');
  }, [useRelief, playSfx, playerFloats, constants]);

  // Flash floating text for each opponent's NPC actions
  const prevNpcActionsRef = useRef({});
  useEffect(() => {
    for (let i = 0; i < opponents.length; i++) {
      const opp = opponents[i];
      const action = npcLastActions[opp.id];
      const prevAction = prevNpcActionsRef.current[opp.id];
      if (action && action !== prevAction) {
        const floats = oppFloatPool[i];
        if (floats) {
          if (action === 'drink') {
            floats.push('+100ml', 'text-amber-300');
            if (Math.random() < 0.3) playSfx('npcTaunt');
          } else if (action === 'pee') {
            floats.push(`-${constants.PEE_RELIEF_AMOUNT}`, 'text-blue-400');
          } else if (action === 'vomit') {
            floats.push(`-${constants.VOMIT_RELIEF_AMOUNT}`, 'text-emerald-400');
          }
        }
      }
      prevNpcActionsRef.current[opp.id] = action;
    }
  }, [npcLastActions, opponents, constants, playSfx, oppFloatPool]);

  // Tavern cheer when player takes the lead over all opponents
  useEffect(() => {
    if (!isPlaying || !player) return;
    const wasAhead = prevLeadRef.current;
    const bestOppBeers = Math.max(...opponents.map((o) => o.beerPoints), 0);
    const nowAhead = player.beerPoints > bestOppBeers;
    if (nowAhead && !wasAhead && player.beerPoints > 0) {
      playSfx('tavernCheer');
    }
    prevLeadRef.current = nowAhead;
  }, [player?.beerPoints, opponents, isPlaying, playSfx]);

  useEffect(() => {
    if (isFinished && !victoryPlayedRef.current) {
      victoryPlayedRef.current = true;
      playSfx('victory');
    }
  }, [isFinished, playSfx]);

  const buildSummary = useCallback(() => {
    const playerWon = winnerId === player.id;
    const tie = winnerId === null;
    const winner = tie ? null : (playerWon ? player : opponents.find((o) => o.id === winnerId));
    const winnerLabel = tie ? 'draw' : (winner?.name || 'unknown');

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
      totalEnemies: opponents.length,
      flawless: false,
      skirmishSummary: {
        type: 'beer_duel',
        beersCollectedByPlayer: player.beerPoints,
        fullBeers: Math.floor(player.beerPoints / 2.5),
        volumeL: +(player.beerPoints * 0.2).toFixed(2),
        winnerIds: winnerId ? [winnerId] : [],
        winnerName: winnerLabel,
        isTie: tie,
        playerPee: player.pee,
        playerVomit: player.vomit,
        opponentBeers: opponents.reduce((sum, o) => sum + o.beerPoints, 0),
        opponentDetails: opponents.map((o) => ({
          name: o.name,
          beerPoints: o.beerPoints,
          volumeL: +(o.beerPoints * 0.2).toFixed(2),
          isEliminated: o.isEliminated,
        })),
      },
    };
  }, [winnerId, player, opponents]);

  const timerClasses =
    timeRemainingMs < 10_000 ? 'text-red-400 animate-beer-timer-urgent' :
    timeRemainingMs < 30_000 ? 'text-yellow-300' :
    'text-on-surface';

  const playerWon = winnerId === player?.id;
  const tie = winnerId === null;

  const jitterRef = useDrunkJitter(player?.beerPoints || 0, isPlaying);

  const allParticipants = useMemo(() => [player, ...opponents].filter(Boolean), [player, opponents]);
  const eliminatedNames = allParticipants.filter((p) => p.isEliminated).map((p) => p.name);

  return (
    <div ref={jitterRef} className="flex flex-col gap-4 p-4 md:p-6 rounded-xl relative overflow-hidden animate-beer-panel-in">
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
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm gap-5 animate-fade-in overflow-y-auto py-6">
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

          <div className="relative flex items-center gap-6 text-base flex-wrap justify-center">
            {allParticipants.map((p, i) => (
              <div key={p.id} className="flex items-center gap-4">
                {i > 0 && (
                  <div
                    className="font-accent text-lg text-on-surface-variant/50 shrink-0"
                    style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
                  >
                    vs
                  </div>
                )}
                <div className={`text-center ${p.id === winnerId ? 'ring-2 ring-amber-400/40 rounded-lg p-2' : 'p-2'}`}>
                  <div className="text-on-surface-variant font-accent text-sm">{p.name}</div>
                  <div className="mt-2">
                    <BeerDisplay beerPoints={p.beerPoints} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {eliminatedNames.length > 0 && (
            <div className="relative text-sm text-red-400/80 font-body">
              {eliminatedNames.length === allParticipants.length
                ? t('beerDuel.allEliminated', 'Nikt nie wytrzymał!')
                : eliminatedNames.length === 1 && eliminatedNames[0] === player?.name
                  ? t('beerDuel.playerEliminated', 'Nie wytrzymałeś...')
                  : t('beerDuel.someEliminated', '{{names}} nie wytrzymali!', { names: eliminatedNames.join(', ') })}
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

      {/* Player vs N opponents layout */}
      <div className="flex items-stretch gap-4 overflow-x-auto custom-scrollbar">
        <PlayerColumn
          player={player}
          maxPee={constants.MAX_PEE}
          maxVomit={constants.MAX_VOMIT}
          maxBruise={constants.MAX_BRUISE}
          isLocal
          onDrink={handleDrink}
          onPee={handlePee}
          onVomit={handleVomit}
          disabled={!isPlaying}
          t={t}
          peeCD={constants.PEE_COOLDOWN_MS}
          vomitCD={constants.VOMIT_COOLDOWN_MS}
          spriteSheetUrl={spriteSheets[playerCombatant?.id]}
          floats={playerFloats}
          playSfx={playSfx}
          trapPhase={trapPhases[playerCombatant?.id || 'player']}
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

        {opponents.map((opp, i) => (
          <PlayerColumn
            key={opp.id}
            player={opp}
            maxPee={constants.MAX_PEE}
            maxVomit={constants.MAX_VOMIT}
            maxBruise={constants.MAX_BRUISE}
            isLocal={false}
            disabled
            t={t}
            difficulty={difficultyById[opp.id]}
            npcLastAction={npcLastActions[opp.id]}
            floats={oppFloatPool[i]}
            playSfx={playSfx}
            trapPhase={trapPhases[opp.id]}
          />
        ))}
      </div>
    </div>
  );
}
