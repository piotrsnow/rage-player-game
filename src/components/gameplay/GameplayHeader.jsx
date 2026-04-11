import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/apiClient';
import { exportAsMarkdown } from '../../services/exportLog';
import CostBadge from '../ui/CostBadge';

export default function GameplayHeader({
  readOnly,
  isMultiplayer,
  mpGameState,
  state,
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
  displayCharacter,
  isViewingCompanion,
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
  // refresh/share
  handleRefresh,
  isRefreshing,
  handleShare,
  shareCopied,
  shareLoading,
  // stats / costs
  aiCosts,
  // autoplayer
  autoPlayer,
  onOpenAutoPlayerSettings,
  // modal openers
  onOpenAdvancement,
  onOpenMpPanel,
  onOpenSummaryModal,
  onOpenAchievements,
  onOpenWorldModal,
  onOpenGmModal,
  // video
  videoPanelOpen,
  setVideoPanelOpen,
}) {
  const { t } = useTranslation();

  if (scenes.length === 0) return null;

  const contextDepth = settings.dmSettings?.contextDepth ?? 100;
  const currentAct = campaign?.structure?.currentAct || 1;
  const actName = campaign?.structure?.acts?.find((a) => a.number === currentAct)?.name;

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
          <span className={`text-xs ${isReviewingPastScene ? 'text-primary font-bold' : 'text-outline'}`}>
            {t('common.scene')} {displayedSceneIndex + 1} / {scenes.length}
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
        ) : displayCharacter ? (
          <div className="hidden lg:flex items-center gap-4 text-xs text-on-surface-variant">
            <span>{displayCharacter.name}</span>
            <span>{t(`species.${displayCharacter.species}`, { defaultValue: displayCharacter.species })}</span>
            {isViewingCompanion && <span className="text-tertiary font-bold">(Companion)</span>}
          </div>
        ) : null}
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          title={t('gameplay.refreshTooltip', 'Reload campaign')}
          aria-label={t('gameplay.refresh', 'Refresh')}
          className={`material-symbols-outlined text-sm transition-colors ${
            isRefreshing ? 'text-primary animate-spin' : 'text-outline hover:text-primary'
          }`}
        >
          {isRefreshing ? 'progress_activity' : 'refresh'}
        </button>
        {!readOnly && (
          <>
            {!isMultiplayer && currentScene && (!campaign?.status || campaign.status === 'active') && character?.status !== 'dead' && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={autoPlayer.toggleAutoPlayer}
                  title={t('autoPlayer.toggle')}
                  aria-label={t('autoPlayer.toggle')}
                  className={`relative w-8 h-[18px] rounded-full transition-colors duration-200 ${
                    autoPlayer.isAutoPlaying ? 'bg-primary' : 'bg-outline/30'
                  }`}
                >
                  <span
                    className={`absolute top-[3px] left-[3px] w-3 h-3 rounded-full bg-on-primary transition-transform duration-200 ${
                      autoPlayer.isAutoPlaying ? 'translate-x-[14px]' : 'translate-x-0'
                    }`}
                  />
                </button>
                {autoPlayer.isAutoPlaying && autoPlayer.isThinking && (
                  <span className="material-symbols-outlined text-xs text-primary animate-spin">progress_activity</span>
                )}
                <span className="text-[9px] font-label uppercase tracking-widest text-on-surface-variant hidden xl:inline">
                  {t('autoPlayer.title')}
                </span>
                {autoPlayer.isAutoPlaying && (
                  <span className="text-[9px] text-outline tabular-nums">
                    {autoPlayer.turnsPlayed}{autoPlayer.autoPlayerSettings.maxTurns > 0 ? `/${autoPlayer.autoPlayerSettings.maxTurns}` : ''}
                  </span>
                )}
                <button
                  onClick={onOpenAutoPlayerSettings}
                  title={t('autoPlayer.settings')}
                  aria-label={t('autoPlayer.settings')}
                  className="material-symbols-outlined text-sm text-outline hover:text-primary transition-colors"
                >
                  tune
                </button>
              </div>
            )}
            <button
              onClick={onOpenMpPanel}
              title={isMultiplayer ? t('multiplayer.invitePlayers') : t('multiplayer.openMultiplayer')}
              aria-label={isMultiplayer ? t('multiplayer.invitePlayers') : t('multiplayer.openMultiplayer')}
              className={`material-symbols-outlined text-sm transition-colors ${
                isMultiplayer ? 'text-primary hover:text-tertiary' : 'text-outline hover:text-primary'
              }`}
            >
              {isMultiplayer ? 'group' : 'group_add'}
            </button>
            {isMultiplayer && (
              <button
                onClick={() => setVideoPanelOpen((v) => !v)}
                title={t('webcam.videoChat')}
                aria-label={t('webcam.videoChat')}
                className={`material-symbols-outlined text-sm transition-colors ${
                  videoPanelOpen ? 'text-primary hover:text-tertiary' : 'text-outline hover:text-primary'
                }`}
              >
                video_camera_front
              </button>
            )}
            {campaign?.backendId && apiClient.isConnected() && (
              <button
                onClick={handleShare}
                disabled={shareLoading}
                title={shareCopied ? t('gameplay.shareCopied') : t('gameplay.share')}
                aria-label={t('gameplay.share')}
                className={`material-symbols-outlined text-sm transition-colors ${
                  shareCopied ? 'text-emerald-400' : shareLoading ? 'text-outline/50 animate-pulse' : 'text-outline hover:text-primary'
                }`}
              >
                {shareCopied ? 'check' : 'share'}
              </button>
            )}
            <button
              onClick={onOpenSummaryModal}
              title={t('gameplay.summaryTitle', 'Story summary')}
              aria-label={t('gameplay.summaryTitle', 'Story summary')}
              className="material-symbols-outlined text-sm text-outline hover:text-primary transition-colors"
            >
              short_text
            </button>
            <button
              onClick={onOpenAchievements}
              title={t('achievements.title', 'Achievements')}
              aria-label={t('achievements.title', 'Achievements')}
              className="material-symbols-outlined text-sm text-outline hover:text-primary transition-colors"
            >
              emoji_events
            </button>
            <button
              onClick={onOpenWorldModal}
              title={t('worldState.title')}
              aria-label={t('worldState.title')}
              className="material-symbols-outlined text-sm text-outline hover:text-primary transition-colors"
            >
              public
            </button>
            <button
              onClick={onOpenGmModal}
              title={t('gmModal.title')}
              aria-label={t('gmModal.title')}
              className="material-symbols-outlined text-sm text-outline hover:text-primary transition-colors"
            >
              auto_stories
            </button>
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
                  exportAsMarkdown(state);
                }
              }}
              title={t('gameplay.exportLog')}
              aria-label={t('gameplay.exportLog')}
              className="material-symbols-outlined text-sm text-outline hover:text-primary transition-colors"
            >
              download
            </button>
          </>
        )}
      </div>
    </div>
  );
}
