import { useTranslation } from 'react-i18next';

export default function TradeNpcPicker({ npcs, dispatch, onCancel }) {
  const { t } = useTranslation();

  const startTradeWith = (npc) => {
    dispatch({
      type: 'START_TRADE',
      payload: {
        active: true,
        npcName: npc.name,
        npcRole: npc.role || 'general',
        disposition: npc.disposition || 0,
        pendingSetup: true,
        shopItems: [],
        haggleAttempts: 0,
        maxHaggle: 3,
        haggleLog: [],
        haggleDiscounts: {},
      },
    });
    onCancel();
  };

  return (
    <div className="p-3 bg-surface-container-high border border-outline-variant/20 rounded-sm space-y-2 animate-fade-in">
      <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-2">
        {t('trade.tradeWith')}
      </label>
      {npcs.length > 0 ? (
        <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
          {npcs.map((npc) => (
            <button
              key={npc.id || npc.name}
              onClick={() => startTradeWith(npc)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-surface-container/60 border border-outline-variant/10 hover:border-tertiary/20 rounded-sm transition-all"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-xs text-tertiary">person</span>
                <span className="text-sm text-on-surface truncate">{npc.name}</span>
                {npc.role && <span className="text-[9px] text-on-surface-variant">({npc.role})</span>}
              </div>
              <span className="material-symbols-outlined text-xs text-tertiary">storefront</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-on-surface-variant/60 italic px-1">{t('gameplay.noNpcsNearby')}</p>
      )}
      <button
        onClick={onCancel}
        className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] font-label uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-colors"
      >
        {t('common.cancel')}
      </button>
    </div>
  );
}
