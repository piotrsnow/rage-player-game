import { useTranslation } from 'react-i18next';

const NEEDS_CONFIG = [
  { key: 'hunger', icon: 'restaurant', color: 'from-amber-600 to-amber-400', textColor: 'text-amber-400', critical: 15 },
  { key: 'thirst', icon: 'water_drop', color: 'from-blue-600 to-blue-400', textColor: 'text-blue-400', critical: 15 },
  { key: 'bladder', icon: 'wc', color: 'from-yellow-600 to-yellow-400', textColor: 'text-yellow-400', critical: 10 },
  { key: 'hygiene', icon: 'shower', color: 'from-cyan-600 to-cyan-400', textColor: 'text-cyan-400', critical: 20 },
  { key: 'rest', icon: 'bedtime', color: 'from-indigo-600 to-indigo-400', textColor: 'text-indigo-400', critical: 15 },
];

const PERIOD_ICONS = { morning: 'wb_sunny', afternoon: 'light_mode', evening: 'wb_twilight', night: 'dark_mode' };

export default function NeedsPanel({ needs, timeState }) {
  const { t } = useTranslation();

  if (!needs) return null;

  const hour = timeState?.hour ?? 6;
  const hh = Math.floor(hour);
  const mm = Math.round((hour - hh) * 60);
  const displayHour = `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
  const period = timeState?.timeOfDay || 'morning';
  const day = timeState?.day ?? 1;

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest">
          {t('needs.title')}
        </p>
        {timeState && (
          <div className="flex items-center gap-1.5 text-[10px] text-on-surface-variant font-label tabular-nums">
            <span className="material-symbols-outlined text-xs opacity-60">{PERIOD_ICONS[period] || 'schedule'}</span>
            <span>{t('worldState.day')} {day}</span>
            <span className="opacity-40">·</span>
            <span>{displayHour}</span>
          </div>
        )}
      </div>
      <div className="grid grid-cols-5 gap-2">
        {NEEDS_CONFIG.map(({ key, icon, color, textColor, critical }) => {
          const value = needs[key] ?? 100;
          const isCritical = value <= critical;
          const pct = Math.round(value);
          return (
            <div key={key} className="flex flex-col items-center gap-1">
              <span
                className={`material-symbols-outlined text-sm ${
                  isCritical ? 'text-error animate-pulse' : textColor
                }`}
                title={t(`needs.${key}`)}
              >
                {icon}
              </span>
              <div className="w-full h-1 bg-surface-container-highest rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ease-out bg-gradient-to-r ${
                    isCritical ? 'from-error to-error-dim animate-pulse' : color
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span
                className={`text-[9px] font-bold tabular-nums ${
                  isCritical ? 'text-error' : 'text-on-surface-variant'
                }`}
              >
                {pct}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
