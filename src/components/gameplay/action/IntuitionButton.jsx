import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import IntuitionResultModal from './IntuitionResultModal';

const ICONS = [
  { key: 'look_around', icon: 'visibility' },
  { key: 'think', icon: 'psychology' },
  { key: 'hunch', icon: 'neurology' },
];

const GAME_DURATION_MS = 10000;

function getTier(ratio) {
  if (ratio <= 0.4) return 'excellent';
  if (ratio <= 0.6) return 'good';
  if (ratio <= 0.8) return 'mediocre';
  return 'terrible';
}

function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function IntuitionButton({ disabled, hasPendingAction, onSuggestedAction }) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState('idle'); // idle | active | caught | cooldown
  const [iconVisible, setIconVisible] = useState(false);
  const [currentIconIdx, setCurrentIconIdx] = useState(0);
  const [result, setResult] = useState(null);

  const visibleSinceRef = useRef(0);
  const visibleDurationRef = useRef(0);
  const gameTimerRef = useRef(null);
  const cycleTimerRef = useRef(null);
  const orderRef = useRef([0, 1, 2]);
  const orderPosRef = useRef(0);

  const cleanup = useCallback(() => {
    clearTimeout(gameTimerRef.current);
    clearTimeout(cycleTimerRef.current);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const nextCycle = useCallback(() => {
    const visibleMs = 100 + Math.random() * 400;
    const hiddenMs = 400 + Math.random() * 1100;

    orderPosRef.current = (orderPosRef.current + 1) % 3;
    if (orderPosRef.current === 0) {
      orderRef.current = shuffleArray([0, 1, 2]);
    }
    setCurrentIconIdx(orderRef.current[orderPosRef.current]);

    setIconVisible(true);
    visibleSinceRef.current = performance.now();
    visibleDurationRef.current = visibleMs;

    cycleTimerRef.current = setTimeout(() => {
      setIconVisible(false);
      cycleTimerRef.current = setTimeout(nextCycle, hiddenMs);
    }, visibleMs);
  }, []);

  const startGame = useCallback(() => {
    if (phase !== 'idle') return;
    setPhase('active');
    setIconVisible(false);
    orderRef.current = shuffleArray([0, 1, 2]);
    orderPosRef.current = -1;

    const initialDelay = 300 + Math.random() * 700;
    cycleTimerRef.current = setTimeout(nextCycle, initialDelay);

    gameTimerRef.current = setTimeout(() => {
      cleanup();
      setIconVisible(false);
      setPhase('cooldown');
    }, GAME_DURATION_MS);
  }, [phase, nextCycle, cleanup]);

  const handleIconClick = useCallback(() => {
    if (phase !== 'active' || !iconVisible) return;

    const reactionMs = performance.now() - visibleSinceRef.current;
    const ratio = Math.min(reactionMs / visibleDurationRef.current, 1);
    const tier = getTier(ratio);
    const caughtIcon = ICONS[currentIconIdx];

    cleanup();
    setIconVisible(false);
    setResult({ icon: caughtIcon, reactionMs: Math.round(reactionMs), tier, visibleMs: Math.round(visibleDurationRef.current) });
    setPhase('caught');
  }, [phase, iconVisible, currentIconIdx, cleanup]);

  const handleResultDismiss = useCallback(() => {
    if (!result) return;
    const { icon, tier } = result;

    const actionMap = {
      look_around: t('intuition.actionLookAround'),
      think: t('intuition.actionThink'),
      hunch: t('intuition.actionHunch'),
    };

    const action = `[INTUITION:${icon.key}:${tier}] ${actionMap[icon.key]}`;
    setResult(null);
    setPhase('cooldown');
    onSuggestedAction(action);
  }, [result, onSuggestedAction, t]);

  const isDisabled = disabled || hasPendingAction || phase === 'cooldown' || phase === 'caught';
  const isActive = phase === 'active';

  return (
    <>
      <div className="relative shrink-0">
        {isActive && (
          <div className="absolute -top-11 left-1/2 -translate-x-1/2 flex items-center justify-center w-9 h-9 z-10">
            {iconVisible ? (
              <button
                type="button"
                onClick={handleIconClick}
                className="w-9 h-9 flex items-center justify-center rounded-sm border border-amber-400/60 bg-amber-400/15 text-amber-300 animate-intuition-flash cursor-pointer hover:bg-amber-400/30 transition-colors"
              >
                <span className="material-symbols-outlined text-[20px] leading-none">
                  {ICONS[currentIconIdx].icon}
                </span>
              </button>
            ) : (
              <div className="w-9 h-9 flex items-center justify-center rounded-sm border border-outline-variant/10 bg-surface-container/30">
                <span className="material-symbols-outlined text-[16px] leading-none text-on-surface-variant/20">
                  more_horiz
                </span>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          aria-label={t('intuition.buttonLabel')}
          onClick={startGame}
          disabled={isDisabled}
          className={`shrink-0 inline-flex items-center justify-center w-9 h-9 border rounded-sm transition-all duration-200 hover:-translate-y-px hover:shadow-[0_10px_24px_rgba(0,0,0,0.3)] disabled:opacity-30 disabled:cursor-not-allowed ${
            isActive
              ? 'text-amber-300 bg-amber-400/15 border-amber-400/40 shadow-[0_0_12px_rgba(251,191,36,0.2)]'
              : phase === 'cooldown'
                ? 'text-on-surface-variant/40 bg-surface-container-high/20 border-outline-variant/10'
                : 'text-amber-400/80 hover:text-amber-300 bg-amber-400/8 hover:bg-amber-400/14 border-amber-400/20 hover:border-amber-400/40 animate-intuition-pulse'
          }`}
        >
          <span className="material-symbols-outlined text-[18px] leading-none">
            {isActive ? 'target' : 'help'}
          </span>
        </button>
      </div>

      {phase === 'caught' && result && (
        <IntuitionResultModal result={result} onDismiss={handleResultDismiss} />
      )}
    </>
  );
}
