import { useTranslation } from 'react-i18next';
import { getBonus } from '../../services/gameState';

const STAT_CONFIG = [
  { key: 'ws', icon: 'swords' },
  { key: 'bs', icon: 'target' },
  { key: 's', icon: 'fitness_center' },
  { key: 't', icon: 'shield' },
  { key: 'i', icon: 'bolt' },
  { key: 'ag', icon: 'directions_run' },
  { key: 'dex', icon: 'precision_manufacturing' },
  { key: 'int', icon: 'menu_book' },
  { key: 'wp', icon: 'psychology' },
  { key: 'fel', icon: 'handshake' },
];

export default function StatsGrid({ characteristics, advances }) {
  const { t } = useTranslation();

  if (!characteristics) return null;

  return (
    <div className="grid grid-cols-5 gap-3">
      {STAT_CONFIG.map(({ key, icon }) => {
        const value = characteristics[key] || 0;
        const bonus = getBonus(value);
        const adv = advances?.[key] || 0;

        return (
          <div
            key={key}
            className="bg-surface-container-high/60 backdrop-blur-md p-4 border-b-2 border-primary/20 flex flex-col items-center text-center transition-all hover:bg-surface-container-highest/80"
          >
            <span className="material-symbols-outlined text-primary-dim mb-1 text-2xl">
              {icon}
            </span>
            <span className="text-on-surface-variant font-label text-[9px] uppercase tracking-[0.15em] mb-1">
              {t(`stats.${key}`)}
            </span>
            <span className="text-tertiary font-headline text-3xl">{value}</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-primary-dim text-[10px] font-bold">
                B: {bonus}
              </span>
              {adv > 0 && (
                <span className="text-green-400 text-[10px] font-bold">
                  +{adv}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
