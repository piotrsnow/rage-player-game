import { useRef, useEffect, useState } from 'react';

const SCRIPT_URLS = [
  '/vendor/dice-lib/libs/three.min.js',
  '/vendor/dice-lib/libs/cannon.min.js',
  '/vendor/dice-lib/libs/teal.js',
  '/vendor/dice-lib/dice.js',
];

let diceLibraryPromise = null;
const PRE_ROLL_REVEAL_MS = 520;
const OVERLAY_THEME = {
  materialColor: 0xf0f0f0,
  materialSpecular: 0x172022,
  labelColor: '#aaaaaa',
  diceColor: '#202020',
  ambientLightColor: 0xf0f0f0,
  ambientLightIntensity: 1,
  spotLightColor: 0xefefef,
  spotLightIntensity: 2,
  deskColor: '#1a0624',
  useShadows: false,
  disableSpotLight: false,
};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-dice-lib="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.dataset.diceLib = src;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

function ensureDiceLibrary() {
  if (window.DICE) return Promise.resolve(window.DICE);
  if (!diceLibraryPromise) {
    diceLibraryPromise = SCRIPT_URLS.reduce(
      (promise, src) => promise.then(() => loadScript(src)),
      Promise.resolve()
    ).then(() => window.DICE);
  }
  return diceLibraryPromise;
}

function getPercentileResults(roll) {
  if (roll === 100) return [0, 0];
  const safeRoll = Math.max(0, Math.min(99, Number(roll) || 0));
  return [Math.floor(safeRoll / 10) * 10, safeRoll % 10];
}

export default function DiceRoller({
  diceRoll,
  onComplete,
  showOverlayResult = true,
  sizeMultiplier = 1,
  durationMultiplier = 1,
  variant = 'default',
  isVisible = true,
}) {
  const containerRef = useRef(null);
  const boxRef = useRef(null);
  const rollTimeoutRef = useRef(null);
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
  }, [variant, sizeMultiplier, durationMultiplier]);

  useEffect(() => {
    if (!ready || !boxRef.current) return;

    clearTimers();

    if (!diceRoll || !isVisible) {
      setShowResult(false);
      setShowDice(false);
      return;
    }

    const box = boxRef.current;
    const requestedResults = getPercentileResults(diceRoll.roll);
    setShowResult(false);
    setShowDice(true);
    rollTimeoutRef.current = window.setTimeout(() => {
      box.setDice('d100+d9');
      box.start_throw(
        () => requestedResults,
        () => {
          setShowResult(true);
          onComplete?.();
        }
      );
    }, PRE_ROLL_REVEAL_MS);

    return () => {
      clearTimers();
    };
  }, [ready, diceRoll, onComplete, isVisible]);

  return (
    <div className={`relative h-full w-full overflow-visible bg-transparent transition-opacity duration-300 ${showDice && isVisible ? 'opacity-100' : 'opacity-0'}`}>
      <div
        ref={containerRef}
        className="absolute inset-0 h-full w-full overflow-visible bg-transparent [&_canvas]:!bg-transparent"
        style={variant === 'overlay' ? { filter: 'drop-shadow(0 0 10px rgba(170, 36, 110, 0.18)) brightness(0.98)' } : undefined}
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
