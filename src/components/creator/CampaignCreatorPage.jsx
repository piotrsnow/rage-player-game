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
import PortraitGenerator from '../character/PortraitGenerator';
import { ATTRIBUTE_KEYS } from '../../data/rpgSystem';
import { useModals } from '../../contexts/ModalContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

const genreIds = ['Fantasy', 'Sci-Fi', 'Horror'];
const genreIcons = { Fantasy: 'auto_fix_high', 'Sci-Fi': 'rocket_launch', Horror: 'skull' };
const toneIds = ['Dark', 'Epic', 'Humorous'];
const toneIcons = { Dark: 'dark_mode', Epic: 'whatshot', Humorous: 'sentiment_very_satisfied' };
const styleIds = ['Narrative', 'Hybrid', 'Mechanical'];
const difficultyIds = ['Easy', 'Normal', 'Hard', 'Expert'];
const lengthIds = ['Short', 'Medium', 'Long'];

function ChipGroup({ options, value, onChange, showIcons = false, icons = {}, labels = {}, descriptions = {}, disabled = false, name = '' }) {
  return (
    <div className="flex flex-wrap gap-3">
      {options.map((id) => {
        const isActive = value === id;
        return (
          <button
            key={id}
            data-testid={name ? `chip-${name}-${id}` : undefined}
            onClick={() => !disabled && onChange(id)}
            disabled={disabled}
            className={`px-4 py-3 rounded-sm font-label text-sm transition-all duration-300 border ${
              disabled
                ? isActive
                  ? 'bg-surface-tint/60 text-on-primary/70 border-primary/40 cursor-default'
                  : 'bg-surface-container-high/20 text-on-surface-variant/40 border-outline-variant/10 cursor-default'
                : isActive
                  ? 'bg-surface-tint text-on-primary border-primary shadow-[0_0_20px_rgba(197,154,255,0.3)]'
                  : 'bg-surface-container-high/40 text-on-surface-variant border-outline-variant/15 hover:bg-surface-container-high hover:text-tertiary hover:border-primary/20'
            }`}
          >
            <div className="flex items-center gap-2">
              {showIcons && icons[id] && (
                <span className="material-symbols-outlined text-lg">{icons[id]}</span>
              )}
              <div className="text-left">
                <div className="font-bold">{labels[id] || id}</div>
                {descriptions[id] && <div className="text-[10px] opacity-70 mt-0.5">{descriptions[id]}</div>}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

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
      // Error is handled via context
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
      <div className="mb-12 animate-fade-in">
        <h1 className="font-headline text-4xl md:text-5xl text-tertiary mb-2 tracking-tight">
          {t('creator.title')}
        </h1>
        <p className="text-on-surface-variant max-w-2xl font-body leading-relaxed">
          {t('creator.subtitle')}
        </p>
      </div>

      {/* Solo / Multiplayer Toggle */}
      <div className="flex gap-3 mb-10 animate-fade-in">
        <button
          onClick={() => !inMpRoom && setMode('solo')}
          disabled={inMpRoom}
          className={`px-5 py-3 rounded-sm font-label text-sm border transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed ${
            mode === 'solo'
              ? 'bg-surface-tint text-on-primary border-primary shadow-[0_0_20px_rgba(197,154,255,0.3)]'
              : 'bg-surface-container-high/40 text-on-surface-variant border-outline-variant/15 hover:bg-surface-container-high'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-lg">person</span>
            <span className="font-bold">{t('multiplayer.solo')}</span>
          </div>
        </button>
        <button
          onClick={() => setMode('multiplayer')}
          disabled={!isBackendConnected}
          className={`px-5 py-3 rounded-sm font-label text-sm border transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed ${
            mode === 'multiplayer'
              ? 'bg-surface-tint text-on-primary border-primary shadow-[0_0_20px_rgba(197,154,255,0.3)]'
              : 'bg-surface-container-high/40 text-on-surface-variant border-outline-variant/15 hover:bg-surface-container-high'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-lg">group</span>
            <span className="font-bold">{t('multiplayer.multiplayer')}</span>
          </div>
        </button>
        {!isBackendConnected && (
          <span className="self-center text-[10px] text-on-surface-variant">
            {t('multiplayer.backendRequired')}
          </span>
        )}
      </div>

      {(state.isLoading || mp.state.isGenerating) ? (
        <div className="flex flex-col items-center justify-center py-32 animate-fade-in">
          <CountdownProgress durationSeconds={120} label={t('creator.loadingTitle')} />
          <p className="text-on-surface-variant text-sm mt-6 text-center max-w-md">
            {t('creator.loadingDescription')}
          </p>
        </div>
      ) : (
        <div className="space-y-12 animate-fade-in">
          {/* Guest notice */}
          {isGuest && (
            <div className="bg-surface-container-high/30 border border-outline-variant/15 p-4 rounded-sm flex items-center gap-3">
              <span className="material-symbols-outlined text-tertiary text-lg">visibility</span>
              <p className="text-on-surface-variant text-sm">
                {t('multiplayer.guestSettingsNotice', 'The host is configuring the campaign settings. You can see changes in real-time.')}
              </p>
            </div>
          )}

          {/* Multiplayer Lobby */}
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

          {/* Genre */}
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

          {/* Tone */}
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

          {/* Character Picker */}
          <section>
            <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-4">
              {t('characterPicker.title')}
            </label>

            <div className="flex gap-3 mb-6">
              <button
                onClick={() => {
                  setCharMode('new');
                  setSelectedCharacter(null);
                  setEditingSelectedPortrait(false);
                }}
                className={`flex-1 px-4 py-4 rounded-sm border transition-all duration-300 text-left ${
                  charMode === 'new'
                    ? 'bg-surface-tint text-on-primary border-primary shadow-[0_0_20px_rgba(197,154,255,0.3)]'
                    : 'bg-surface-container-high/40 text-on-surface-variant border-outline-variant/15 hover:bg-surface-container-high hover:text-tertiary hover:border-primary/20'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="material-symbols-outlined text-lg">person_add</span>
                  <span className="font-bold text-sm">{t('characterPicker.createNew')}</span>
                </div>
                <p className="text-[10px] opacity-70">{t('characterPicker.createNewDesc')}</p>
              </button>
              <button
                onClick={() => {
                  setCharMode('existing');
                  setEditingSelectedPortrait(false);
                }}
                className={`flex-1 px-4 py-4 rounded-sm border transition-all duration-300 text-left ${
                  charMode === 'existing'
                    ? 'bg-surface-tint text-on-primary border-primary shadow-[0_0_20px_rgba(197,154,255,0.3)]'
                    : 'bg-surface-container-high/40 text-on-surface-variant border-outline-variant/15 hover:bg-surface-container-high hover:text-tertiary hover:border-primary/20'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="material-symbols-outlined text-lg">group</span>
                  <span className="font-bold text-sm">{t('characterPicker.useExisting')}</span>
                </div>
                <p className="text-[10px] opacity-70">{t('characterPicker.useExistingDesc')}</p>
              </button>
            </div>

            {/* New character: modal trigger + summary */}
            {charMode === 'new' && (
              <div className="animate-fade-in">
                {createdCharacter ? (
                  <div className="p-4 bg-surface-container-high/30 border border-primary/20 rounded-sm">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">check_circle</span>
                        <span className="text-xs font-bold text-primary uppercase tracking-wider">{t('charCreator.characterReady')}</span>
                      </div>
                      <button
                        onClick={() => setShowCharModal(true)}
                        className="flex items-center gap-1 text-xs text-tertiary hover:text-primary transition-colors"
                      >
                        <span className="material-symbols-outlined text-sm">edit</span>
                        {t('charCreator.editCharacter')}
                      </button>
                    </div>
                    <div className="flex items-start gap-4">
                      <div className="w-14 h-[72px] bg-surface-container-lowest rounded-sm flex items-center justify-center overflow-hidden shrink-0 border border-outline-variant/10">
                        {createdCharacter.portraitUrl ? (
                          <img src={apiClient.resolveMediaUrl(createdCharacter.portraitUrl)} alt={createdCharacter.name} className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
                        ) : (
                          <span className="material-symbols-outlined text-2xl text-primary/60">person</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-headline text-lg text-tertiary">{createdCharacter.name}</p>
                        <p className="text-xs text-on-surface-variant">
                          {t(`species.${createdCharacter.species}`)}
                        </p>
                        <div className="flex flex-wrap gap-3 mt-2">
                          {ATTRIBUTE_KEYS.slice(0, 5).map((key) => (
                            <span key={key} className="text-[10px] text-on-surface-variant">
                              {t(`rpgAttributeShort.${key}`)}: <strong className="text-tertiary">{(createdCharacter.attributes || createdCharacter.characteristics)?.[key]}</strong>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowCharModal(true)}
                    className="w-full p-6 border border-dashed border-outline-variant/30 rounded-sm hover:border-primary/40 hover:bg-surface-tint/5 transition-all group"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <span className="material-symbols-outlined text-3xl text-outline group-hover:text-primary transition-colors">person_add</span>
                      <span className="text-sm font-label text-on-surface-variant group-hover:text-primary transition-colors">
                        {t('charCreator.createCharacter')}
                      </span>
                    </div>
                  </button>
                )}
              </div>
            )}

            {/* Existing character picker */}
            {charMode === 'existing' && (
              <div className="animate-fade-in">
                {savedCharacters.length === 0 ? (
                  <p className="text-on-surface-variant text-sm text-center py-6 border border-outline-variant/10 rounded-sm bg-surface-container-high/20">
                    {t('characterPicker.noCharacters')}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {savedCharacters.map((ch) => {
                      const career = ch.careerData || ch.career || {};
                      const charId = ch.backendId || ch.localId || ch.id;
                      const isSelected = selectedCharacter && (selectedCharacter.backendId || selectedCharacter.localId || selectedCharacter.id) === charId;
                      return (
                        <div
                          key={charId}
                          className={`p-4 rounded-sm border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-primary/10 border-primary/30 shadow-[0_0_15px_rgba(197,154,255,0.2)]'
                              : 'bg-surface-container-high/40 border-outline-variant/10 hover:border-primary/20 hover:bg-surface-container-high/60'
                          }`}
                          onClick={async () => {
                            if (isSelected) {
                              setSelectedCharacter(null);
                              setEditingSelectedPortrait(false);
                            } else {
                              const id = ch.backendId || ch.localId || ch.id;
                              let fullChar;
                              try {
                                fullChar = await storage.loadCharacter(id);
                              } catch {
                                fullChar = null;
                              }
                              const base = fullChar || ch;
                              const normalized = {
                                ...base,
                                career: base.career || base.careerData || career,
                                backendId: base.backendId || ch.backendId || ch.id,
                                localId: base.localId || ch.localId || ch.id,
                              };
                              setSelectedCharacter(normalized);
                              setEditingSelectedPortrait(false);
                            }
                          }}
                        >
                          <div className="flex items-start gap-3">
                            <div className="w-12 h-16 bg-surface-container-lowest rounded-sm flex items-center justify-center overflow-hidden shrink-0 border border-outline-variant/10">
                              {ch.portraitUrl ? (
                                <img src={apiClient.resolveMediaUrl(ch.portraitUrl)} alt={ch.name} className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
                              ) : (
                                <span className="material-symbols-outlined text-xl text-outline/40">person</span>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className={`font-headline text-sm truncate ${isSelected ? 'text-primary' : 'text-tertiary'}`}>
                                {ch.name}
                              </p>
                              <p className="text-[10px] text-on-surface-variant truncate">
                                {t(`species.${ch.species}`, { defaultValue: ch.species })}
                              </p>
                              <div className="flex items-center gap-2 mt-1 text-[9px] text-outline">
                                <span>{ch.xp || 0} {t('characterPicker.xpLabel')}</span>
                              </div>
                            </div>
                            {isSelected && (
                              <span className="material-symbols-outlined text-primary text-lg shrink-0">check_circle</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {selectedCharacter && (
                  <div className="mt-4 p-4 bg-surface-container-high/30 border border-primary/20 rounded-sm">
                    <div className="flex items-center justify-between mb-3 gap-3">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">check_circle</span>
                        <span className="text-xs font-bold text-primary uppercase tracking-wider">
                          {t('characterPicker.selectedCharacter')}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditingSelectedPortrait((prev) => !prev)}
                        className="flex items-center gap-1 text-xs text-tertiary hover:text-primary transition-colors"
                      >
                        <span className="material-symbols-outlined text-sm">photo_camera</span>
                        {t('character.updatePortrait')}
                      </button>
                    </div>

                    <div className="flex items-start gap-4">
                      <div className="w-16 h-[85px] bg-surface-container-lowest rounded-sm flex items-center justify-center overflow-hidden shrink-0 border border-outline-variant/10">
                        {selectedCharacter.portraitUrl ? (
                          <img src={apiClient.resolveMediaUrl(selectedCharacter.portraitUrl)} alt={selectedCharacter.name} className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
                        ) : (
                          <span className="material-symbols-outlined text-3xl text-primary/60">person</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-headline text-lg text-tertiary">{selectedCharacter.name}</p>
                        <p className="text-xs text-on-surface-variant">
                          {t(`species.${selectedCharacter.species}`, { defaultValue: selectedCharacter.species })}
                        </p>
                        <div className="flex flex-wrap gap-3 mt-2">
                          {ATTRIBUTE_KEYS.slice(0, 5).map((key) => (
                            <span key={key} className="text-[10px] text-on-surface-variant">
                              {t(`rpgAttributeShort.${key}`)}: <strong className="text-tertiary">{(selectedCharacter.attributes || selectedCharacter.characteristics)?.[key]}</strong>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {editingSelectedPortrait && (
                      <div className="mt-4 pt-4 border-t border-outline-variant/10">
                        <PortraitGenerator
                          species={selectedCharacter.species}
                          gender={selectedCharacter.gender}
                          careerName={selectedCharacter.career?.name}
                          genre={form.genre}
                          initialPortrait={selectedCharacter.portraitUrl}
                          onPortraitReady={async (url) => {
                            try {
                              await persistSelectedCharacter({ portraitUrl: url || '' });
                              setEditingSelectedPortrait(false);
                            } catch {
                              // Keep the editor open so the user can retry.
                            }
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Play Style */}
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

          {/* Difficulty & Length */}
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

          {/* Story Prompt */}
          <section>
            <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-4">
              {t('creator.storyPromptLabel')}
            </label>
            <div className="relative">
              <textarea
                data-testid="story-prompt"
                value={form.storyPrompt}
                onChange={(e) => updateForm((p) => ({ ...p, storyPrompt: e.target.value }))}
                placeholder={isGuest ? t('multiplayer.waitingForHost', 'Waiting for host to set the story...') : t('creator.storyPlaceholder')}
                rows={4}
                readOnly={isGuest}
                className={`w-full bg-transparent border-0 border-b border-outline-variant/20 focus:border-primary/50 focus:ring-0 text-on-surface text-sm py-3 px-1 resize-none placeholder:text-outline/40 custom-scrollbar font-body ${
                  isGuest ? 'opacity-70 cursor-default' : ''
                }`}
              />
            </div>
            {!isGuest && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={handleRandomize}
                  disabled={!hasServerAi || isRandomizing || isGeneratingFromInput}
                  className="flex items-center gap-2 px-3 py-2 text-xs font-label text-tertiary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200"
                >
                  <span className={`material-symbols-outlined text-base ${isRandomizing ? 'animate-spin' : ''}`}>
                    {isRandomizing ? 'progress_activity' : 'casino'}
                  </span>
                  {isRandomizing ? t('creator.randomizingPrompt') : t('creator.randomizePrompt')}
                </button>
                <button
                  onClick={handleGenerateFromInput}
                  disabled={!hasServerAi || !form.storyPrompt.trim() || isGeneratingFromInput || isRandomizing}
                  title={t('creator.generatePromptFromInput')}
                  aria-label={t('creator.generatePromptFromInput')}
                  className="flex items-center justify-center px-3 py-2 text-xs font-label text-tertiary hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200"
                >
                  <span className={`material-symbols-outlined text-base ${isGeneratingFromInput ? 'animate-spin' : ''}`}>
                    {isGeneratingFromInput ? 'progress_activity' : 'auto_fix_high'}
                  </span>
                </button>
              </div>
            )}
          </section>

          {/* Error */}
          {(state.error || mp.state.error) && (
            <div className="bg-error-container/20 border border-error/20 p-4 rounded-sm">
              <p className="text-error text-sm flex items-center gap-2">
                <span className="material-symbols-outlined text-lg">error</span>
                {state.error || mp.state.error}
              </p>
            </div>
          )}

          {/* Submit */}
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
