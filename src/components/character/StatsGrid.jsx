import { useTranslation } from 'react-i18next';
import { ATTRIBUTE_KEYS, ATTRIBUTE_SHORT } from '../../data/rpgSystem';
import Tooltip from '../ui/Tooltip';

const ATTR_ICONS = {
  sila: 'fitness_center',
  inteligencja: 'menu_book',
  charyzma: 'handshake',
  zrecznosc: 'directions_run',
  wytrzymalosc: 'shield',
  szczescie: 'casino',
};

export default function StatsGrid({ attributes, mana }) {
  const { t } = useTranslation();

  if (!attributes) return null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {ATTRIBUTE_KEYS.map((key) => {
          const value = attributes[key] || 0;
          const icon = ATTR_ICONS[key] || 'star';
          const short = ATTRIBUTE_SHORT[key] || key;

          return (
            <Tooltip key={key} content={t(`tooltips.stats.${key}`, { defaultValue: '' })}>
              <div
                className="bg-surface-container-high/60 backdrop-blur-md p-4 border-b-2 border-primary/20 flex flex-col items-center text-center transition-all hover:bg-surface-container-highest/80"
              >
                <span className="material-symbols-outlined text-primary-dim mb-1 text-2xl">
                  {icon}
                </span>
                <span className="text-on-surface-variant font-label text-[9px] uppercase tracking-[0.15em] mb-1">
                  {short}
                </span>
                <span className="text-tertiary font-headline text-3xl">{value}</span>
              </div>
            </Tooltip>
          );
        })}
      </div>

      {mana && (
        <div className="flex items-center gap-3 px-3 py-2 bg-tertiary-container/10 border border-tertiary/20 rounded-sm">
          <span className="material-symbols-outlined text-tertiary text-lg">water_drop</span>
          <span className="text-xs font-label uppercase tracking-widest text-on-surface-variant">Mana</span>
          <div className="flex-1 h-2 bg-surface-container-high/60 rounded-full overflow-hidden">
            <div
              className="h-full bg-tertiary rounded-full transition-all duration-300"
              style={{ width: `${mana.max > 0 ? (mana.current / mana.max) * 100 : 0}%` }}
            />
          </div>
          <span className="text-sm font-headline text-tertiary tabular-nums">
            {mana.current}/{mana.max}
          </span>
        </div>
      )}
    </div>
  );
}
