import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useDiceGame } from '../../../hooks/useDiceGame';
import { useMinigameAudio } from '../../../hooks/useMinigameAudio';

const PIP_LAYOUTS = {
  1: [[1, 1]],
  2: [[0, 2], [2, 0]],
  3: [[0, 2], [1, 1], [2, 0]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
};

function DieFace({ value, rolling = false, comboGlow = null }) {
  const pips = PIP_LAYOUTS[value] || [];

  let glowClass = '';
  let glowStyle = {};
  if (comboGlow === 'fire') {
    glowClass = 'animate-pulse';
    glowStyle = { boxShadow: '0 0 16px rgba(251, 146, 60, 0.6), 0 0 32px rgba(234, 88, 12, 0.3)' };
  } else if (comboGlow === 'curse') {
    glowClass = 'animate-dice-shake';
    glowStyle = { boxShadow: '0 0 16px rgba(239, 68, 68, 0.6), 0 0 32px rgba(185, 28, 28, 0.3)' };
  }

  return (
    <div
      className={`
        w-14 h-14 rounded-lg border border-white/15 bg-white/[0.08] backdrop-blur-sm
        flex items-center justify-center shrink-0 shadow-md
        ${rolling ? 'animate-dice-tumble' : ''}
        ${glowClass}
      `}
      style={glowStyle}
    >
      <div className="grid grid-cols-3 grid-rows-3 w-9 h-9 gap-0">
        {Array.from({ length: 9 }, (_, i) => {
          const row = Math.floor(i / 3);
          const col = i % 3;
          const hasPip = pips.some(([r, c]) => r === row && c === col);
          return (
            <div key={i} className="flex items-center justify-center">
              {hasPip && (
                <div className="w-2 h-2 rounded-full bg-white shadow-[0_0_4px_rgba(255,255,255,0.4)]" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DiceHand({ dice, total, name, rolling, comboLabel, comboGlow }) {
  return (
    <div className="flex-1 flex flex-col items-center gap-2 min-w-0">
      <div
        className="text-sm font-accent text-on-surface-variant truncate max-w-full"
        style={{ textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}
      >
        {name}
      </div>

      <div className="flex items-center justify-center gap-2 min-h-[60px]">
        {dice.map((val, i) => (
          <DieFace key={i} value={val} rolling={rolling} comboGlow={comboGlow} />
        ))}
        {dice.length === 0 && (
          <div className="w-14 h-14 rounded-lg border border-dashed border-white/10" />
        )}
      </div>

      <div className="flex flex-col items-center">
        <span
          className="text-xl font-headline tabular-nums text-amber-300"
          style={{ textShadow: '0 0 12px rgba(245, 158, 11, 0.4)' }}
        >
          {total != null ? total : '—'}
        </span>
        {comboLabel && (
          <span
            className={`text-[11px] font-accent mt-0.5 ${comboGlow === 'fire' ? 'text-orange-400' : comboGlow === 'curse' ? 'text-red-400' : 'text-amber-300/70'}`}
            style={{
              textShadow: comboGlow === 'fire'
                ? '0 0 8px rgba(251, 146, 60, 0.5)'
                : comboGlow === 'curse'
                  ? '0 0 8px rgba(239, 68, 68, 0.5)'
                  : 'none',
            }}
          >
            {comboLabel}
          </span>
        )}
      </div>
    </div>
  );
}

function CommentaryBubble({ name, text }) {
  if (!text) return null;
  return (
    <div className="flex items-start gap-2 px-2 animate-fade-in">
      <span className="text-xs font-accent text-amber-400 shrink-0">{name}:</span>
      <span className="text-xs font-body text-on-surface-variant/80 italic">{text}</span>
    </div>
  );
}

export default function DiceGamePanel({
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
    playerDice,
    playerTotal,
    playerCombo,
    opponentDice,
    opponentTotal,
    opponentCombo,
    playerScore,
    opponentScore,
    goldDelta,
    potMultiplier,
    winnerId,
    commentary,
    combosHit,
    rolling,
    raise: rawRaise,
    play: rawPlay,
    forfeit,
  } = useDiceGame({
    playerId: playerCombatant?.id || 'player',
    playerName: character?.name || playerCombatant?.name || 'Gracz',
    opponentId: enemyCombatant?.id || 'opponent',
    opponentName: enemyCombatant?.name || 'Przeciwnik',
    difficulty: npcDifficulty,
    anteGold,
  });

  const playerName = character?.name || playerCombatant?.name || 'Gracz';
  const opponentName = enemyCombatant?.name || 'Przeciwnik';

  const isFinished = phase === 'finished';
  const isBetting = phase === 'betting';

  // ── SFX wrappers ──
  const raise = useCallback(() => { playSfx('raise'); rawRaise(); }, [rawRaise, playSfx]);
  const play = useCallback(() => { playSfx('diceShake'); rawPlay(); }, [rawPlay, playSfx]);

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

    if (phase === 'rolling') playSfx('diceShake');
    if (phase === 'round_result') {
      playSfx('diceLand');
      const combo = playerCombo || opponentCombo;
      if (combo === 'dragon_eyes') playSfx('diceComboGood');
      else if (combo === 'dog_luck') playSfx('diceComboBad');
    }
    if (phase === 'finished') {
      const playerWon = winnerId === (playerCombatant?.id || 'player');
      playSfx(playerWon ? 'success' : 'failure');
    }
  }, [phase, playerCombo, opponentCombo, winnerId, playerCombatant, playSfx]);

  function comboGlow(combo) {
    if (!combo) return null;
    if (combo.key === 'dragon_eyes') return 'fire';
    if (combo.key === 'dog_luck') return 'curse';
    return null;
  }

  const buildSummary = useCallback(() => {
    const playerWon = winnerId === (playerCombatant?.id || 'player');
    const tie = winnerId === null;
    const winnerLabel = tie ? null : (playerWon ? playerName : opponentName);

    return {
      mode: 'dice_game',
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
        type: 'dice_game',
        playerScore,
        opponentScore,
        goldChange: goldDelta,
        winnerName: winnerLabel,
        isTie: tie,
        combosHit,
      },
    };
  }, [winnerId, round, playerScore, opponentScore, goldDelta, combosHit, playerName, opponentName, playerCombatant]);

  const playerWon = winnerId === (playerCombatant?.id || 'player');
  const tie = winnerId === null;

  return (
    <div className="flex flex-col gap-4 p-4 rounded-xl border border-amber-500/25 bg-surface-container/80 backdrop-blur-md relative overflow-hidden animate-fade-in">

      {/* ── Countdown overlay ── */}
      {phase === 'countdown' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/75 backdrop-blur-sm">
          <div
            key={countdownSec}
            className="text-8xl font-headline text-amber-300 animate-beer-countdown"
            style={{ textShadow: '0 0 40px rgba(245, 158, 11, 0.6), 0 4px 8px rgba(0,0,0,0.8)' }}
          >
            {countdownSec}
          </div>
        </div>
      )}

      {/* ── Finished overlay ── */}
      {isFinished && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm gap-4 animate-fade-in">
          <div
            className={`text-3xl font-headline ${playerWon ? 'text-amber-300' : tie ? 'text-on-surface-variant' : 'text-red-400'}`}
            style={{
              textShadow: playerWon
                ? '0 0 30px rgba(245, 158, 11, 0.6), 0 2px 4px rgba(0,0,0,0.6)'
                : '0 2px 4px rgba(0,0,0,0.6)',
            }}
          >
            {tie
              ? t('diceGame.draw', 'Remis!')
              : playerWon
                ? t('diceGame.youWin', 'Wygrałeś!')
                : t('diceGame.youLose', 'Przegrałeś!')}
          </div>

          <div className="flex items-center gap-6 text-sm">
            <div className="text-center">
              <div className="text-on-surface-variant font-accent text-xs">{playerName}</div>
              <div className="text-2xl font-headline text-amber-300 mt-1">{playerScore}</div>
            </div>
            <div className="font-accent text-lg text-on-surface-variant/50" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
              vs
            </div>
            <div className="text-center">
              <div className="text-on-surface-variant font-accent text-xs">{opponentName}</div>
              <div className="text-2xl font-headline text-amber-300 mt-1">{opponentScore}</div>
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
              border border-amber-500/50 bg-amber-600/25 text-amber-200
              hover:bg-amber-500/40 hover:border-amber-400/70 hover:text-amber-100
              hover:shadow-[0_0_16px_rgba(245,158,11,0.3)]
              active:scale-95 transition-all duration-150"
          >
            {t('diceGame.exit', 'Wyjdź')}
          </button>
        </div>
      )}

      {/* ── Scoreboard header ── */}
      <div className="flex items-center justify-between text-xs font-label text-on-surface-variant px-1">
        <span>
          {t('diceGame.round', {
            current: round,
            total: totalRounds,
            defaultValue: 'Runda {{current}}/{{total}}',
          })}
        </span>
        <span className="font-headline text-sm text-on-surface tabular-nums">
          {playerScore} – {opponentScore}
        </span>
        <div className="flex items-center gap-2">
          {potMultiplier > 1 && (
            <span className="flex items-center gap-0.5 text-amber-400 font-accent">
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>toll</span>
              ×{potMultiplier}
            </span>
          )}
          {goldDelta !== 0 && (
            <span className={`tabular-nums ${goldDelta > 0 ? 'text-amber-300' : 'text-red-400'}`}>
              {goldDelta > 0 ? '+' : ''}{goldDelta} MK
            </span>
          )}
        </div>
      </div>

      {/* ── Dice table — two hands ── */}
      <div className="flex items-start gap-0">
        <DiceHand
          dice={playerDice}
          total={playerTotal}
          name={playerName}
          rolling={rolling === 'player'}
          comboLabel={playerCombo?.label}
          comboGlow={comboGlow(playerCombo)}
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

        <DiceHand
          dice={opponentDice}
          total={opponentTotal}
          name={opponentName}
          rolling={rolling === 'opponent'}
          comboLabel={opponentCombo?.label}
          comboGlow={comboGlow(opponentCombo)}
        />
      </div>

      {/* ── Commentary bubble ── */}
      <CommentaryBubble name={opponentName} text={commentary} />

      {/* ── Action buttons ── */}
      <div className="flex items-center justify-center gap-3">
        {isBetting && (
          <button
            onClick={raise}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-accent text-sm
              border border-amber-500/50 bg-amber-600/20 text-amber-300
              hover:bg-amber-500/35 hover:border-amber-400/70 hover:shadow-[0_0_12px_rgba(245,158,11,0.3)]
              active:scale-95 transition-all duration-150"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>trending_up</span>
            {t('diceGame.raise', 'Podbij')}
          </button>
        )}

        {isBetting && (
          <button
            onClick={play}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-accent text-sm
              border border-blue-500/50 bg-blue-600/20 text-blue-300
              hover:bg-blue-500/35 hover:border-blue-400/70 hover:shadow-[0_0_12px_rgba(59,130,246,0.3)]
              active:scale-95 transition-all duration-150"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>casino</span>
            {t('diceGame.play', 'Graj')}
          </button>
        )}

        <button
          onClick={forfeit}
          disabled={isFinished || phase === 'countdown'}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg font-accent text-sm
            border border-rose-500/50 bg-rose-600/20 text-rose-300
            hover:bg-rose-500/35 hover:border-rose-400/70 hover:shadow-[0_0_12px_rgba(244,63,94,0.3)]
            active:scale-95 transition-all duration-150
            disabled:opacity-30 disabled:cursor-not-allowed disabled:scale-100"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>logout</span>
          {t('diceGame.forfeit', 'Poddaj')}
        </button>
      </div>
    </div>
  );
}
