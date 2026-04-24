import WorldStateModal from './WorldStateModal';
import GMModal from './gm/GMModal';
import MultiplayerPanel from '../multiplayer/MultiplayerPanel';
import AdvancementPanel from '../character/AdvancementPanel';
import AchievementsPanel from '../character/AchievementsPanel';
import AutoPlayerPanel from './AutoPlayerPanel';
import SummaryModal from './SummaryModal';
import FloatingVideoPanel from '../multiplayer/FloatingVideoPanel';
import {
  useGameWorld,
  useGameQuests,
  useGameAchievements,
  useGameSlice,
} from '../../stores/gameSelectors';

export default function GameplayModals({
  readOnly,
  isMultiplayer,
  mpGameState,
  settings,
  dispatch,
  autoSave,
  narrator,
  campaignId,
  currentSceneId,
  onTravelFromMap,
  onEnterSubFromMap,
  // world
  worldModalOpen,
  onWorldModalClose,
  // gm
  gmModalOpen,
  onGmModalClose,
  // mp
  mpPanelOpen,
  onMpPanelClose,
  // advancement
  advancementOpen,
  onAdvancementClose,
  // achievements
  achievementsOpen,
  onAchievementsClose,
  // auto-player
  autoPlayerSettingsOpen,
  onAutoPlayerSettingsClose,
  autoPlayer,
  character,
  isGeneratingScene,
  // summary/recap
  recap,
  displayedSceneIndex,
  scenes,
  // video
  videoPanelOpen,
  onVideoPanelClose,
}) {
  const soloWorld = useGameWorld();
  const soloQuests = useGameQuests();
  const soloAchievements = useGameAchievements();
  const characterVoiceMap = useGameSlice((s) => s.characterVoiceMap);

  if (readOnly) return null;

  return (
    <>
      {worldModalOpen && (
        <WorldStateModal
          world={isMultiplayer ? mpGameState?.world : soloWorld}
          quests={isMultiplayer ? mpGameState?.quests : soloQuests}
          characterVoiceMap={characterVoiceMap}
          maleVoices={settings.maleVoices}
          femaleVoices={settings.femaleVoices}
          dispatch={dispatch}
          autoSave={autoSave}
          campaignId={campaignId}
          currentSceneId={currentSceneId}
          onTravel={onTravelFromMap}
          onEnterSub={onEnterSubFromMap}
          onClose={onWorldModalClose}
        />
      )}

      {gmModalOpen && <GMModal onClose={onGmModalClose} />}

      {mpPanelOpen && <MultiplayerPanel onClose={onMpPanelClose} />}

      {advancementOpen && <AdvancementPanel onClose={onAdvancementClose} />}

      {achievementsOpen && (
        <AchievementsPanel
          achievementState={soloAchievements}
          onClose={onAchievementsClose}
        />
      )}

      {autoPlayerSettingsOpen && (
        <AutoPlayerPanel
          isAutoPlaying={autoPlayer.isAutoPlaying}
          isThinking={autoPlayer.isThinking}
          turnsPlayed={autoPlayer.turnsPlayed}
          lastError={autoPlayer.lastError}
          toggleAutoPlayer={autoPlayer.toggleAutoPlayer}
          autoPlayerSettings={autoPlayer.autoPlayerSettings}
          updateAutoPlayerSettings={autoPlayer.updateAutoPlayerSettings}
          characterName={character?.name}
          isGeneratingScene={isGeneratingScene}
          onClose={onAutoPlayerSettingsClose}
        />
      )}

      {recap.summaryModalOpen && (
        <SummaryModal
          onClose={recap.closeSummaryModal}
          onGenerate={recap.generateSummary}
          onCopy={recap.copySummary}
          onSpeak={recap.speakSummary}
          summaryText={recap.summaryText}
          isLoading={recap.summaryLoading}
          error={recap.summaryError}
          progress={recap.summaryProgress}
          copied={recap.summaryCopied}
          summaryOptions={recap.summaryOptions}
          onSummaryOptionsChange={recap.setSummaryOptions}
          sceneIndex={displayedSceneIndex}
          totalScenes={scenes.length}
          narrationMessageId={recap.summaryNarrationMessageId}
          narrationWordOffset={recap.summaryNarrationWordOffset}
          narratorCurrentMessageId={narrator.currentMessageId}
          narratorHighlightInfo={narrator.highlightInfo}
          speakLoading={recap.summarySpeakLoading}
          sentencesPerScene={recap.summarySentencesPerScene}
          onSentencesPerSceneChange={recap.setSummarySentencesPerScene}
          recapScenes={scenes.slice(0, Math.max(0, displayedSceneIndex) + 1)}
        />
      )}

      {isMultiplayer && (
        <FloatingVideoPanel
          visible={videoPanelOpen}
          onClose={onVideoPanelClose}
        />
      )}
    </>
  );
}
