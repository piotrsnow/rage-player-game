import { useRef, useEffect, useState } from 'react';
import { ensureDiceLibrary } from './diceLibraryLoader';

const PRE_ROLL_REVEAL_MS = 280;

/** Modal dice: lower durationMultiplier = faster physics (library divides timestep by this). */
export const MODAL_DICE_DURATION_MULT = 1.15;
export const MODAL_DICE_STAGE_CLASS = 'relative w-[320px] h-[260px] mx-auto overflow-visible';
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

const POOL_MAX = 2;
const _diceBoxPool = [];

function acquireBox(DICE, container, options) {
  for (let i = 0; i < _diceBoxPool.length; i++) {
    const entry = _diceBoxPool[i];
    if (!entry.inUse) {
      entry.inUse = true;
      container.appendChild(entry.box.renderer.domElement);
      entry.box.container = container;
      entry.box.reinit(container);
      return entry.box;
    }
  }
  const box = new DICE.dice_box(container, options);
  if (_diceBoxPool.length < POOL_MAX) {
    _diceBoxPool.push({ box, inUse: true });
  }
  return box;
}

function releaseBox(box) {
  if (!box) return;
  box.running = false;
  box.rolling = false;
  try { box.clear?.(); } catch { /* already torn down */ }
  const canvas = box.renderer?.domElement;
  if (canvas?.parentNode) canvas.parentNode.removeChild(canvas);
  for (const entry of _diceBoxPool) {
    if (entry.box === box) { entry.inUse = false; return; }
  }
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.trunc(Math.max(min, Math.min(max, numeric)));
}

function getD50Results(roll) {
  const safeRoll = clampNumber(roll, 1, 50, 1);
  const zeroBasedRoll = safeRoll - 1;
  return [Math.floor(zeroBasedRoll / 10), (zeroBasedRoll % 10) + 1];
}

function getPercentileResults(roll) {
  if (roll === 100) return [0, 0];
  const safeRoll = clampNumber(roll, 0, 99, 0);
  return [Math.floor(safeRoll / 10), safeRoll % 10];
}

const DICE_MODE_CONFIG = {
  d50: {
    notation: 'd5+d10',
    getResults: getD50Results,
  },
  percentile: {
    notation: 'd100+d9',
    getResults: getPercentileResults,
  },
};

function getDiceModeConfig(diceMode) {
  return DICE_MODE_CONFIG[diceMode] ?? DICE_MODE_CONFIG.d50;
}

export default function DiceRoller({
  diceRoll,
  onComplete,
  showOverlayResult = true,
  sizeMultiplier = 1,
  durationMultiplier = 1,
  variant = 'default',
  overlayTheme = null,
  diceMode = 'd50',
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
  /** Fired immediately before physics throw starts (after preRollRevealMs). */
  onRollStart,
}) {
  const containerRef = useRef(null);
  const boxRef = useRef(null);
  const rollTimeoutRef = useRef(null);
  const rolledOnceRef = useRef(false);
  const targetFaceValuesRef = useRef(null);
  const onRollStartRef = useRef(onRollStart);
  onRollStartRef.current = onRollStart;
  const [ready, setReady] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [showDice, setShowDice] = useState(false);
  const diceModeConfig = getDiceModeConfig(diceMode);

  const clearTimers = () => {
    if (rollTimeoutRef.current) {
      window.clearTimeout(rollTimeoutRef.current);
      rollTimeoutRef.current = null;
    }
  };

  const stopDiceBox = () => {
    const box = boxRef.current;
    if (!box) return;
    box.running = false;
    box.rolling = false;
    try {
      box.clear?.();
    } catch {
      /* dice library may already be tearing down */
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
                ...(overlayTheme ?? {}),
              }
            : undefined;

        containerRef.current.innerHTML = '';
        const box = acquireBox(DICE, containerRef.current, boxOptions);
        box.setDice(diceModeConfig.notation);
        boxRef.current = box;
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(false);
      });

    return () => {
      cancelled = true;
      clearTimers();
      const box = boxRef.current;
      boxRef.current = null;
      releaseBox(box);
      setReady(false);
    };
  }, [variant, sizeMultiplier, durationMultiplier, overlayTheme, maxPixelRatio, antialias, physicsSolverIterations, diceModeConfig.notation]);

  useEffect(() => {
    if (!ready || !boxRef.current) return;

    clearTimers();

    if (!diceRoll || !isVisible) {
      stopDiceBox();
      setShowResult(false);
      setShowDice(false);
      return;
    }

    const box = boxRef.current;
    const rawRoll = diceRoll.roll ?? diceRoll.rolledValue;
    const requestedResults = diceModeConfig.getResults(rawRoll);
    targetFaceValuesRef.current = requestedResults.slice();
    rolledOnceRef.current = false;
    setShowResult(false);
    setShowDice(true);
    rollTimeoutRef.current = window.setTimeout(() => {
      onRollStartRef.current?.();
      box.setDice(diceModeConfig.notation);
      box.start_throw_fast(
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
  }, [ready, diceRoll, onComplete, isVisible, preRollRevealMs, diceModeConfig]);

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
