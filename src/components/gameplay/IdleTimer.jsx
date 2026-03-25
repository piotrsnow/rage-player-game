import { useTranslation } from 'react-i18next';

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function IdleTimer({ idleSeconds, timerActive, lastRoll, isRolling }) {
  const { t } = useTranslation();

  if (!timerActive && !lastRoll) return null;

  const showTimer = timerActive && idleSeconds > 0;
  const pulseIntensity = Math.min(idleSeconds / 120, 1);

  return (
    <div className="flex items-center gap-3 text-[10px] text-on-surface-variant">
      {showTimer && (
        <div
          className="flex items-center gap-1.5 transition-opacity duration-500"
          style={{ opacity: 0.4 + pulseIntensity * 0.6 }}
        >
          <span
            className="material-symbols-outlined text-xs"
            style={{ opacity: 0.5 + pulseIntensity * 0.5 }}
          >
            hourglass_top
          </span>
          <span className="tabular-nums font-mono tracking-wider">
            {formatTime(idleSeconds)}
          </span>
        </div>
      )}

      {lastRoll && (
        <div
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded-sm border transition-all duration-300 ${
            isRolling ? 'animate-pulse' : ''
          } ${
            lastRoll.triggered
              ? 'bg-tertiary/15 border-tertiary/30 text-tertiary'
              : 'bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant'
          }`}
        >
          <span className="material-symbols-outlined text-xs">casino</span>
          <span className="tabular-nums font-mono">
            {t('idle.rollResult', 'd100: {{roll}} (< {{threshold}})', {
              roll: lastRoll.roll,
              threshold: lastRoll.threshold,
            })}
          </span>
          {lastRoll.triggered && (
            <span className="text-tertiary font-bold ml-1">
              {t('idle.somethingHappens', '...')}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
