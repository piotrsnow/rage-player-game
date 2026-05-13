import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/apiClient';
import { exportAsJson, exportAsMarkdown } from '../../services/exportLog';
import { getGameState } from '../../stores/gameStore';
import { useGameSlice } from '../../stores/gameSelectors';
import CostBadge from '../ui/CostBadge';
import LocationChip from '../ui/LocationChip';
import Tooltip from '../ui/Tooltip';
import FavoriteToggle from './FavoriteToggle';

export default function GameplayHeader({
  readOnly,
  isMultiplayer,
  mpGameState,
  campaign,
  scenes,
  displayedSceneIndex,
  isReviewingPastScene,
  tensionScore,
  viewedScene,
  currentScene,
  // character / party
  character,
  allCharacters,
  attrPoints,
  // navigation
  setViewingSceneIndex,
  handleSceneNavigation,
  navigateWithTypewriter,
  playSceneNarration,
  // narrator
  narrator,
  settings,
  autoPlayScenes,
  setAutoPlayScenes,
  // share
  handleShare,
  shareCopied,
  shareLoading,
  // stats / costs
  aiCosts,
  // modal openers
  onOpenAdvancement,
  onOpenMpPanel,
  onOpenSummaryModal,
  onOpenSystemLogs,
  onOpenAchievements,
  onOpenWorldModal,
  // video
  videoPanelOpen,
  setVideoPanelOpen,
  // favorites
  favoriteSceneIds,
  onToggleFavoriteScene,
  campaignBackendId,
}) {
  const { t } = useTranslation();

  if (scenes.length === 0) return null;

  const currentAct = campaign?.structure?.currentAct || 1;
  const actName = campaign?.structure?.acts?.find((a) => a.number === currentAct)?.name;

  const worldLocation = useGameSlice((s) => s.world?.currentLocation);

  const deriveLocSnapshot = (scene) => {
    if (!scene) return null;
    const snap = scene.stateChanges?._locationSnapshot;
    if (snap) return snap;
    const raw = scene.stateChanges?.currentLocation;
    return raw ? { name: raw, kind: 'wandering', id: null } : null;
  };
  const currentLocSnapshot =
    deriveLocSnapshot(viewedScene || currentScene)
    || (worldLocation ? { name: worldLocation, kind: 'settled', id: null } : null);
  const prevSceneIdx = (displayedSceneIndex ?? 0) - 1;
  const previousLocSnapshot = prevSceneIdx >= 0 ? deriveLocSnapshot(scenes?.[prevSceneIdx]) : null;

  return (
    <div className="flex items-center justify-between px-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
          {campaign.name}
        </span>
        <span className="w-1 h-1 bg-primary/50 rounded-full" />
        <span className="flex items-center gap-1">
          <button
            onClick={() => {
              setViewingSceneIndex(0);
              handleSceneNavigation(0);
            }}
            disabled={displayedSceneIndex <= 0}
            title={t('gameplay.firstScene', 'First scene')}
            aria-label={t('gameplay.firstScene', 'First scene')}
            className="material-symbols-outlined text-base text-outline hover:text-primary disabled:text-outline/30 disabled:cursor-default transition-colors"
          >
            first_page
          </button>
          <button
            onClick={() => {
              const newIndex = Math.max(0, displayedSceneIndex - 1);
              setViewingSceneIndex(newIndex);
              handleSceneNavigation(newIndex);
            }}
            disabled={displayedSceneIndex <= 0}
            title={t('gameplay.previousScene', 'Previous scene')}
            aria-label={t('gameplay.previousScene', 'Previous scene')}
            className="material-symbols-outlined text-base text-outline hover:text-primary disabled:text-outline/30 disabled:cursor-default transition-colors"
          >
            chevron_left
          </button>
          <span className={`text-xs flex items-center gap-1 ${isReviewingPastScene ? 'text-primary font-bold' : 'text-outline'}`}>
            <span className="material-symbols-outlined text-sm">auto_stories</span>
            {displayedSceneIndex + 1} / {scenes.length}
          </span>
          {scenes.length > 2 && (
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded-sm border ${
                tensionScore > 70 ? 'text-error border-error/30 bg-error/10' :
                tensionScore > 40 ? 'text-amber-400 border-amber-400/30 bg-amber-400/10' :
                'text-tertiary border-tertiary/30 bg-tertiary/10'
              }`}
              title={t('gameplay.tensionScore', 'Tension') + `: ${tensionScore}/100`}
            >
              {tensionScore > 70 ? t('gameplay.tensionHigh', 'High') :
               tensionScore > 40 ? t('gameplay.tensionMedium', 'Med') :
               t('gameplay.tensionLow', 'Low')}
            </span>
          )}
          <button
            onClick={() => {
              const next = displayedSceneIndex + 1;
              const newIndex = next >= scenes.length - 1 ? null : next;
              setViewingSceneIndex(newIndex);
              handleSceneNavigation(next);
            }}
            disabled={displayedSceneIndex >= scenes.length - 1}
            title={t('gameplay.nextScene', 'Next scene')}
            aria-label={t('gameplay.nextScene', 'Next scene')}
            className="material-symbols-outlined text-base text-outline hover:text-primary disabled:text-outline/30 disabled:cursor-default transition-colors"
          >
            chevron_right
          </button>
          <button
            onClick={() => navigateWithTypewriter(displayedSceneIndex + 1)}
            disabled={displayedSceneIndex >= scenes.length - 1}
            title={t('gameplay.lastScene', 'Last scene')}
            aria-label={t('gameplay.lastScene', 'Last scene')}
            className="material-symbols-outlined text-base text-outline hover:text-primary disabled:text-outline/30 disabled:cursor-default transition-colors"
          >
            last_page
          </button>
          {viewedScene?.narrative && (
            <button
              onClick={() => playSceneNarration(viewedScene, displayedSceneIndex)}
              title={t('gameplay.playScene', 'Play scene')}
              aria-label={t('gameplay.playScene', 'Play scene')}
              className="material-symbols-outlined text-xs text-outline hover:text-primary transition-colors ml-1"
            >
              play_circle
            </button>
          )}
          {!readOnly && viewedScene?.id && onToggleFavoriteScene && (
            <FavoriteToggle
              sceneId={viewedScene.id}
              campaignId={campaignBackendId}
              isFavorite={favoriteSceneIds?.has(viewedScene.id) || false}
              onToggle={onToggleFavoriteScene}
            />
          )}
          {narrator.isNarratorReady && narrator.playbackState === narrator.STATES.PLAYING && (
            <button
              onClick={() => narrator.skipSegment()}
              title={t('gameplay.skipSegment', 'Skip to next segment')}
              aria-label={t('gameplay.skipSegment', 'Skip to next segment')}
              className="material-symbols-outlined text-xs text-outline hover:text-primary transition-colors"
            >
              skip_next
            </button>
          )}
          {((settings.narratorEnabled || readOnly) && narrator.isNarratorReady && scenes.length > 1) && (
            <button
              onClick={() => {
                if (autoPlayScenes) {
                  setAutoPlayScenes(false);
                  narrator.stop();
                } else {
                  if (displayedSceneIndex >= scenes.length - 1) {
                    setViewingSceneIndex(0);
                    handleSceneNavigation(0);
                  }
                  setAutoPlayScenes(true);
                }
              }}
              title={autoPlayScenes
                ? t('gameplay.stopAutoPlay', 'Stop auto-play')
                : t('gameplay.autoPlayScenes', 'Auto-play all scenes')}
              aria-label={autoPlayScenes
                ? t('gameplay.stopAutoPlay', 'Stop auto-play')
                : t('gameplay.autoPlayScenes', 'Auto-play all scenes')}
              className={`material-symbols-outlined text-xs transition-colors ml-1 ${
                autoPlayScenes
                  ? 'text-tertiary hover:text-error animate-pulse'
                  : 'text-outline hover:text-primary'
              }`}
            >
              {autoPlayScenes ? 'stop' : 'play_arrow'}
            </button>
          )}
        </span>
        {campaign?.structure?.acts?.length > 0 && (
          <>
            <span className="w-1 h-1 bg-primary/50 rounded-full" />
            <span className="text-[10px] text-outline">
              {t('gameplay.act', 'Act')} {currentAct}
              {actName ? ` — ${actName}` : ''}
            </span>
            <div className="hidden sm:flex items-center gap-1 ml-1">
              <div className="w-16 h-1 bg-surface-container-high rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary/60 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (scenes.length / (campaign.structure.totalTargetScenes || 25)) * 100)}%` }}
                />
              </div>
              <span className="text-[9px] text-outline">~{campaign.structure.totalTargetScenes || '?'}</span>
            </div>
          </>
        )}
      </div>
      <div className="flex items-center gap-4">
        {!readOnly && aiCosts?.total > 0 && <CostBadge costs={aiCosts} />}
        <LocationChip current={currentLocSnapshot} previous={previousLocSnapshot} />
        {!readOnly && attrPoints > 0 && (
          <button
            onClick={onOpenAdvancement}
            className="flex items-center gap-1.5 px-3 py-1 bg-primary/15 text-primary text-[10px] font-bold uppercase tracking-widest rounded-sm border border-primary/20 hover:bg-primary/25 transition-all animate-fade-in"
          >
            <span className="material-symbols-outlined text-xs">upgrade</span>
            +{attrPoints} pkt
          </button>
        )}
        {isMultiplayer && allCharacters.length > 0 ? (
          <div className="hidden lg:flex items-center gap-4 text-xs text-on-surface-variant">
            {allCharacters.map((c) => (
              <span key={c.name}>{c.name} W:{c.wounds}/{c.maxWounds}</span>
            ))}
          </div>
        ) : null}
        {!readOnly && (
          <>
            <Tooltip content={isMultiplayer ? t('multiplayer.invitePlayers') : t('multiplayer.openMultiplayer')} placement="bottom" variant="compact" asChild>
              <button
                onClick={onOpenMpPanel}
                aria-label={isMultiplayer ? t('multiplayer.invitePlayers') : t('multiplayer.openMultiplayer')}
                className={`material-symbols-outlined text-sm transition-colors ${
                  isMultiplayer ? 'text-primary hover:text-tertiary' : 'text-outline hover:text-primary'
                }`}
              >
                {isMultiplayer ? 'group' : 'group_add'}
              </button>
            </Tooltip>
            {isMultiplayer && (
              <Tooltip content={t('webcam.videoChat')} placement="bottom" variant="compact" asChild>
                <button
                  onClick={() => setVideoPanelOpen((v) => !v)}
                  aria-label={t('webcam.videoChat')}
                  className={`material-symbols-outlined text-sm transition-colors ${
                    videoPanelOpen ? 'text-primary hover:text-tertiary' : 'text-outline hover:text-primary'
                  }`}
                >
                  video_camera_front
                </button>
              </Tooltip>
            )}
            {campaign?.backendId && apiClient.isConnected() && (
              <Tooltip content={shareCopied ? t('gameplay.shareCopied') : t('gameplay.share')} placement="bottom" variant="compact" asChild>
                <button
                  onClick={handleShare}
                  disabled={shareLoading}
                  aria-label={t('gameplay.share')}
                  className={`material-symbols-outlined text-sm transition-colors ${
                    shareCopied ? 'text-emerald-400' : shareLoading ? 'text-outline/50 animate-pulse' : 'text-outline hover:text-primary'
                  }`}
                >
                  {shareCopied ? 'check' : 'share'}
                </button>
              </Tooltip>
            )}
            <Tooltip content={t('gameplay.summaryTitle', 'Story summary')} placement="bottom" variant="compact" asChild>
              <button
                onClick={onOpenSummaryModal}
                aria-label={t('gameplay.summaryTitle', 'Story summary')}
                className="material-symbols-outlined text-sm text-outline hover:text-primary transition-colors"
              >
                short_text
              </button>
            </Tooltip>
            <Tooltip content={t('gameplay.systemLogsTitle', 'Event log')} placement="bottom" variant="compact" asChild>
              <button
                onClick={onOpenSystemLogs}
                aria-label={t('gameplay.systemLogsTitle', 'Event log')}
                className="material-symbols-outlined text-sm text-outline hover:text-primary transition-colors"
              >
                receipt_long
              </button>
            </Tooltip>
            <Tooltip content={t('achievements.title', 'Achievements')} placement="bottom" variant="compact" asChild>
              <button
                onClick={onOpenAchievements}
                aria-label={t('achievements.title', 'Achievements')}
                className="material-symbols-outlined text-sm text-outline hover:text-primary transition-colors"
              >
                emoji_events
              </button>
            </Tooltip>
            <Tooltip content={t('worldState.title')} placement="bottom" variant="compact" asChild>
              <button
                onClick={onOpenWorldModal}
                aria-label={t('worldState.title')}
                className="material-symbols-outlined text-sm text-outline hover:text-primary transition-colors"
              >
                public
              </button>
            </Tooltip>
            <Tooltip content={t('gameplay.exportLog')} placement="bottom" variant="compact" asChild>
              <button
                onClick={() => {
                  if (isMultiplayer && mpGameState) {
                    exportAsMarkdown({
                      campaign: mpGameState.campaign,
                      character,
                      scenes: mpGameState.scenes,
                      chatHistory: mpGameState.chatHistory,
                      quests: mpGameState.quests,
                      world: mpGameState.world,
                    });
                  } else {
                    exportAsMarkdown(getGameState());
                  }
                }}
                aria-label={t('gameplay.exportLog')}
                className="material-symbols-outlined text-sm text-outline hover:text-primary transition-colors"
              >
                download
              </button>
            </Tooltip>
            <Tooltip content={t('gameplay.exportCampaignJson')} placement="bottom" variant="compact" asChild>
              <button
                onClick={() => {
                  if (isMultiplayer && mpGameState) {
                    exportAsJson({ ...mpGameState, character });
                  } else {
                    exportAsJson(getGameState());
                  }
                }}
                aria-label={t('gameplay.exportCampaignJson')}
                className="material-symbols-outlined text-sm text-outline hover:text-primary transition-colors"
              >
                data_object
              </button>
            </Tooltip>
          </>
        )}
      </div>
    </div>
  );
}
