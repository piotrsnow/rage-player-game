import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getCampaignSummary } from '../../services/gameState';

const genreIcons = {
  Fantasy: 'auto_fix_high',
  'Sci-Fi': 'rocket_launch',
  Horror: 'skull',
};

const genreBorderColors = {
  Fantasy: 'border-l-primary-dim',
  'Sci-Fi': 'border-l-blue-400',
  Horror: 'border-l-error',
};

const genreGlowColors = {
  Fantasy: 'hover:shadow-[0_4px_24px_rgba(149,71,247,0.12)]',
  'Sci-Fi': 'hover:shadow-[0_4px_24px_rgba(96,165,250,0.12)]',
  Horror: 'hover:shadow-[0_4px_24px_rgba(255,110,132,0.12)]',
};

function getScenePreview(scene) {
  if (scene.narrative) return scene.narrative.slice(0, 80).replace(/\n/g, ' ');
  if (scene.dialogueSegments?.length) {
    const first = scene.dialogueSegments[0];
    return (first.text || '').slice(0, 80).replace(/\n/g, ' ');
  }
  return '...';
}

export default function CampaignCard({ campaign, onLoad, onDelete, onExportLog, onExportJson, onForkFromScene }) {
  const { t, i18n } = useTranslation();
  const [scenesExpanded, setScenesExpanded] = useState(false);
  const isSynced = !!campaign.campaign?.backendId;
  const summary = getCampaignSummary(campaign);
  const scenes = campaign.scenes || [];
  const lastPlayed = new Date(summary.lastPlayed).toLocaleDateString(i18n.language === 'pl' ? 'pl-PL' : undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const borderColor = genreBorderColors[summary.genre] || 'border-l-primary-dim';
  const glowColor = genreGlowColors[summary.genre] || genreGlowColors.Fantasy;

  const handleToggleScenes = (e) => {
    e.stopPropagation();
    setScenesExpanded((prev) => !prev);
  };

  const handleFork = (e, sceneIndex) => {
    e.stopPropagation();
    onForkFromScene?.(sceneIndex);
  };

  return (
    <div className="animate-fade-in">
      <div
        onClick={onLoad}
        className={`p-5 bg-surface-container-low hover:bg-surface-container transition-all duration-300 cursor-pointer group flex items-start justify-between border-l-2 ${borderColor} rounded-sm hover:translate-y-[-1px] ${glowColor}`}
      >
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <div className="w-10 h-10 bg-surface-container-high rounded-sm flex items-center justify-center border border-primary/10 shrink-0 group-hover:border-primary/25 transition-colors">
            <span className="material-symbols-outlined text-primary-dim group-hover:text-primary transition-colors">
              {genreIcons[summary.genre] || 'book_5'}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-on-surface font-headline group-hover:text-tertiary transition-colors truncate">
              {summary.name}
            </p>
            <p className="text-on-surface-variant text-xs mt-1">
              {summary.characterName} · {summary.characterCareer} ({t('common.tier')} {summary.characterTier}) · {summary.sceneCount} {t('common.scenes')}
            </p>
            <div className="flex gap-2 mt-2">
              <span className="px-2.5 py-0.5 bg-surface-bright text-primary text-[10px] font-bold border border-primary/10 rounded-full">
                {summary.genre}
              </span>
              <span className="px-2.5 py-0.5 bg-surface-bright text-tertiary-dim text-[10px] font-bold border border-tertiary/10 rounded-full">
                {summary.tone}
              </span>
              {summary.totalCost > 0 && (
                <span className="px-2.5 py-0.5 bg-surface-bright text-on-surface-variant text-[10px] font-bold border border-outline-variant/10 rounded-full">
                  ${summary.totalCost.toFixed(2)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0 ml-4">
          <div className="flex items-center gap-1.5">
            <span
              className={`material-symbols-outlined text-xs ${isSynced ? 'text-primary-dim' : 'text-outline/40'}`}
              title={isSynced ? t('lobby.synced', 'Synced') : t('lobby.localOnly', 'Local only')}
            >
              {isSynced ? 'cloud_done' : 'cloud_off'}
            </span>
            <span className="text-[10px] text-on-surface-variant">{lastPlayed}</span>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
            {scenes.length > 1 && (
              <button
                onClick={handleToggleScenes}
                title={t('lobby.forkFromScene')}
                className={`material-symbols-outlined text-sm transition-colors p-1 rounded-sm hover:bg-surface-container-high/50 ${scenesExpanded ? 'text-primary' : 'text-outline hover:text-primary'}`}
              >
                fork_right
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onExportLog();
              }}
              title={t('lobby.exportLog')}
              className="material-symbols-outlined text-sm text-outline hover:text-primary transition-colors p-1 rounded-sm hover:bg-surface-container-high/50"
            >
              description
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onExportJson();
              }}
              title={t('lobby.exportJson')}
              className="material-symbols-outlined text-sm text-outline hover:text-primary transition-colors p-1 rounded-sm hover:bg-surface-container-high/50"
            >
              download
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="material-symbols-outlined text-sm text-outline hover:text-error transition-colors p-1 rounded-sm hover:bg-error/10"
            >
              delete
            </button>
          </div>
        </div>
      </div>

      {scenesExpanded && scenes.length > 1 && (
        <div className="bg-surface-container-low/50 border-l-2 border-outline-variant/20 ml-5 pl-4 pr-3 py-3 space-y-1">
          <p className="text-[10px] text-outline uppercase tracking-widest mb-2 font-label">
            {t('lobby.forkFromSceneHint')}
          </p>
          {scenes.map((scene, idx) => (
            <div
              key={scene.id || idx}
              className="flex items-center gap-3 py-1.5 px-2 rounded-sm hover:bg-surface-container transition-colors group/scene"
            >
              <span className="text-[10px] text-outline font-mono w-5 text-right shrink-0">
                {idx + 1}
              </span>
              <div className="h-px w-3 bg-outline-variant/30 shrink-0" />
              <p className="text-xs text-on-surface-variant truncate flex-1 min-w-0">
                {getScenePreview(scene)}
              </p>
              {idx < scenes.length - 1 && (
                <button
                  onClick={(e) => handleFork(e, idx)}
                  title={t('lobby.forkFromHere')}
                  className="opacity-0 group-hover/scene:opacity-100 transition-opacity text-[10px] font-label text-primary hover:text-tertiary bg-primary/10 hover:bg-primary/20 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0"
                >
                  {t('lobby.forkFromHere')}
                </button>
              )}
              {idx === scenes.length - 1 && (
                <span className="text-[10px] text-outline/50 font-label italic shrink-0">
                  {t('lobby.currentScene')}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
