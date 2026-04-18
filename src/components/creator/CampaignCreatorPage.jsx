import { useState, useEffect, useRef, useCallback } from 'react';
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
  genreIds,
  genreIcons,
  toneIds,
  toneIcons,
  styleIds,
  difficultyIds,
  lengthIds,
} from './creatorConstants';
import ChipGroup from './ChipGroup';
import ModeToggle from './ModeToggle';
import CharacterPicker from './CharacterPicker';
import StoryPromptSection from './StoryPromptSection';

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

  const [mode, setMode] = useState(mp.state.isMultiplayer ? 'multiplayer' : 'solo');
  const isMultiplayer = mode === 'multiplayer';
  const inMpRoom = mp.state.isMultiplayer && mp.state.roomCode;
  const isGuest = inMpRoom && !mp.state.isHost;

  const [form, setForm] = useState({
    genre: 'Fantasy',
    tone: 'Epic',
    style: 'Hybrid',
    difficulty: 'Normal',
    length: 'Medium',
    storyPrompt: '',
    livingWorldEnabled: false,
  });

  const [isRandomizing, setIsRandomizing] = useState(false);
  const [isGeneratingFromInput, setIsGeneratingFromInput] = useState(false);
  const [charMode, setCharMode] = useState('new');
  const [savedCharacters, setSavedCharacters] = useState([]);
  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const [charsLoaded, setCharsLoaded] = useState(false);
  const [showCharModal, setShowCharModal] = useState(false);
  const [createdCharacter, setCreatedCharacter] = useState(null);
  const [editingSelectedPortrait, setEditingSelectedPortrait] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const hasCharacter = charMode === 'new' ? !!createdCharacter : !!selectedCharacter;

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

  useEffect(() => {
    const root = document.documentElement;
    const genreFilters = {
      'Sci-Fi': 'hue-rotate(-45deg) saturate(1.35) brightness(1.05)',
      Horror: 'hue-rotate(160deg) saturate(0.7) brightness(0.92)',
    };
    const filter = genreFilters[form.genre] || '';
    root.style.transition = 'filter 0.8s cubic-bezier(.4,0,.2,1)';
    root.style.filter = filter;
    return () => {
      root.style.filter = '';
      root.style.transition = '';
    };
  }, [form.genre]);

  // Guest: sync local form from host's room settings
  const roomSettings = mp.state.roomSettings;
  useEffect(() => {
    if (!isGuest || !roomSettings) return;
    setForm((prev) => ({
      ...prev,
      genre: roomSettings.genre ?? prev.genre,
      tone: roomSettings.tone ?? prev.tone,
      style: roomSettings.style ?? prev.style,
      difficulty: roomSettings.difficulty ?? prev.difficulty,
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
          style: updated.style,
          difficulty: updated.difficulty,
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
    const char = charMode === 'new' ? createdCharacter : selectedCharacter;
    if (!char) return;
    mp.updateMyCharacter({
      name: char.name,
      gender: char.gender,
      characterData: char,
    });
  }, [inMpRoom, charMode, createdCharacter, selectedCharacter]);

  const handleRandomize = async () => {
    if (!hasServerAi || isRandomizing) return;
    setIsRandomizing(true);
    try {
      const prompt = await generateStoryPrompt({
        genre: form.genre,
        tone: form.tone,
        style: form.style,
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
        style: form.style,
        seedText,
      });
      updateForm((p) => ({ ...p, storyPrompt: prompt }));
    } catch {
      // Error handled via context
    } finally {
      setIsGeneratingFromInput(false);
    }
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
      style: form.style,
      difficulty: form.difficulty,
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
      career: saved?.career || saved?.careerData || nextCharacter.career,
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
            careerData: normalized.career || normalized.careerData || entry.careerData,
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
    <div className="max-w-4xl mx-auto px-6 py-12">
      {(state.isLoading || mp.state.isGenerating || isSubmitting) ? (
        <div className="flex flex-col items-center justify-center py-32 animate-fade-in">
          <CountdownProgress durationSeconds={120} label={t('creator.loadingTitle')} />
          <p className="text-on-surface-variant text-sm mt-6 text-center max-w-md">
            {t('creator.loadingDescription')}
          </p>
        </div>
      ) : (
        <div className="space-y-12 animate-fade-in">
          <div className="mb-12">
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

          {isMultiplayer && (
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
          )}

          <section>
            <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-4">
              {t('creator.genreLabel')}
            </label>
            <ChipGroup
              name="genre"
              options={genreIds}
              value={form.genre}
              onChange={(v) => updateForm((p) => ({ ...p, genre: v }))}
              showIcons
              icons={genreIcons}
              labels={Object.fromEntries(genreIds.map((id) => [id, t(`creator.genres.${id}`)]))}
              descriptions={Object.fromEntries(genreIds.map((id) => [id, t(`creator.genreDesc.${id}`)]))}
              disabled={isGuest}
            />
          </section>

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
              icons={toneIcons}
              labels={Object.fromEntries(toneIds.map((id) => [id, t(`creator.tones.${id}`)]))}
              descriptions={Object.fromEntries(toneIds.map((id) => [id, t(`creator.toneDesc.${id}`)]))}
              disabled={isGuest}
            />
          </section>

          <CharacterPicker
            charMode={charMode}
            onCharModeChange={setCharMode}
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

          <section>
            <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-4">
              {t('creator.playStyleLabel')}
            </label>
            <ChipGroup
              name="style"
              options={styleIds}
              value={form.style}
              onChange={(v) => updateForm((p) => ({ ...p, style: v }))}
              labels={Object.fromEntries(styleIds.map((id) => [id, t(`creator.styles.${id}`)]))}
              descriptions={Object.fromEntries(styleIds.map((id) => [id, t(`creator.styleDesc.${id}`)]))}
              disabled={isGuest}
            />
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <section>
              <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-4">
                {t('creator.difficultyLabel')}
              </label>
              <ChipGroup
                name="difficulty"
                options={difficultyIds}
                value={form.difficulty}
                onChange={(v) => updateForm((p) => ({ ...p, difficulty: v }))}
                labels={Object.fromEntries(difficultyIds.map((id) => [id, t(`creator.difficulties.${id}`)]))}
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
                labels={Object.fromEntries(lengthIds.map((id) => [id, t(`creator.lengths.${id}`)]))}
                disabled={isGuest}
              />
            </section>
          </div>

          <StoryPromptSection
            storyPrompt={form.storyPrompt}
            onStoryPromptChange={(v) => updateForm((p) => ({ ...p, storyPrompt: v }))}
            isGuest={isGuest}
            hasServerAi={hasServerAi}
            isRandomizing={isRandomizing}
            isGeneratingFromInput={isGeneratingFromInput}
            onRandomize={handleRandomize}
            onGenerateFromInput={handleGenerateFromInput}
          />

          <section className="border border-outline-variant/15 rounded-sm p-5 bg-surface-container-high/20">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 accent-tertiary"
                checked={!!form.livingWorldEnabled}
                disabled={isGuest}
                onChange={(e) => updateForm((p) => ({ ...p, livingWorldEnabled: e.target.checked }))}
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-label text-sm text-on-surface">Living World</span>
                  <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded-sm bg-tertiary/20 text-tertiary border border-tertiary/30">
                    Experimental
                  </span>
                </div>
                <p className="text-on-surface-variant text-xs leading-relaxed">
                  Ważni NPC i lokacje żyją między wizytami. Gdy opuścisz lokację, NPC zostaje zapauzowany i „żyje dalej" po powrocie (zależnie od upływu czasu). Świat persystuje między Twoimi kampaniami.
                </p>
              </div>
            </label>
          </section>

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
