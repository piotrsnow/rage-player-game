import { useRef, useEffect, useState } from 'react';
import { ensureDiceLibrary } from './diceLibraryLoader';

const PRE_ROLL_REVEAL_MS = 280;
const OVERLAY_THEME = {
  materialColor: 0xd0b0ff,
  materialSpecular: 0x6a3d8a,
  labelColor: '#ccbbdd',
  diceColor: '#2a0845',
  ambientLightColor: 0xa070ff,
  ambientLightIntensity: 0.52,
  spotLightColor: 0xe8d0ff,
  spotLightIntensity: 0.68,
  deskColor: '#1a0624',
  useShadows: false,
  disableSpotLight: false,
};

function getPercentileResults(roll) {
  if (roll === 100) return [0, 0];
  const safeRoll = Math.max(0, Math.min(99, Number(roll) || 0));
  return [Math.floor(safeRoll / 10), safeRoll % 10];
}

export default function DiceRoller({
  diceRoll,
  onComplete,
  showOverlayResult = true,
  sizeMultiplier = 1,
  durationMultiplier = 1,
  variant = 'default',
  isVisible = true,
  /** Delay before `start_throw` (overlay should align with CSS fly-in end). */
  preRollRevealMs = PRE_ROLL_REVEAL_MS,
  /** Overlay perf: cap canvas DPR (1 = big win on HiDPI) */
  maxPixelRatio,
  antialias,
  physicsSolverIterations,
  /** When true, click finishes the physics animation early (overlay flows). */
  skipOnClick = false,
  skipOnClickTitle,
}) {
  const containerRef = useRef(null);
  const boxRef = useRef(null);
  const rollTimeoutRef = useRef(null);
  const rolledOnceRef = useRef(false);
  const targetFaceValuesRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [showDice, setShowDice] = useState(false);

  const clearTimers = () => {
    if (rollTimeoutRef.current) {
      window.clearTimeout(rollTimeoutRef.current);
      rollTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    let cancelled = false;

    ensureDiceLibrary()
      .then((DICE) => {
        if (cancelled || !containerRef.current) return;

        const boxOptions =
          variant === 'overlay'
            ? {
                scaleMultiplier: sizeMultiplier,
                hideDeskVisual: true,
                durationMultiplier,
                maxPixelRatio: maxPixelRatio ?? 1,
                antialias: antialias ?? false,
                physicsSolverIterations: physicsSolverIterations ?? 5,
                ...OVERLAY_THEME,
              }
            : undefined;

        containerRef.current.innerHTML = '';
        const box = new DICE.dice_box(containerRef.current, boxOptions);
        box.setDice('d100+d9');
        boxRef.current = box;
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(false);
      });

    return () => {
      cancelled = true;
      clearTimers();
      boxRef.current = null;
      setReady(false);
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [variant, sizeMultiplier, durationMultiplier, maxPixelRatio, antialias, physicsSolverIterations]);

  useEffect(() => {
    if (!ready || !boxRef.current) return;

    clearTimers();

    if (!diceRoll || !isVisible) {
      setShowResult(false);
      setShowDice(false);
      return;
    }

    const box = boxRef.current;
    const rawRoll = diceRoll.roll ?? diceRoll.rolledValue;
    const requestedResults = getPercentileResults(rawRoll);
    targetFaceValuesRef.current = requestedResults.slice();
    rolledOnceRef.current = false;
    setShowResult(false);
    setShowDice(true);
    rollTimeoutRef.current = window.setTimeout(() => {
      box.setDice('d100+d9');
      box.start_throw(
        () => requestedResults,
        () => {
          if (rolledOnceRef.current) return;
          rolledOnceRef.current = true;
          setShowResult(true);
          onComplete?.();
        }
      );
    }, preRollRevealMs);

    return () => {
      clearTimers();
    };
  }, [ready, diceRoll, onComplete, isVisible, preRollRevealMs]);

  const trySkipAnimation = () => {
    if (!skipOnClick || rolledOnceRef.current) return;
    const box = boxRef.current;
    const faces = targetFaceValuesRef.current;
    if (!box?.callback || !Array.isArray(faces) || faces.length === 0) return;
    box.running = false;
    try {
      box.callback.call(box, faces);
    } catch {
      /* physics lib may be torn down */
    }
  };

  return (
    <div
      className={`relative h-full w-full overflow-visible bg-transparent transition-opacity duration-300 ${showDice && isVisible ? 'opacity-100' : 'opacity-0'} ${skipOnClick ? 'cursor-pointer' : ''}`}
      title={skipOnClick ? skipOnClickTitle : undefined}
      onClick={skipOnClick ? trySkipAnimation : undefined}
    >
      <div
        ref={containerRef}
        className="absolute inset-0 h-full w-full overflow-visible bg-transparent [&_canvas]:!bg-transparent"
      />
      {!ready && showDice && isVisible ? (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] uppercase tracking-[0.18em] text-on-surface-variant">
          Rolling...
        </div>
      ) : null}
      {showResult && showOverlayResult && diceRoll ? (
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 flex justify-center animate-fade-in">
          <div className="text-center">
            <p className="text-sm font-bold tracking-widest uppercase text-on-surface">
              {diceRoll.roll}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
