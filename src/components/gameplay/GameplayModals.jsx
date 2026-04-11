import WorldStateModal from './WorldStateModal';
import GMModal from './gm/GMModal';
import MultiplayerPanel from '../multiplayer/MultiplayerPanel';
import AdvancementPanel from '../character/AdvancementPanel';
import AchievementsPanel from '../character/AchievementsPanel';
import AutoPlayerPanel from './AutoPlayerPanel';
import SummaryModal from './SummaryModal';
import FloatingVideoPanel from '../multiplayer/FloatingVideoPanel';

export default function GameplayModals({
  readOnly,
  isMultiplayer,
  mpGameState,
  state,
  settings,
  dispatch,
  autoSave,
  narrator,
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
  if (readOnly) return null;

  return (
    <>
      {worldModalOpen && (
        <WorldStateModal
          world={isMultiplayer ? mpGameState?.world : state.world}
          quests={isMultiplayer ? mpGameState?.quests : state.quests}
          characterVoiceMap={state.characterVoiceMap}
          maleVoices={settings.maleVoices}
          femaleVoices={settings.femaleVoices}
          dispatch={dispatch}
          autoSave={autoSave}
          onClose={onWorldModalClose}
        />
      )}

      {gmModalOpen && <GMModal onClose={onGmModalClose} />}

      {mpPanelOpen && <MultiplayerPanel onClose={onMpPanelClose} />}

      {advancementOpen && <AdvancementPanel onClose={onAdvancementClose} />}

      {achievementsOpen && (
        <AchievementsPanel
          achievementState={state.achievements}
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
