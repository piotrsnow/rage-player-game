import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useModalA11y } from '../../hooks/useModalA11y';
import { apiClient } from '../../services/apiClient';
import { useGameSlice } from '../../stores/gameSelectors';

export default function LocationDetailsModal({
  locationName,
  campaignId,
  onNavigateToScene,
  onClose,
}) {
  const { t } = useTranslation();
  const modalRef = useModalA11y(onClose);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const knowledgeBase = useGameSlice((s) => s.world?.knowledgeBase?.locations);
  const localKnowledge = knowledgeBase?.[locationName?.toLowerCase()] || null;

  useEffect(() => {
    if (!locationName) return;

    if (!campaignId || !apiClient.isConnected()) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const encoded = encodeURIComponent(locationName);
    apiClient.get(`/v1/livingWorld/campaigns/${campaignId}/location-detail?locationName=${encoded}`)
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(t('locationDetails.loadError'));
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [locationName, campaignId, t]);

  const hasBackendData = !!data;
  const summary = data?.summary || '';
  const digests = data?.sceneDigests || [];
  const keyNpcs = data?.keyNpcs || [];
  const unresolvedHooks = data?.unresolvedHooks || [];
  const sceneCount = data?.sceneCount || localKnowledge?.visitCount || 0;
  const lastVisitScene = data?.lastVisitScene || 0;
  const scenes = data?.scenes || [];

  const title = locationName || t('locationDetails.title');

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        ref={modalRef}
        className="relative w-full max-w-[640px] max-h-[85vh] bg-surface-container-highest/85 backdrop-blur-2xl border border-outline-variant/15 rounded-sm flex flex-col shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/10 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-primary text-xl shrink-0">location_on</span>
            <h2 className="text-lg sm:text-xl font-bold text-on-surface truncate">{title}</h2>
            {sceneCount > 0 && (
              <span className="text-[10px] text-outline bg-white/5 px-1.5 py-0.5 rounded-sm border border-outline-variant/10 shrink-0">
                {t('locationDetails.visitCount', { count: sceneCount })}
              </span>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="material-symbols-outlined text-lg text-outline hover:text-on-surface transition-colors">close</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-5 mr-3 min-h-0">
          {loading && (
            <div className="flex items-center gap-2 text-outline text-sm py-8 justify-center">
              <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>
            </div>
          )}
          {error && <div className="text-error text-sm">{error}</div>}

          {!loading && !error && (
            <>
              {/* Summary */}
              {summary ? (
                <section>
                  <h3 className="text-xs font-label uppercase tracking-widest text-outline mb-2">{t('locationDetails.summary')}</h3>
                  <p className="text-sm text-on-surface-variant leading-relaxed">{summary}</p>
                </section>
              ) : !hasBackendData && !localKnowledge ? (
                <p className="text-sm text-outline italic">{t('locationDetails.noSummary')}</p>
              ) : null}

              {/* Last visit */}
              {lastVisitScene > 0 && (
                <div className="text-[11px] text-outline">
                  {t('locationDetails.lastVisit', { scene: lastVisitScene })}
                </div>
              )}

              {/* Scene timeline */}
              {digests.length > 0 && (
                <section>
                  <h3 className="text-xs font-label uppercase tracking-widest text-outline mb-2">{t('locationDetails.sceneTimeline')}</h3>
                  <ul className="space-y-2 text-sm">
                    {digests.map((d, i) => {
                      const scene = scenes.find((s) => s.sceneIndex === d.sceneNum);
                      return (
                        <li key={d.sceneNum ?? i} className="rounded border border-outline-variant/15 bg-white/5 px-3 py-2 group">
                          <div className="flex items-start gap-2">
                            {scene?.imageUrl && (
                              <img
                                src={apiClient.resolveMediaUrl(scene.imageUrl)}
                                alt=""
                                className="w-12 h-8 rounded-sm object-cover shrink-0 border border-outline-variant/10"
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-on-surface">{d.text}</div>
                              <div className="flex items-center gap-2 mt-1 text-[11px] text-outline">
                                <span className="uppercase tracking-wide">
                                  {t('locationDetails.sceneNum', { index: d.sceneNum })}
                                </span>
                                {scene?.chosenAction && (
                                  <>
                                    <span>·</span>
                                    <span className="italic truncate max-w-[200px]">{scene.chosenAction}</span>
                                  </>
                                )}
                                {onNavigateToScene && typeof d.sceneNum === 'number' && (
                                  <button
                                    type="button"
                                    onClick={() => { onNavigateToScene(d.sceneNum); onClose(); }}
                                    className="ml-auto text-primary hover:text-tertiary transition-colors opacity-0 group-hover:opacity-100"
                                  >
                                    <span className="material-symbols-outlined text-sm">open_in_new</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {digests.length === 0 && !summary && hasBackendData && (
                <p className="text-sm text-outline italic">{t('locationDetails.noScenes')}</p>
              )}

              {/* Key NPCs */}
              {keyNpcs.length > 0 && (
                <section>
                  <h3 className="text-xs font-label uppercase tracking-widest text-outline mb-2">{t('locationDetails.keyNpcs')}</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {keyNpcs.map((npc) => (
                      <span key={npc} className="text-xs px-2 py-0.5 rounded-sm bg-primary/10 text-primary border border-primary/15">
                        {npc}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {/* Unresolved hooks */}
              {unresolvedHooks.length > 0 && (
                <section>
                  <h3 className="text-xs font-label uppercase tracking-widest text-outline mb-2">{t('locationDetails.unresolvedHooks')}</h3>
                  <ul className="space-y-1.5">
                    {unresolvedHooks.map((hook, i) => (
                      <li key={i} className="text-sm text-on-surface-variant flex items-start gap-2">
                        <span className="material-symbols-outlined text-sm text-amber-400 shrink-0 mt-0.5">priority_high</span>
                        <span>{hook}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Player knowledge fallback */}
              {localKnowledge && (
                <section>
                  <h3 className="text-xs font-label uppercase tracking-widest text-outline mb-2">{t('locationDetails.playerKnowledge')}</h3>
                  <div className="space-y-2 text-sm text-on-surface-variant">
                    {localKnowledge.knownFacts?.length > 0 && (
                      <div>
                        <span className="text-outline text-xs">{t('locationDetails.knownFacts')}:</span>
                        <ul className="mt-1 space-y-1 ml-4">
                          {localKnowledge.knownFacts.map((fact, i) => (
                            <li key={i} className="list-disc">{fact}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {localKnowledge.npcsEncountered?.length > 0 && (
                      <div>
                        <span className="text-outline text-xs">{t('locationDetails.npcsEncountered')}:</span>
                        <span className="ml-1">{localKnowledge.npcsEncountered.join(', ')}</span>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
