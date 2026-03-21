import { useTranslation } from 'react-i18next';
import { getModifier } from '../../services/gameState';

export default function StatsGrid({ stats }) {
  const { t } = useTranslation();

  const statConfig = [
    { key: 'str', label: t('stats.strength'), icon: 'fitness_center' },
    { key: 'dex', label: t('stats.dexterity'), icon: 'bolt' },
    { key: 'con', label: t('stats.constitution'), icon: 'favorite' },
    { key: 'int', label: t('stats.intelligence'), icon: 'menu_book' },
    { key: 'wis', label: t('stats.wisdom'), icon: 'visibility' },
    { key: 'cha', label: t('stats.charisma'), icon: 'auto_awesome' },
  ];

  if (!stats) return null;

  return (
    <div className="grid grid-cols-2 gap-4">
      {statConfig.map(({ key, label, icon }) => {
        const value = stats[key] || 10;
        const mod = getModifier(value);
        const modStr = mod >= 0 ? `+${mod}` : `${mod}`;

        return (
          <div
            key={key}
            className="bg-surface-container-high/60 backdrop-blur-md p-6 border-b-2 border-primary/20 flex flex-col items-center text-center transition-all hover:bg-surface-container-highest/80"
          >
            <span className="material-symbols-outlined text-primary-dim mb-2 text-3xl">
              {icon}
            </span>
            <span className="text-on-surface-variant font-label text-[10px] uppercase tracking-[0.2em] mb-1">
              {label}
            </span>
            <span className="text-tertiary font-headline text-4xl">{value}</span>
            <span className="text-primary-dim text-xs font-bold mt-1">{modStr}</span>
          </div>
        );
      })}
    </div>
  );
}
