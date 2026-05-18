import { useTranslation } from 'react-i18next';

export const DEFAULT_POCKETS = ['Główna', 'Przednia', 'Lewa', 'Prawa'];

export default function PocketFilter({ items = [], activePocket, onPocketChange }) {
  const { t } = useTranslation();

  const allPockets = [
    ...DEFAULT_POCKETS,
    ...new Set(items.map((i) => i.pocket).filter((p) => p && !DEFAULT_POCKETS.includes(p))),
  ];

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <button
        onClick={() => onPocketChange(null)}
        className={`px-2.5 py-1 text-[9px] font-label font-bold uppercase tracking-wider rounded-sm border transition-colors ${
          !activePocket
            ? 'bg-primary/15 border-primary/30 text-primary'
            : 'bg-surface-container-highest/50 border-outline-variant/15 text-on-surface-variant hover:bg-primary/10 hover:border-primary/20 hover:text-primary'
        }`}
      >
        {t('inventory.pockets.all', 'Wszystko')}
      </button>

      {allPockets.map((pocket) => {
        const count = items.filter((i) => i.pocket === pocket).length;
        return (
          <button
            key={pocket}
            onClick={() => onPocketChange(activePocket === pocket ? null : pocket)}
            className={`px-2.5 py-1 text-[9px] font-label font-bold uppercase tracking-wider rounded-sm border transition-colors ${
              activePocket === pocket
                ? 'bg-primary/15 border-primary/30 text-primary'
                : 'bg-surface-container-highest/50 border-outline-variant/15 text-on-surface-variant hover:bg-primary/10 hover:border-primary/20 hover:text-primary'
            }`}
          >
            {pocket}
            {count > 0 && (
              <span className="ml-1 text-[8px] opacity-60">{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
