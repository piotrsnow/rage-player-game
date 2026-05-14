import { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import DiceRoller from '../../../effects/DiceRoller';

const THROW_DURATION_MS = 2000;
const COMBAT_DICE_THEME = {
  materialColor: 0xd13a2f,
  materialSpecular: 0x5a1612,
  labelColor: '#ffe4df',
  diceColor: '#4a0a06',
  ambientLightColor: 0xff6a4f,
  ambientLightIntensity: 0.6,
  spotLightColor: 0xffc0b5,
  spotLightIntensity: 0.78,
  deskColor: '#1b0503',
};

/**
 * Floating 3D dice throw before the combat manoeuvre is resolved.
 * It auto-dismisses after 2s and never installs a fullscreen overlay.
 */
export default function CombatDiceThrow({ onDone, anchorRect, spellName }) {
  const doneRef = useRef(false);
  const timerRef = useRef(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    onDoneRef.current?.();
  }, []);

  useEffect(() => {
    timerRef.current = setTimeout(finish, THROW_DURATION_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [finish]);

  const placeholderRoll = useRef({ roll: Math.floor(Math.random() * 50) + 1 }).current;
  const ignoreRollComplete = useCallback(() => {}, []);
  const size = spellName ? 2.7 : 2.4;

  const bottomY = anchorRect
    ? anchorRect.bottom
    : window.innerHeight * 0.75;
  const centerX = anchorRect
    ? anchorRect.left + anchorRect.width / 2
    : window.innerWidth / 2;

  return createPortal(
    <div
      className="combat-dice-throw-stage"
      style={{
        left: centerX,
        top: bottomY - 220,
        transform: 'translate(-50%, 0)',
      }}
    >
      <DiceRoller
        diceRoll={placeholderRoll}
        onComplete={ignoreRollComplete}
        showOverlayResult={false}
        sizeMultiplier={size}
        durationMultiplier={0.75}
        variant="overlay"
        overlayTheme={COMBAT_DICE_THEME}
        preRollRevealMs={0}
        isVisible
      />
    </div>,
    document.body,
  );
}

export { THROW_DURATION_MS };
