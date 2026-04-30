import { useEffect, useRef, useState } from 'react';
import { ensureDiceLibrary } from '../../effects/diceLibraryLoader';
import LoadingSpinner from './LoadingSpinner';

const THEME = {
  materialColor: 0xd0b0ff,
  materialSpecular: 0x6a3d8a,
  labelColor: '#ccbbdd',
  diceColor: '#2a0845',
  ambientLightColor: 0xa070ff,
  ambientLightIntensity: 0.6,
  spotLightColor: 0xe8d0ff,
  spotLightIntensity: 0.75,
  deskColor: '#1a0624',
  useShadows: false,
  disableSpotLight: false,
};

// Lewitująca d20 kręcąca się bez końca. Robimy to przez hack na instancji
// `dice_box`: zerujemy grawitację, nadpisujemy detekcję zakończenia rzutu
// (biblioteka normalnie kończy rzut po ~600 iteracjach nawet bez grawitacji)
// i zerujemy damping na ciele kostki, żeby raz nadana prędkość kątowa
// nie malała. Jeśli biblioteka nie załaduje się (brak sieci, blokada),
// degradujemy do klasycznego `LoadingSpinner`.
export default function SpinningDice({ size = 128 }) {
  const containerRef = useRef(null);
  const boxRef = useRef(null);
  const [state, setState] = useState('loading');

  useEffect(() => {
    let cancelled = false;

    ensureDiceLibrary()
      .then((DICE) => {
        if (cancelled || !containerRef.current) return;

        containerRef.current.innerHTML = '';
        const box = new DICE.dice_box(containerRef.current, {
          scaleMultiplier: 2,
          hideDeskVisual: true,
          durationMultiplier: 1,
          ...THEME,
        });

        box.world.gravity.set(0, 0, 0);
        box.check_if_throw_finished = () => false;

        const pos = { x: 0, y: 0, z: 200 };
        const velocity = { x: 0, y: 0, z: 0 };
        const angularVel = { x: 2.2, y: 3.1, z: 1.4 };
        const axis = { x: 0.3, y: 0.8, z: 0.1, a: 0 };
        box.create_dice('d20', pos, velocity, angularVel, axis);

        const die = box.dices[0];
        if (die && die.body) {
          die.body.angularDamping = 0;
          die.body.linearDamping = 0;
        }

        box.last_time = 0;
        box.running = Date.now();
        box.__animate(box.running);

        boxRef.current = box;
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('fallback');
      });

    return () => {
      cancelled = true;
      const box = boxRef.current;
      if (box) box.running = false;
      boxRef.current = null;
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, []);

  if (state === 'fallback') {
    return <LoadingSpinner size="lg" />;
  }

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div
        ref={containerRef}
        className="absolute inset-0 overflow-visible bg-transparent [&_canvas]:!bg-transparent"
        style={{ filter: 'drop-shadow(0 0 10px rgba(140, 60, 200, 0.22)) brightness(0.95)' }}
      />
      {state === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      )}
    </div>
  );
}
