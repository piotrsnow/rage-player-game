import { useTranslation } from 'react-i18next';

const rarityColors = {
  common: 'border-outline-variant/20 text-on-surface-variant',
  uncommon: 'border-primary/20 text-primary-dim',
  rare: 'border-primary/40 text-primary shadow-[0_0_8px_rgba(147,130,220,0.15)]',
  epic: 'border-tertiary/30 text-tertiary-dim shadow-[0_0_10px_rgba(197,154,255,0.25)]',
  legendary: 'border-tertiary/50 text-tertiary shadow-[0_0_12px_rgba(255,239,213,0.3)]',
};

const typeIcons = {
  weapon: 'swords',
  armor: 'shield',
  potion: 'local_bar',
  scroll: 'receipt_long',
  artifact: 'diamond',
  tool: 'handyman',
  food: 'restaurant',
  clothing: 'checkroom',
  key: 'key',
  book: 'menu_book',
  ring: 'diamond',
  ammunition: 'target',
  trinket: 'token',
  currency: 'paid',
  shield: 'shield_with_heart',
  misc: 'category',
};

function CoinDisplay({ value, label, color }) {
  return (
    <div className="flex items-center gap-1.5" title={label}>
      <div className={`w-5 h-5 rounded-full ${color} flex items-center justify-center text-[9px] font-bold shadow-sm`}>
        {label.charAt(0)}
      </div>
      <span className="text-sm font-headline text-on-surface">{value}</span>
    </div>
  );
}

export default function Inventory({ items = [], money }) {
  const { t } = useTranslation();
  const maxSlots = 12;
  const emptySlots = Math.max(0, maxSlots - items.length);
  const purse = money || { gold: 0, silver: 0, copper: 0 };

  return (
    <div className="bg-surface-container-low p-6 rounded-sm border border-outline-variant/10 shadow-xl">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-tertiary font-headline text-xl">{t('inventory.title')}</h3>
        <span className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest">
          {t('inventory.slots', { current: items.length, max: maxSlots })}
        </span>
      </div>
      <div className="flex items-center gap-1.5 mb-5 px-3 py-2.5 bg-surface-container-highest/50 border border-outline-variant/10 rounded-sm">
        <span className="material-symbols-outlined text-base text-on-surface-variant mr-1">account_balance_wallet</span>
        <span className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest mr-3">{t('currency.purse')}</span>
        <div className="flex items-center gap-4">
          <CoinDisplay value={purse.gold} label={t('currency.goldShort')} color="bg-yellow-500/90 text-yellow-950" />
          <CoinDisplay value={purse.silver} label={t('currency.silverShort')} color="bg-gray-300/90 text-gray-700" />
          <CoinDisplay value={purse.copper} label={t('currency.copperShort')} color="bg-orange-600/80 text-orange-100" />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {items.map((item) => {
          const rarity = rarityColors[item.rarity] || rarityColors.common;
          const icon = typeIcons[item.type] || typeIcons.misc;
          return (
            <div
              key={item.id}
              title={`${item.name}\n${item.description}`}
              className={`aspect-square bg-surface-container-highest border ${rarity} flex flex-col items-center justify-center gap-1 group cursor-pointer relative hover:scale-105 transition-transform`}
            >
              <span
                className="material-symbols-outlined group-hover:scale-110 transition-transform text-xl"
                style={{ fontVariationSettings: "'FILL' 1, 'wght' 300, 'GRAD' 0, 'opsz' 24" }}
              >
                {icon}
              </span>
              <span className="text-[8px] font-label leading-tight max-w-[calc(100%-8px)] truncate opacity-70">
                {item.name}
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
