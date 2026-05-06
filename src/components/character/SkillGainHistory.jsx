import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/apiClient';

export default function SkillGainHistory({ characterId, skillName }) {
  const { t } = useTranslation();
  const [gains, setGains] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!characterId) return;
    let cancelled = false;
    setLoading(true);
    apiClient.get(`/v1/characters/${characterId}/skill-gains?skillName=${encodeURIComponent(skillName)}&limit=50`)
      .then((res) => { if (!cancelled) setGains(res.gains || []); })
      .catch(() => { if (!cancelled) setGains([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [characterId, skillName]);

  if (loading) {
    return (
      <div className="px-4 py-3 flex items-center gap-2 text-[10px] text-on-surface-variant">
        <span className="material-symbols-outlined text-xs animate-spin">progress_activity</span>
        {t('common.loading', 'Ładowanie...')}
      </div>
    );
  }

  if (!gains || gains.length === 0) {
    return (
      <div className="px-4 py-3 text-[10px] text-on-surface-variant/60 italic">
        {t('advancement.noSkillHistory', 'Brak historii rozwoju tej umiejętności.')}
      </div>
    );
  }

  return (
    <div className="max-h-48 overflow-y-auto custom-scrollbar px-3 py-2 space-y-1.5">
      {gains.map((g) => {
        const leveledUp = g.newLevel > g.oldLevel;
        const date = new Date(g.createdAt);
        const dateStr = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        const dr = g.diceRollInfo;

        return (
          <div
            key={g.id}
            className={`px-3 py-2 rounded-sm border text-[10px] leading-snug ${
              leveledUp
                ? 'bg-violet-500/10 border-violet-400/20'
                : 'bg-surface-container-high/30 border-outline-variant/10'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-1.5">
                <span className={`font-bold tabular-nums ${leveledUp ? 'text-violet-300' : 'text-cyan-400'}`}>
                  +{g.xpGained} XP
                </span>
                {leveledUp && (
                  <span className="text-amber-300 font-bold">
                    Lv {g.oldLevel} → {g.newLevel}
                  </span>
                )}
              </div>
              <span className="text-outline/60 tabular-nums shrink-0">{dateStr}</span>
            </div>
            {g.playerAction && (
              <p className="text-on-surface-variant/80 truncate">
                <span className="text-primary/70 font-bold">{t('advancement.action', 'Akcja')}:</span>{' '}
                {g.playerAction}
              </p>
            )}
            {g.narrative && (
              <p className="text-on-surface-variant/60 truncate italic mt-0.5">
                {g.narrative}
              </p>
            )}
            {dr && (
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                  dr.success ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                }`}>
                  d50={dr.roll} → {dr.success ? '✓' : '✗'}
                </span>
                {typeof dr.margin === 'number' && (
                  <span className="text-outline/60 tabular-nums">
                    {t('advancement.margin', 'margines')}: {dr.margin >= 0 ? '+' : ''}{dr.margin}
                  </span>
                )}
              </div>
            )}
            {g.sceneIndex != null && (
              <span className="text-outline/40 text-[9px] mt-0.5 block">
                {t('advancement.scene', 'Scena')} #{g.sceneIndex + 1}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
