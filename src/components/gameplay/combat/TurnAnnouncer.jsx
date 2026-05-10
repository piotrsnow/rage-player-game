import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

const DISPLAY_MS = 1200;
const FADE_MS = 300;

export default function TurnAnnouncer({ currentTurn, isMyTurn, combatOver, isMultiplayer, round }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);
  const [displayData, setDisplayData] = useState(null);
  const prevTurnRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (combatOver || !currentTurn) return;
    const turnKey = `${currentTurn.id}:${round}`;
    if (turnKey === prevTurnRef.current) return;
    prevTurnRef.current = turnKey;

    const isEnemy = currentTurn.type === 'enemy';
    const isAlly = currentTurn.type === 'ally';

    let label;
    let color;
    if (isMyTurn) {
      label = t('combat.yourTurn', 'TWÓJ RUCH');
      color = 'text-emerald-300';
    } else if (isEnemy) {
      label = t('combat.enemyTurn', 'TURA WROGA');
      color = 'text-red-400';
    } else if (isAlly) {
      label = t('combat.allyTurn', 'TURA SOJUSZNIKA');
      color = 'text-sky-300';
    } else if (isMultiplayer) {
      label = t('combat.waitingForPlayer', 'Czekasz na {{name}}', { name: currentTurn.name });
      color = 'text-amber-300';
    } else {
      return;
    }

    setDisplayData({ name: currentTurn.name, label, color, isMyTurn });
    setFading(false);
    setVisible(true);

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setFading(true);
      setTimeout(() => setVisible(false), FADE_MS);
    }, DISPLAY_MS);
  }, [currentTurn, isMyTurn, combatOver, isMultiplayer, round, t]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  if (!visible || !displayData) return null;

  return (
    <div
      className={`
        pointer-events-none fixed inset-0 z-[100] flex items-center justify-center
        transition-opacity duration-300
        ${fading ? 'opacity-0' : 'opacity-100'}
      `}
    >
      <div className="flex flex-col items-center gap-1 drop-shadow-2xl">
        <span className={`text-4xl sm:text-5xl font-black tracking-widest uppercase ${displayData.color} animate-combat-announce`}>
          {displayData.label}
        </span>
        {!displayData.isMyTurn && (
          <span className="text-lg sm:text-xl font-semibold text-white/70">
            {displayData.name}
          </span>
        )}
      </div>
    </div>
  );
}
