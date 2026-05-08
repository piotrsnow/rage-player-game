import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useModalA11y } from '../../../hooks/useModalA11y';
import { GenderIcon } from '../../../utils/genderIcon';
import { speciesIcon } from '../../../utils/speciesIcons';
import { apiClient } from '../../../services/apiClient';
import { useImageGeneration } from '../../../hooks/useImageGeneration';
import { useSettings } from '../../../contexts/SettingsContext';
import NpcStatCard from '../world/NpcStatCard';

/**
 * Full-sheet modal opened when a player clicks an NPC speaker label in chat.
 * Reads the NPC object (already resolved by the caller from world.npcs) and
 * renders the same NpcStatCard that's used in Stan Świata.
 */
export default function NpcSheetModal({ npc, onClose }) {
  const { t } = useTranslation();
  const { hasApiKey } = useSettings();
  const modalRef = useModalA11y(onClose);
  const { regenerateNpcPortrait, imageGenEnabled, imgKeyProvider } = useImageGeneration();
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);

  if (!npc) return null;

  const portraitUrl = npc.portraitUrl ? apiClient.resolveMediaUrl(npc.portraitUrl) : null;
  const raceLabel = npc.race
    ? t(`worldState.races.${npc.race}`, npc.race)
    : npc.creatureKind || t('worldState.races.none');

  const canRegenerate = imageGenEnabled && hasApiKey(imgKeyProvider);
  const regenerateTitle = canRegenerate
    ? t('gameplay.regenerateImage')
    : t('charCreator.portraitNeedsKey');
  const zoomTitle = isZoomed ? t('common.zoomOut') : t('common.zoomIn');

  const handleRegenerate = async () => {
    if (!canRegenerate || isRegenerating) return;
    setIsRegenerating(true);
    try {
      await regenerateNpcPortrait(npc);
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={npc.name}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={modalRef}
        className="relative w-full max-w-2xl max-h-[85vh] bg-surface-container-highest/85 backdrop-blur-2xl border border-outline-variant/15 rounded-sm flex flex-col shadow-2xl animate-fade-in"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/10">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-primary text-xl shrink-0">badge</span>
            <h2 className="text-lg sm:text-xl font-bold text-on-surface truncate">{npc.name}</h2>
            <GenderIcon gender={npc.gender} className="text-sm text-outline/80 shrink-0" />
            <span className="text-sm text-on-surface-variant shrink-0">· {raceLabel}</span>
          </div>
          <button onClick={onClose} aria-label={t('common.close')} className="material-symbols-outlined text-lg text-outline hover:text-on-surface transition-colors">close</button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2 mr-3">
          <div
            className={`relative mx-auto mb-2 ${
              isZoomed
                ? 'w-[20rem] h-[20rem] sm:w-[28rem] sm:h-[28rem]'
                : 'w-48 h-48'
            } transition-[width,height] duration-300 ease-out`}
          >
            <button
              type="button"
              onClick={() => setIsZoomed((z) => !z)}
              title={zoomTitle}
              aria-label={zoomTitle}
              aria-pressed={isZoomed}
              className={`group relative block w-full h-full rounded-lg overflow-hidden border border-outline-variant/25 bg-surface-container hover:border-primary/40 ${
                isZoomed ? 'cursor-zoom-out' : 'cursor-zoom-in'
              } transition-colors`}
            >
              {portraitUrl ? (
                <img
                  src={portraitUrl}
                  alt={npc.name}
                  className="w-full h-full object-cover"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="material-symbols-outlined text-6xl text-on-surface-variant/50">{speciesIcon(npc.race)}</span>
                </div>
              )}
              {isRegenerating && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/55 pointer-events-none">
                  <span className="material-symbols-outlined text-3xl text-white animate-spin">progress_activity</span>
                </div>
              )}
            </button>
            {canRegenerate && (
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={isRegenerating}
                title={regenerateTitle}
                aria-label={regenerateTitle}
                className="absolute top-2 right-2 z-10 flex items-center justify-center w-8 h-8 rounded-sm bg-black/55 hover:bg-black/75 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className={`material-symbols-outlined text-lg ${isRegenerating ? 'animate-spin' : ''}`}>
                  {isRegenerating ? 'progress_activity' : 'refresh'}
                </span>
              </button>
            )}
          </div>
          <div className="text-sm text-on-surface-variant space-y-1.5">
            {npc.role && <div><span className="text-outline">{t('worldState.role')}:</span> {npc.role}</div>}
            {npc.personality && <div><span className="text-outline">{t('worldState.personality')}:</span> {npc.personality}</div>}
            {npc.lastLocation && <div><span className="text-outline">{t('worldState.location')}:</span> {npc.lastLocation}</div>}
            {npc.attitude && (
              <div>
                <span className="text-outline">{t('worldState.role')}:</span>{' '}
                <span className={`text-sm font-label uppercase tracking-wider px-2 py-0.5 rounded-sm ${
                  npc.attitude === 'friendly' ? 'bg-primary/15 text-primary' :
                  npc.attitude === 'hostile' ? 'bg-error/15 text-error' :
                  'bg-outline/10 text-outline'
                }`}>{npc.attitude}</span>
              </div>
            )}
          </div>
          <NpcStatCard npc={npc} />
        </div>
      </div>
    </div>
  );
}
