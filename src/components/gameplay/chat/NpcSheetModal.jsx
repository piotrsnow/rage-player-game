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
  const level = npc.stats?.level ?? npc.level ?? null;

  const attitudeTone = npc.attitude === 'friendly' || npc.attitude === 'przyjazny'
    ? 'bg-primary/15 text-primary border-primary/20'
    : npc.attitude === 'hostile' || npc.attitude === 'wrogi'
      ? 'bg-error/15 text-error border-error/20'
      : 'bg-outline/10 text-outline border-outline-variant/20';

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
        className="relative w-full max-w-[612px] max-h-[85vh] bg-surface-container-highest/85 backdrop-blur-2xl border border-outline-variant/15 rounded-sm flex flex-col shadow-2xl animate-fade-in"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-outline-variant/10 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-primary text-xl shrink-0">badge</span>
            <h2 className="text-lg sm:text-xl font-bold text-on-surface truncate">{npc.name}</h2>
            <div className="hidden sm:flex items-center gap-1.5 shrink-0 text-sm text-on-surface-variant">
              <GenderIcon gender={npc.gender} className="text-sm text-outline/80" />
              <span>·</span>
              <span>{raceLabel}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {level != null && (
              <span
                className="inline-flex items-baseline gap-1 px-2 py-0.5 rounded-sm bg-primary/12 border border-primary/25 text-primary text-xs font-label uppercase tracking-wider"
                title={t('worldState.level')}
              >
                {t('worldState.level')}
                <span className="text-sm font-bold tabular-nums">{level}</span>
              </span>
            )}
            <button onClick={onClose} aria-label={t('common.close')} className="material-symbols-outlined text-lg text-outline hover:text-on-surface transition-colors">close</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-5 space-y-4 min-h-0" style={{ scrollbarGutter: 'stable' }}>
          {/* sm:flex breakpoint: portrait sits left, identity stacks right */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:gap-5 gap-4">
            {/* Portrait frames match SD preset 832×1216 from imagePrompts getModelPreset */}
            <div
              className={`relative shrink-0 mx-auto sm:mx-0 ${
                isZoomed
                  ? 'w-[min(20rem,calc(100vw-2rem))] sm:w-[min(28rem,calc(100vw-2rem))]'
                  : 'w-44 sm:w-48'
              } transition-[width] duration-300 ease-out`}
            >
              <button
                type="button"
                onClick={() => setIsZoomed((z) => !z)}
                title={zoomTitle}
                aria-label={zoomTitle}
                aria-pressed={isZoomed}
                className={`group relative block w-full aspect-[832/1216] rounded-lg overflow-hidden border border-outline-variant/25 bg-black/25 hover:border-primary/40 ${
                  isZoomed ? 'cursor-zoom-out' : 'cursor-zoom-in'
                } transition-colors`}
              >
                {portraitUrl ? (
                  <img
                    src={portraitUrl}
                    alt={npc.name}
                    className="w-full h-full object-contain"
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

            <div className="flex-1 min-w-0 space-y-2.5 text-sm">
              <div className="flex sm:hidden flex-wrap items-center gap-1.5 text-on-surface-variant">
                <GenderIcon gender={npc.gender} className="text-sm text-outline/80" />
                <span>·</span>
                <span>{raceLabel}</span>
              </div>

              {npc.attitude && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs uppercase tracking-wider text-outline">{t('worldState.attitude')}</span>
                  <span className={`text-xs font-label uppercase tracking-wider px-2 py-0.5 rounded-sm border ${attitudeTone}`}>
                    {npc.attitude}
                  </span>
                </div>
              )}

              <IdentityField label={t('worldState.role')} value={npc.role} />
              <IdentityField label={t('worldState.personality')} value={npc.personality} />
              <IdentityField label={t('worldState.location')} value={npc.lastLocation} icon="location_on" />
            </div>
          </div>

          {npc.appearance && (
            <div className="rounded-md border border-outline-variant/15 bg-black/15 px-3 py-2.5">
              <div className="text-[10px] font-label uppercase tracking-widest text-outline mb-1">
                {t('worldState.appearance')}
              </div>
              <p className="text-sm text-on-surface-variant leading-relaxed">{npc.appearance}</p>
            </div>
          )}

          <NpcStatCard npc={npc} compact />
        </div>
      </div>
    </div>
  );
}

function IdentityField({ label, value, icon }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      {icon && (
        <span className="material-symbols-outlined text-base text-outline/70 shrink-0 leading-tight mt-0.5">{icon}</span>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-label uppercase tracking-widest text-outline leading-tight mb-0.5">{label}</div>
        <div className="text-sm text-on-surface leading-snug break-words">{value}</div>
      </div>
    </div>
  );
}
