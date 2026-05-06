import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/apiClient';

function ScenePreviewModal({ gain, onClose }) {
  const { t } = useTranslation();
  const [scene, setScene] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!gain?.campaignId || gain.sceneIndex == null) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    apiClient.get(`/v1/campaigns/${gain.campaignId}/scenes/${gain.sceneIndex}`)
      .then((res) => { if (!cancelled) setScene(res); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [gain?.campaignId, gain?.sceneIndex]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const leveledUp = gain.newLevel > gain.oldLevel;
  const dr = gain.diceRollInfo;
  const date = new Date(gain.createdAt);
  const dateStr = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col bg-surface-container-low border border-outline-variant/15 rounded-md shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/40 text-on-surface/70 hover:text-on-surface transition-colors"
        >
          <span className="material-symbols-outlined text-xl">close</span>
        </button>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-16 text-on-surface-variant">
            <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
            {t('common.loading', 'Ładowanie...')}
          </div>
        )}

        {error && !loading && (
          <div className="flex items-center justify-center gap-2 py-16 text-on-surface-variant/60 italic">
            {t('advancement.sceneLoadError', 'Nie udało się załadować sceny.')}
          </div>
        )}

        {!loading && !error && scene && (
          <>
            {scene.imageUrl && (
              <img
                src={scene.imageUrl}
                alt=""
                className="w-full aspect-video object-cover shrink-0"
              />
            )}

            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <span className={`text-base font-bold tabular-nums ${leveledUp ? 'text-violet-300' : 'text-cyan-400'}`}>
                    +{gain.xpGained} XP
                  </span>
                  {leveledUp && (
                    <span className="text-sm text-amber-300 font-bold">
                      Lv {gain.oldLevel} → {gain.newLevel}
                    </span>
                  )}
                  {gain.sceneIndex != null && (
                    <span className="text-xs text-outline/50 tabular-nums">
                      {t('advancement.scene', 'Scena')} #{gain.sceneIndex + 1}
                    </span>
                  )}
                </div>
                <span className="text-xs text-outline/60 tabular-nums shrink-0">{dateStr}</span>
              </div>

              {dr && (
                <div className="flex items-center gap-2.5">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                    dr.success ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                  }`}>
                    d50={dr.roll} → {dr.success ? '✓' : '✗'}
                  </span>
                  {typeof dr.margin === 'number' && (
                    <span className="text-xs text-outline/60 tabular-nums">
                      {t('advancement.margin', 'margines')}: {dr.margin >= 0 ? '+' : ''}{dr.margin}
                    </span>
                  )}
                </div>
              )}

              {(scene.chosenAction || gain.playerAction) && (
                <p className="text-sm text-on-surface-variant/80">
                  <span className="text-primary/70 font-bold">{t('advancement.action', 'Akcja')}:</span>{' '}
                  {scene.chosenAction || gain.playerAction}
                </p>
              )}

              <p className="text-sm text-on-surface/80 leading-relaxed whitespace-pre-line">
                {scene.narrative}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function SkillGainHistory({ characterId, skillName }) {
  const { t } = useTranslation();
  const [gains, setGains] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedGain, setSelectedGain] = useState(null);

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

  const closeModal = useCallback(() => setSelectedGain(null), []);

  if (loading) {
    return (
      <div className="px-4 py-4 flex items-center gap-2 text-sm text-on-surface-variant">
        <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
        {t('common.loading', 'Ładowanie...')}
      </div>
    );
  }

  if (!gains || gains.length === 0) {
    return (
      <div className="px-4 py-4 text-sm text-on-surface-variant/60 italic">
        {t('advancement.noSkillHistory', 'Brak historii rozwoju tej umiejętności.')}
      </div>
    );
  }

  return (
    <>
      <div className="max-h-[40rem] overflow-y-auto custom-scrollbar px-1 py-2 space-y-2.5">
        {gains.map((g) => {
          const leveledUp = g.newLevel > g.oldLevel;
          const date = new Date(g.createdAt);
          const dateStr = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
          const dr = g.diceRollInfo;
          const clickable = g.campaignId && g.sceneIndex != null;

          return (
            <div
              key={g.id}
              onClick={clickable ? () => setSelectedGain(g) : undefined}
              className={`px-4 py-3 rounded-sm border transition-colors ${
                leveledUp
                  ? 'bg-violet-500/10 border-violet-400/25'
                  : 'bg-surface-container-high/30 border-outline-variant/10'
              } ${clickable ? 'cursor-pointer hover:bg-white/5' : ''}`}
            >
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-bold tabular-nums ${leveledUp ? 'text-violet-300' : 'text-cyan-400'}`}>
                    +{g.xpGained} XP
                  </span>
                  {leveledUp && (
                    <span className="text-sm text-amber-300 font-bold">
                      Lv {g.oldLevel} → {g.newLevel}
                    </span>
                  )}
                </div>
                <span className="text-xs text-outline/60 tabular-nums shrink-0">{dateStr}</span>
              </div>
              {g.playerAction && (
                <p className="text-sm text-on-surface-variant/80 line-clamp-2">
                  <span className="text-primary/70 font-bold">{t('advancement.action', 'Akcja')}:</span>{' '}
                  {g.playerAction}
                </p>
              )}
              {g.narrative && (
                <p className="text-sm text-on-surface-variant/60 line-clamp-2 italic mt-1">
                  {g.narrative}
                </p>
              )}
              {dr && (
                <div className="flex items-center gap-2.5 mt-1.5">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                    dr.success ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                  }`}>
                    d50={dr.roll} → {dr.success ? '✓' : '✗'}
                  </span>
                  {typeof dr.margin === 'number' && (
                    <span className="text-xs text-outline/60 tabular-nums">
                      {t('advancement.margin', 'margines')}: {dr.margin >= 0 ? '+' : ''}{dr.margin}
                    </span>
                  )}
                </div>
              )}
              {g.sceneIndex != null && (
                <span className="text-xs text-outline/40 mt-1 block">
                  {t('advancement.scene', 'Scena')} #{g.sceneIndex + 1}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {selectedGain && (
        <ScenePreviewModal gain={selectedGain} onClose={closeModal} />
      )}
    </>
  );
}
