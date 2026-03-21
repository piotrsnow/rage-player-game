import { useTranslation } from 'react-i18next';

const rarityColors = {
  common: 'border-outline-variant/20 text-on-surface-variant',
  uncommon: 'border-primary/20 text-primary-dim',
  rare: 'border-primary/40 text-primary',
  epic: 'border-tertiary/30 text-tertiary-dim',
  legendary: 'border-tertiary/50 text-tertiary',
};

const typeIcons = {
  weapon: 'swords',
  armor: 'shield',
  potion: 'science',
  scroll: 'auto_fix_high',
  artifact: 'diamond',
  misc: 'category',
};

export default function Inventory({ items = [] }) {
  const { t } = useTranslation();
  const maxSlots = 12;
  const emptySlots = Math.max(0, maxSlots - items.length);

  return (
    <div className="bg-surface-container-low p-6 rounded-sm border border-outline-variant/10 shadow-xl">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-tertiary font-headline text-xl">{t('inventory.title')}</h3>
        <span className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest">
          {t('inventory.slots', { current: items.length, max: maxSlots })}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {items.map((item) => {
          const rarity = rarityColors[item.rarity] || rarityColors.common;
          const icon = typeIcons[item.type] || typeIcons.misc;
          return (
            <div
              key={item.id}
              title={`${item.name}\n${item.description}`}
              className={`aspect-square bg-surface-container-highest border ${rarity} flex items-center justify-center group cursor-pointer relative hover:scale-105 transition-transform`}
            >
              <span className="material-symbols-outlined group-hover:scale-110 transition-transform">
                {icon}
              </span>
              {item.rarity === 'legendary' && (
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-tertiary rounded-full shadow-[0_0_6px_rgba(255,239,213,0.6)]" />
              )}
              {item.rarity === 'epic' && (
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full shadow-[0_0_6px_rgba(197,154,255,0.6)]" />
              )}
            </div>
          );
        })}
        {Array.from({ length: emptySlots }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="aspect-square bg-surface-dim/50 border border-outline-variant/10 border-dashed"
          />
        ))}
      </div>
    </div>
  );
}
