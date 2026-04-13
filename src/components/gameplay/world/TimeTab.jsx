const TIME_ICONS = { morning: 'wb_sunny', afternoon: 'light_mode', evening: 'wb_twilight', night: 'dark_mode' };

export default function TimeTab({ timeState, t }) {
  const hour = timeState.hour ?? 6;
  const hh = Math.floor(hour);
  const mm = Math.round((hour - hh) * 60);
  const displayHour = `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-6">
      <span className="material-symbols-outlined text-5xl text-primary">{TIME_ICONS[timeState.timeOfDay] || 'schedule'}</span>
      <div className="text-center space-y-2">
        <div className="text-3xl font-headline text-primary tabular-nums">{displayHour}</div>
        <div className="text-lg font-bold text-on-surface capitalize">{t(`worldState.periods.${timeState.timeOfDay}`, timeState.timeOfDay)}</div>
        <div className="text-sm text-on-surface-variant">{t('worldState.day')} {timeState.day}</div>
        <div className="text-[11px] text-outline capitalize">{t('worldState.season')}: {t(`worldState.seasons.${timeState.season}`, timeState.season)}</div>
      </div>
    </div>
  );
}
