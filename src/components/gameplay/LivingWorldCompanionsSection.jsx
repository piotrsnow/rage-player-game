import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLivingWorldCompanions } from '../../hooks/useLivingWorldCompanions';

function LoyaltyBar({ loyalty }) {
  const pct = Math.max(0, Math.min(100, loyalty ?? 50));
  const color =
    pct >= 75 ? 'bg-tertiary' :
    pct >= 40 ? 'bg-primary' :
    pct >= 15 ? 'bg-secondary' :
    'bg-error';
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <div className="flex-1 h-1 bg-surface-container rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all duration-300`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[9px] text-on-surface-variant tabular-nums shrink-0">{pct}/100</span>
    </div>
  );
}

export default function LivingWorldCompanionsSection({ campaignId, enabled }) {
  const { t } = useTranslation();
  const { companions, loading, leaveParty } = useLivingWorldCompanions({ campaignId, enabled });
  const [pendingLeave, setPendingLeave] = useState(null);

  if (!enabled) return null;
  if (companions.length === 0 && !loading) return null;

  const handleLeave = async (npc) => {
    setPendingLeave(npc.id);
    try {
      await leaveParty(npc.id, 'player_dismissed');
    } finally {
      setPendingLeave(null);
    }
  };

  return (
    <div className="p-3 bg-surface-container/25 backdrop-blur-md border border-outline-variant/15 rounded-sm">
      <div className="flex items-center gap-2 mb-2">
        <span className="material-symbols-outlined text-tertiary text-sm shrink-0">public</span>
        <h3 className="text-xs font-bold text-tertiary uppercase tracking-widest truncate">
          {t('livingWorld.companions', 'Living World Companions')}
        </h3>
        <span className="text-[8px] uppercase tracking-widest px-1 py-0.5 rounded-sm bg-tertiary/20 text-tertiary border border-tertiary/30 ml-auto">
          exp
        </span>
      </div>

      {loading && companions.length === 0 ? (
        <div className="text-[10px] text-on-surface-variant py-1">
          {t('common.loading', 'Loading…')}
        </div>
      ) : (
        <ul className="space-y-2">
          {companions.map((c) => (
            <li
              key={c.id}
              className="flex items-start gap-2 p-2 rounded-sm bg-surface-container/40 border border-outline-variant/10"
            >
              <div className="w-8 h-8 rounded-sm flex items-center justify-center shrink-0 bg-tertiary/10 border border-tertiary/25 text-tertiary">
                <span className="material-symbols-outlined text-base">handshake</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] font-bold text-on-surface truncate">{c.name}</div>
                  <button
                    type="button"
                    disabled={pendingLeave === c.id}
                    onClick={() => handleLeave(c)}
                    className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-sm border border-error/30 text-error hover:bg-error/10 disabled:opacity-50"
                  >
                    {pendingLeave === c.id
                      ? t('common.wait', 'Wait…')
                      : t('livingWorld.leaveParty', 'Leave party')}
                  </button>
                </div>
                <div className="text-[9px] text-on-surface-variant truncate">
                  {c.role || t('livingWorld.noRole', '(no role)')}
                </div>
                <div className="mt-1">
                  <div className="text-[8px] font-label uppercase tracking-widest text-on-surface-variant mb-0.5">
                    {t('livingWorld.loyalty', 'Loyalty')}
                  </div>
                  <LoyaltyBar loyalty={c.companionLoyalty} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
