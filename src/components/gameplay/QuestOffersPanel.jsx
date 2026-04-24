import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const TYPE_STYLES = {
  main: 'bg-primary/15 text-primary border-primary/25',
  side: 'bg-tertiary/15 text-tertiary border-tertiary/25',
  personal: 'bg-secondary/15 text-secondary border-secondary/25',
};

const TYPE_ICONS = {
  main: 'local_fire_department',
  side: 'explore',
  personal: 'person',
};

export default function QuestOffersPanel({ offers = [], onAccept, onDecline }) {
  const { t } = useTranslation();
  const [expandedId, setExpandedId] = useState(null);

  // Side/personal/faction questy są wyłączone w tym buildzie — filter offer.type.
  // Domyślny main zachowuje backward-compat dla offers bez type.
  const filteredOffers = offers.filter((o) => (o.type || 'main') === 'main');
  const pendingOffers = filteredOffers.filter((o) => o.status === 'pending');
  const resolvedOffers = filteredOffers.filter((o) => o.status !== 'pending');

  if (filteredOffers.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-base text-tertiary">assignment</span>
        <h3 className="text-sm font-headline text-tertiary tracking-wide">
          {t('gameplay.questOffers')}
        </h3>
        {pendingOffers.length > 0 && (
          <span className="text-[10px] font-label text-on-surface-variant bg-surface-container-highest/60 px-1.5 py-0.5 rounded-full">
            {pendingOffers.length}
          </span>
        )}
      </div>

      <div className="space-y-2.5">
        {filteredOffers.map((offer) => {
          const isExpanded = expandedId === offer.id;
          const isAccepted = offer.status === 'accepted';
          const isDeclined = offer.status === 'declined';
          const isPending = offer.status === 'pending';
          const typeKey = offer.type || 'side';
          const typeStyle = TYPE_STYLES[typeKey] || TYPE_STYLES.side;
          const typeIcon = TYPE_ICONS[typeKey] || TYPE_ICONS.side;

          return (
            <div
              key={offer.id}
              className={`rounded-sm border transition-all duration-300 ${
                isAccepted
                  ? 'bg-primary/5 border-primary/20'
                  : isDeclined
                    ? 'bg-surface-dim/30 border-outline-variant/10 opacity-50'
                    : 'bg-surface-container-high/40 border-outline-variant/15 hover:border-primary/20'
              }`}
            >
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : offer.id)}
                className="w-full text-left p-4"
              >
                <div className="flex items-start gap-3">
                  <span className={`material-symbols-outlined text-lg mt-0.5 ${isAccepted ? 'text-primary' : isDeclined ? 'text-outline' : 'text-tertiary'}`}>
                    {isAccepted ? 'check_circle' : isDeclined ? 'cancel' : 'assignment'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-sm font-headline ${isDeclined ? 'line-through text-on-surface-variant' : 'text-on-surface'}`}>
                        {offer.name}
                      </span>
                      <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-label uppercase tracking-widest rounded-sm border ${typeStyle}`}>
                        <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>{typeIcon}</span>
                        {t(`gameplay.questType_${typeKey}`)}
                      </span>
                      {isAccepted && (
                        <span className="text-[9px] font-label text-primary uppercase tracking-widest">
                          {t('gameplay.questOfferAccepted')}
                        </span>
                      )}
                      {isDeclined && (
                        <span className="text-[9px] font-label text-on-surface-variant uppercase tracking-widest">
                          {t('gameplay.questOfferDeclined')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-on-surface-variant leading-relaxed line-clamp-2">
                      {offer.description}
                    </p>
                  </div>
                  <span className={`material-symbols-outlined text-sm text-outline/40 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                    expand_more
                  </span>
                </div>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 space-y-3 animate-fade-in">
                  <div className="border-t border-outline-variant/10 pt-3 ml-9">
                    {offer.offeredBy && (
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="material-symbols-outlined text-xs text-on-surface-variant">person</span>
                        <span className="text-[10px] font-label text-on-surface-variant uppercase tracking-widest">
                          {t('gameplay.questOfferFrom')}:
                        </span>
                        <span className="text-xs text-on-surface">{offer.offeredBy}</span>
                      </div>
                    )}

                    {offer.reward && (
                      <div className="flex items-start gap-2 bg-amber-500/8 border border-amber-500/15 rounded-sm p-2.5 mb-2">
                        <span className="material-symbols-outlined text-sm text-amber-400 mt-0.5">paid</span>
                        <div>
                          <p className="text-[10px] font-label text-amber-400/80 uppercase tracking-widest mb-0.5">
                            {t('gameplay.questOfferReward')}
                          </p>
                          <p className="text-xs text-on-surface leading-relaxed">
                            {typeof offer.reward === 'string'
                              ? offer.reward
                              : (() => {
                                  const parts = [];
                                  if (offer.reward.xp) parts.push(`${offer.reward.xp} XP`);
                                  if (offer.reward.money) {
                                    const m = offer.reward.money;
                                    if (m.gold) parts.push(`${m.gold} ZK`);
                                    if (m.silver) parts.push(`${m.silver} SK`);
                                    if (m.copper) parts.push(`${m.copper} MK`);
                                  }
                                  if (offer.reward.items?.length > 0) parts.push(offer.reward.items.map((i) => i.name || i).join(', '));
                                  return parts.length > 0 ? parts.join(', ') : offer.reward.description || '';
                                })()
                            }
                          </p>
                        </div>
                      </div>
                    )}

                    {offer.completionCondition && (
                      <div className="bg-primary/5 border border-primary/10 rounded-sm p-2.5 mb-2">
                        <p className="text-[10px] font-label text-primary-dim uppercase tracking-widest mb-0.5">
                          {t('quests.completionCondition')}
                        </p>
                        <p className="text-xs text-on-surface leading-relaxed">{offer.completionCondition}</p>
                      </div>
                    )}

                    {offer.objectives?.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1.5">
                          {t('quests.objectives')}
                        </p>
                        <div key={offer.objectives[0].id} className="flex items-start gap-2 py-0.5">
                          <span className="material-symbols-outlined text-sm text-outline/30 mt-0.5">
                            check_box_outline_blank
                          </span>
                          <p className="text-xs text-on-surface leading-relaxed">{offer.objectives[0].description}</p>
                        </div>
                        {offer.objectives.length > 1 && (
                          <div className="flex items-center gap-2 py-0.5 text-outline/40">
                            <span className="material-symbols-outlined text-sm mt-0.5">lock</span>
                            <p className="text-xs italic">{t('quests.hiddenObjectives', { count: offer.objectives.length - 1 })}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {isPending && (
                    <div className="flex items-center gap-2 ml-9 pt-1">
                      <button
                        type="button"
                        onClick={() => onAccept?.(offer)}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-label bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 hover:border-primary/40 rounded-sm transition-all"
                      >
                        <span className="material-symbols-outlined text-sm">check</span>
                        {t('gameplay.questOfferAccept')}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDecline?.(offer.id)}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-label text-on-surface-variant hover:text-on-surface bg-surface-container-highest/40 hover:bg-surface-container-highest/80 border border-outline-variant/10 rounded-sm transition-all"
                      >
                        <span className="material-symbols-outlined text-sm">close</span>
                        {t('gameplay.questOfferDecline')}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
