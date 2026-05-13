import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAI } from '../../hooks/useAI';
import { useGameState } from '../../hooks/useGameState';
import { useSettings } from '../../contexts/SettingsContext';
import { useGame } from '../../contexts/GameContext';
import { useMultiplayer } from '../../contexts/MultiplayerContext';
import { apiClient } from '../../services/apiClient';
import { storage } from '../../services/storage';
import Button from '../ui/Button';
import CountdownProgress from '../ui/CountdownProgress';
import PlayerLobby from '../multiplayer/PlayerLobby';
import CharacterCreationModal from '../character/CharacterCreationModal';
import { useModals } from '../../contexts/ModalContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import {
  toneIds,
  toneIcons,
  lengthIds,
  lengthIcons,
  difficultyIds,
  difficultyIcons,
} from './creatorConstants';
import { allowedTiersForLevel } from '../../../shared/domain/difficultyTier';
import VideoBackground from '../ui/VideoBackground';
import ChipGroup from './ChipGroup';
import ModeToggle from './ModeToggle';
import CharacterPicker from './CharacterPicker';
import StoryPromptSection from './StoryPromptSection';
import { useGlobalMusic } from '../../contexts/MusicContext';

export default function CampaignCreatorPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  useDocumentTitle(t('creator.title'));
  const { generateCampaign, generateStoryPrompt } = useAI();
  const { startNewCampaign } = useGameState();
  const { settings, hasApiKey } = useSettings();
  const { state } = useGame();
  const mp = useMultiplayer();
  const { openSettings } = useModals();
  const { setPendingCampaignGenre } = useGlobalMusic();

  const [mode, setMode] = useState(mp.state.isMultiplayer ? 'multiplayer' : 'solo');
  const isMultiplayer = mode === 'multiplayer';
  const inMpRoom = mp.state.isMultiplayer && mp.state.roomCode;
  const isGuest = inMpRoom && !mp.state.isHost;

  const [form, setForm] = useState({
    genre: 'Fantasy',
    tone: 'Epic',
    length: 'Medium',
    storyPrompt: '',
    livingWorldEnabled: true,
    // Phase 7 — world time controls. Only sent to backend when
    // livingWorldEnabled is true (and the user left defaults alone → omitted).
    worldTimeRatio: 24,
    worldTimeMaxGapDays: 7,
    // G1 — encounter difficulty cap. Validated against character level at
    // submit time (backend enforces too). Default 'low' = safest choice.
    difficultyTier: 'low',
  });

  const [isRandomizing, setIsRandomizing] = useState(false);
  const [isGeneratingFromInput, setIsGeneratingFromInput] = useState(false);

  const [savedCharacters, setSavedCharacters] = useState([]);
  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const [charsLoaded, setCharsLoaded] = useState(false);
  const [showCharModal, setShowCharModal] = useState(false);
  const [createdCharacter, setCreatedCharacter] = useState(null);
  const [editingSelectedPortrait, setEditingSelectedPortrait] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isGenerating = state.isLoading || mp.state.isGenerating || isSubmitting;
  const [genVideoFading, setGenVideoFading] = useState(false);
  const [genVideoVisible, setGenVideoVisible] = useState(false);
  const genAmbientVideoRef = useRef(null);

  const [bgVideoVisible, setBgVideoVisible] = useState(true);
  const [bgVideoFading, setBgVideoFading] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setBgVideoFading(true), 300);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (isGenerating) {
      setGenVideoVisible(true);
      setGenVideoFading(false);
    } else {
      setGenVideoVisible(false);
    }
  }, [isGenerating]);

  useLayoutEffect(() => {
    if (!isGenerating) return undefined;
    setPendingCampaignGenre(form.genre);
    return () => setPendingCampaignGenre(null);
  }, [isGenerating, form.genre, setPendingCampaignGenre]);

  useEffect(() => {
    if (!isGenerating) return undefined;
    const el = genAmbientVideoRef.current;
    if (!el) return undefined;
    el.playbackRate = 0.75;
    const kick = () => {
      el.play().catch(() => {});
    };
    kick();
    el.addEventListener('loadeddata', kick);
    return () => el.removeEventListener('loadeddata', kick);
  }, [isGenerating]);

  const [showTopicHistory, setShowTopicHistory] = useState(false);
  const [topicHistory, setTopicHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const hasCharacter = !!createdCharacter || !!selectedCharacter;

  useEffect(() => {
    if (charsLoaded) return;
    (async () => {
      try {
        const chars = await storage.getCharactersAsync();
        setSavedCharacters(chars);
      } catch {
        setSavedCharacters(storage.getCharacters());
      }
      setCharsLoaded(true);
    })();
  }, [charsLoaded]);
  const hasServerAi = hasApiKey('openai') || hasApiKey('anthropic');
  const isBackendConnected = apiClient.isConnected();

  // Guest: sync local form from host's room settings
  const roomSettings = mp.state.roomSettings;
  useEffect(() => {
    if (!isGuest || !roomSettings) return;
    setForm((prev) => ({
      ...prev,
      tone: roomSettings.tone ?? prev.tone,
      length: roomSettings.length ?? prev.length,
      storyPrompt: roomSettings.storyPrompt ?? prev.storyPrompt,
    }));
  }, [isGuest, roomSettings]);

  // Host: broadcast settings to server on each change (debounced for storyPrompt)
  const debounceRef = useRef(null);
  const broadcastSettings = useCallback(
    (updated) => {
      if (!inMpRoom || !mp.state.isHost) return;
      clearTimeout(debounceRef.current);
      const send = () => {
        mp.updateSettings({
          genre: updated.genre,
          tone: updated.tone,
          length: updated.length,
          storyPrompt: updated.storyPrompt,
          needsSystemEnabled: settings.needsSystemEnabled ?? false,
        });
      };
      debounceRef.current = setTimeout(send, 300);
    },
    [inMpRoom, mp.state.isHost, mp],
  );

  const updateForm = useCallback(
    (updater) => {
      setForm((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
        broadcastSettings(next);
        return next;
      });
    },
    [broadcastSettings],
  );

  // Sync selected/created character to multiplayer room
  useEffect(() => {
    if (!inMpRoom) return;
    const char = createdCharacter || selectedCharacter;
    if (!char) return;
    mp.updateMyCharacter({
      name: char.name,
      gender: char.gender,
      characterData: char,
    });
  }, [inMpRoom, createdCharacter, selectedCharacter]);

  const handleRandomize = async () => {
    if (!hasServerAi || isRandomizing) return;
    setIsRandomizing(true);
    try {
      const prompt = await generateStoryPrompt({
        genre: form.genre,
        tone: form.tone,
      });
      updateForm((p) => ({ ...p, storyPrompt: prompt }));
    } catch {
      // Error handled via context
    } finally {
      setIsRandomizing(false);
    }
  };

  const handleGenerateFromInput = async () => {
    const seedText = form.storyPrompt.trim();
    if (!hasServerAi || isGeneratingFromInput || !seedText) return;

    setIsGeneratingFromInput(true);
    try {
      const prompt = await generateStoryPrompt({
        genre: form.genre,
        tone: form.tone,
        seedText,
      });
      updateForm((p) => ({ ...p, storyPrompt: prompt }));
      apiClient.post('/topic-history', {
        seedText,
        generatedTopic: prompt,
        genre: form.genre,
        tone: form.tone,
      }).catch(() => {});
    } catch {
      // Error handled via context
    } finally {
      setIsGeneratingFromInput(false);
    }
  };

  const handleToggleHistory = async () => {
    if (showTopicHistory) {
      setShowTopicHistory(false);
      return;
    }
    setIsLoadingHistory(true);
    setShowTopicHistory(true);
    try {
      const data = await apiClient.get('/topic-history?page=1&pageSize=30');
      setTopicHistory(data.items || []);
    } catch {
      setTopicHistory([]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleSelectFromHistory = (text) => {
    updateForm((p) => ({ ...p, storyPrompt: text }));
    setShowTopicHistory(false);
  };

  const handleCreateRoom = async () => {
    try {
      await mp.createRoom();
    } catch {
      // Error handled in context
    }
  };

  const handleStartMultiplayerGame = () => {
    if (!form.storyPrompt.trim()) return;
    // Final sync before starting (in case debounce hasn't fired yet)
    clearTimeout(debounceRef.current);
    mp.updateSettings({
      genre: form.genre,
      tone: form.tone,
      length: form.length,
      storyPrompt: form.storyPrompt,
      needsSystemEnabled: settings.needsSystemEnabled ?? false,
    });
    mp.startGame(settings.language || 'en');
  };

  const persistSelectedCharacter = useCallback(async (updates) => {
    if (!selectedCharacter) return null;

    const nextCharacter = { ...selectedCharacter, ...updates };
    const saved = await storage.saveCharacter(nextCharacter);
    const normalized = {
      ...nextCharacter,
      ...saved,
    };
    const previousId = selectedCharacter.backendId || selectedCharacter.localId || selectedCharacter.id;
    const nextId = normalized.backendId || normalized.localId || normalized.id || previousId;

    setSelectedCharacter(normalized);
    setSavedCharacters((prev) => {
      let replaced = false;
      const updated = prev.map((entry) => {
        const entryId = entry.backendId || entry.localId || entry.id;
        if (entryId === previousId || entryId === nextId) {
          replaced = true;
          return {
            ...entry,
            ...normalized,
          };
        }
        return entry;
      });
      return replaced ? updated : [normalized, ...updated];
    });

    return normalized;
  }, [selectedCharacter]);

  const handleSubmit = async () => {
    if (!form.storyPrompt.trim()) return;
    if (!selectedCharacter && !createdCharacter) return;
    if (!hasServerAi) {
      openSettings();
      return;
    }

    setIsSubmitting(true);
    try {
      const formWithChar = selectedCharacter
        ? {
            ...form,
            existingCharacter: selectedCharacter,
            characterName: selectedCharacter.name,
            species: selectedCharacter.species,
            careerPreference: selectedCharacter.career?.name,
          }
        : createdCharacter
          ? { ...form, createdCharacter, characterName: createdCharacter.name, species: createdCharacter.species }
          : form;
      if (createdCharacter) {
        storage.saveLastCharacterName(createdCharacter.name);
      }
      const result = await generateCampaign(formWithChar);
      const newCampaignId = await startNewCampaign(result, formWithChar);
      navigate(`/play/${newCampaignId}`);
    } catch {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (mp.state.phase === 'playing' && mp.state.gameState) {
      navigate('/play');
    }
  }, [mp.state.phase, mp.state.gameState, navigate]);

  if (mp.state.phase === 'playing' && mp.state.gameState) {
    return null;
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-12 relative z-10">
      {bgVideoVisible && (
        <div
          style={{ opacity: bgVideoFading ? 0 : 1, transition: 'opacity 1.2s ease-out' }}
          onTransitionEnd={() => { if (bgVideoFading) setBgVideoVisible(false); }}
        >
          <VideoBackground src="/video/bg_video_1.mp4" />
        </div>
      )}
      {isGenerating ? (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center animate-fade-in overflow-hidden">
          <div className="absolute inset-0 z-0">
            <video
              ref={genAmbientVideoRef}
              className="absolute inset-0 h-full w-full object-cover"
              src="/video/bg_video_1.mp4"
              autoPlay
              loop
              muted
              playsInline
            />
            <div className="absolute inset-0 bg-black/70" aria-hidden />
          </div>
          {genVideoVisible && (
            <div
              className="absolute inset-0 z-[5]"
              style={{
                opacity: genVideoFading ? 0 : 1,
                transition: 'opacity 0.8s ease-out',
              }}
              onTransitionEnd={() => { if (genVideoFading) setGenVideoVisible(false); }}
            >
              <video
                ref={(el) => { if (el) el.playbackRate = 0.75; }}
                className="h-full w-full object-cover"
                src="/video/krzemuch_intro.mp4"
                autoPlay
                muted
                playsInline
                onEnded={() => setGenVideoFading(true)}
              />
              <div className="absolute inset-0 bg-black/40" />
            </div>
          )}
          <div className="relative z-20">
            <CountdownProgress durationSeconds={180} label={t('creator.loadingTitle')} />
            <p className="text-on-surface-variant text-sm mt-6 text-center max-w-md">
              {t('creator.loadingDescription')}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-8 animate-fade-in">
          <div className="mb-8">
            <h1 className="font-headline text-4xl md:text-5xl text-tertiary mb-2 tracking-tight">
              {t('creator.title')}
            </h1>
            <p className="text-on-surface-variant max-w-2xl font-body leading-relaxed">
              {t('creator.subtitle')}
            </p>
          </div>

          <ModeToggle
            mode={mode}
            onModeChange={setMode}
            inMpRoom={inMpRoom}
            isBackendConnected={isBackendConnected}
          />

          {isGuest && (
            <div className="bg-surface-container-high/30 border border-outline-variant/15 p-4 rounded-sm flex items-center gap-3">
              <span className="material-symbols-outlined text-tertiary text-lg">visibility</span>
              <p className="text-on-surface-variant text-sm">
                {t('multiplayer.guestSettingsNotice', 'The host is configuring the campaign settings. You can see changes in real-time.')}
              </p>
            </div>
          )}

          <div
            className="grid transition-[grid-template-rows,opacity] duration-300 ease-out"
            style={{
              gridTemplateRows: isMultiplayer ? '1fr' : '0fr',
              opacity: isMultiplayer ? 1 : 0,
            }}
          >
            <div className="overflow-hidden">
              <section className="border border-outline-variant/15 rounded-sm p-6 bg-surface-container-high/20">
                {inMpRoom ? (
                  <PlayerLobby />
                ) : (
                  <div className="text-center space-y-4">
                    <p className="text-on-surface-variant text-sm">{t('multiplayer.createOrJoin')}</p>
                    <div className="flex gap-3 justify-center">
                      <Button onClick={handleCreateRoom}>
                        <span className="material-symbols-outlined text-sm">add</span>
                        {t('multiplayer.createRoom')}
                      </Button>
                      <Button variant="ghost" onClick={() => navigate('/join')}>
                        <span className="material-symbols-outlined text-sm">login</span>
                        {t('multiplayer.joinRoom')}
                      </Button>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>

          {(() => {
            const activeChar = createdCharacter || selectedCharacter;
            const charLevel = Number(activeChar?.characterLevel || activeChar?.level || 1);
            const tiers = allowedTiersForLevel(charLevel);
            if (!tiers.includes(form.difficultyTier)) {
              setTimeout(() => updateForm((p) => ({ ...p, difficultyTier: 'low' })), 0);
            }
            return (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <section>
                  <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-4">
                    {t('creator.toneLabel')}
                  </label>
                  <ChipGroup
                    name="tone"
                    options={toneIds}
                    value={form.tone}
                    onChange={(v) => updateForm((p) => ({ ...p, tone: v }))}
                    showIcons
                    iconOnly
                    icons={toneIcons}
                    labels={Object.fromEntries(toneIds.map((id) => [id, t(`creator.tones.${id}`)]))}
                    disabled={isGuest}
                  />
                </section>
                <section>
                  <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-4">
                    {t('creator.campaignLengthLabel')}
                  </label>
                  <ChipGroup
                    name="length"
                    options={lengthIds}
                    value={form.length}
                    onChange={(v) => updateForm((p) => ({ ...p, length: v }))}
                    showIcons
                    iconOnly
                    icons={lengthIcons}
                    labels={Object.fromEntries(lengthIds.map((id) => [id, t(`creator.lengths.${id}`)]))}
                    disabled={isGuest}
                  />
                </section>
                <section>
                  <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-4">
                    {t('creator.difficultyLabel')}
                  </label>
                  <ChipGroup
                    name="difficulty"
                    options={difficultyIds}
                    value={form.difficultyTier}
                    onChange={(v) => updateForm((p) => ({ ...p, difficultyTier: v }))}
                    showIcons
                    iconOnly
                    icons={difficultyIcons}
                    labels={Object.fromEntries(difficultyIds.map((id) => [id, t(`creator.difficulties.${id}`)]))}
                    disabled={isGuest}
                    disabledOptions={difficultyIds.filter((id) => !tiers.includes(id))}
                  />
                </section>
              </div>
            );
          })()}

          <CharacterPicker
            createdCharacter={createdCharacter}
            selectedCharacter={selectedCharacter}
            onSelectedCharacterChange={setSelectedCharacter}
            savedCharacters={savedCharacters}
            onShowCharModal={() => setShowCharModal(true)}
            editingSelectedPortrait={editingSelectedPortrait}
            onEditingSelectedPortraitChange={setEditingSelectedPortrait}
            persistSelectedCharacter={persistSelectedCharacter}
            genre={form.genre}
          />

          <StoryPromptSection
            storyPrompt={form.storyPrompt}
            onStoryPromptChange={(v) => updateForm((p) => ({ ...p, storyPrompt: v }))}
            isGuest={isGuest}
            hasServerAi={hasServerAi}
            isRandomizing={isRandomizing}
            isGeneratingFromInput={isGeneratingFromInput}
            onRandomize={handleRandomize}
            onGenerateFromInput={handleGenerateFromInput}
            showHistory={showTopicHistory}
            onToggleHistory={handleToggleHistory}
            topicHistory={topicHistory}
            onSelectHistory={handleSelectFromHistory}
            isLoadingHistory={isLoadingHistory}
          />

          {(state.error || mp.state.error) && (
            <div className="bg-error-container/20 border border-error/20 p-4 rounded-sm">
              <p className="text-error text-sm flex items-center gap-2">
                <span className="material-symbols-outlined text-lg">error</span>
                {state.error || mp.state.error}
              </p>
            </div>
          )}

          <div className="flex gap-4 pt-4">
            {isMultiplayer && inMpRoom && mp.state.isHost ? (
              <Button
                onClick={handleStartMultiplayerGame}
                disabled={!form.storyPrompt.trim() || mp.state.players.length < 1 || !hasCharacter}
                size="lg"
              >
                <span className="material-symbols-outlined text-sm">swords</span>
                {t('multiplayer.startGame')}
              </Button>
            ) : isMultiplayer && inMpRoom && isGuest ? (
              <div className="flex items-center gap-2 text-on-surface-variant text-sm py-3">
                <span className="material-symbols-outlined text-base animate-pulse">hourglass_top</span>
                {t('multiplayer.waitingForHostStart', 'Waiting for the host to start the game...')}
              </div>
            ) : !isMultiplayer ? (
              <Button
                data-testid="start-campaign"
                onClick={handleSubmit}
                disabled={!form.storyPrompt.trim() || !hasServerAi || !hasCharacter}
                size="lg"
              >
                <span className="material-symbols-outlined text-sm">auto_awesome</span>
                {t('creator.beginRitual')}
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => navigate('/')}>
              {t('common.cancel')}
            </Button>
          </div>

          {!hasServerAi && !isMultiplayer && (
            <p className="text-tertiary-dim text-xs flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">info</span>
              {t('creator.noApiKeyHint', 'Connect backend and set server AI keys in env to generate content.')}
            </p>
          )}
          {!hasCharacter && hasServerAi && (
            <p className="text-tertiary-dim text-xs flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">info</span>
              {t('creator.noCharacterHint')}
            </p>
          )}
        </div>
      )}

      {showCharModal && (
        <CharacterCreationModal
          genre={form.genre}
          initialCharacter={createdCharacter}
          onClose={() => setShowCharModal(false)}
          onConfirm={(char) => {
            setCreatedCharacter(char);
            setShowCharModal(false);
          }}
        />
      )}

    </div>
  );
}
