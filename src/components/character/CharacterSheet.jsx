import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  useGameCampaign,
  useGameCharacter,
  useGameScenes,
  useGameSlice,
  useGameDispatch,
  useGameAutoSave,
} from '../../stores/gameSelectors';
import { useSettings } from '../../contexts/SettingsContext';
import { useMultiplayer } from '../../contexts/MultiplayerContext';
import { useModalA11y } from '../../hooks/useModalA11y';
import { useAI } from '../../hooks/useAI';
import { storage } from '../../services/storage';
import AdvancementPanel from './AdvancementPanel';
import CharacterPanel from './CharacterPanel';
import { getActiveTitle, getTopTitles } from '../../data/achievements';
import { canLeaveCampaign, getLeaveBlockedMessage } from '../../services/campaignGuard';

function getGenderLabel(gender, t) {
  if (gender === 'female') return t('multiplayer.female');
  if (gender === 'male') return t('multiplayer.male');
  return t('gmModal.genders.unknown');
}

export default function CharacterSheet({ onClose }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const dispatch = useGameDispatch();
  const autoSave = useGameAutoSave();
  const soloCharacter = useGameCharacter();
  const soloCampaign = useGameCampaign();
  const soloScenes = useGameScenes();
  const characterVoiceMap = useGameSlice((s) => s.characterVoiceMap);
  const { settings } = useSettings();
  const mp = useMultiplayer();
  const { ensureMissingInventoryImages } = useAI();

  const isMultiplayer = mp.state.isMultiplayer && mp.state.phase === 'playing';
  const mpGameState = mp.state.gameState;

  const allCharacters = isMultiplayer ? (mpGameState?.characters || []) : [];
  const myCharacter = isMultiplayer
    ? allCharacters.find((c) => c.odId === mp.state.myOdId) || allCharacters[0]
    : soloCharacter;
  const campaign = isMultiplayer ? mpGameState?.campaign : soloCampaign;

  const [selectedIdx, setSelectedIdx] = useState(0);

  useEffect(() => {
    if (isMultiplayer) return;
    void ensureMissingInventoryImages(myCharacter?.inventory || [], { emitWarning: false });
  }, [isMultiplayer, myCharacter?.inventory, ensureMissingInventoryImages]);
  const [showAdvancement, setShowAdvancement] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [libraryChars, setLibraryChars] = useState([]);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [browsingCharacter, setBrowsingCharacter] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const modalRef = useModalA11y(onClose);

  const hasActiveGame = !!campaign && !!myCharacter;

  useEffect(() => {
    if (hasActiveGame || libraryLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const chars = await storage.getCharactersAsync();
        if (!cancelled) setLibraryChars(chars);
      } catch {
        if (!cancelled) setLibraryChars(storage.getCharacters());
      }
      if (!cancelled) setLibraryLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [hasActiveGame, libraryLoaded]);

  const handleDeleteCharacter = async (id) => {
    try {
      await storage.deleteCharacter(id);
      setLibraryChars((prev) => prev.filter((c) => (c.backendId || c.localId || c.id) !== id));
      if (browsingCharacter && (browsingCharacter.backendId || browsingCharacter.localId || browsingCharacter.id) === id) {
        setBrowsingCharacter(null);
      }
    } catch { /* silent */ }
    setDeleteConfirmId(null);
  };

  const handleSaveToLibrary = async () => {
    if (!displayCharacter) return;
    setSaveStatus('saving');
    try {
      await storage.saveCharacter({ ...displayCharacter });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 2500);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };
  const displayCharacter = isMultiplayer && allCharacters.length > 0
    ? allCharacters[selectedIdx] || allCharacters[0]
    : myCharacter;

  const attrPoints = displayCharacter?.attributePoints || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={t('nav.characterSheet')} onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        ref={modalRef}
        className="relative w-full max-w-7xl max-h-[90vh] bg-surface-container-highest/80 backdrop-blur-2xl border border-outline-variant/15 rounded-sm flex flex-col shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/15 shrink-0">
          <h2 className="font-headline text-xl text-tertiary flex items-center gap-2">
            <span className="material-symbols-outlined text-primary-dim">shield</span>
            {t('nav.characterSheet')}
          </h2>
          <div className="flex items-center gap-3">
            {displayCharacter && campaign && (
              <button
                onClick={handleSaveToLibrary}
                disabled={saveStatus === 'saving'}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-label uppercase tracking-wider border transition-all duration-300 ${
                  saveStatus === 'saved'
                    ? 'bg-primary/15 text-primary border-primary/30'
                    : saveStatus === 'error'
                      ? 'bg-error-container/20 text-error border-error/20'
                      : 'bg-surface-container-high/40 text-on-surface-variant border-outline-variant/15 hover:text-primary hover:border-primary/20'
                }`}
              >
                <span className="material-symbols-outlined text-sm">
                  {saveStatus === 'saved' ? 'check_circle' : saveStatus === 'error' ? 'error' : 'save'}
                </span>
                {saveStatus === 'saved'
                  ? t('character.savedToLibrary')
                  : saveStatus === 'error'
                    ? t('character.saveError')
                    : t('character.saveToLibrary')}
              </button>
            )}
            <button
              onClick={onClose}
              aria-label={t('common.close')}
              className="text-on-surface-variant hover:text-primary transition-colors"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>

        <div className="overflow-y-auto custom-scrollbar flex-1">
          {!displayCharacter || !campaign ? (
            browsingCharacter ? (
              <div className="px-4 md:px-10 py-8">
                <button
                  onClick={() => setBrowsingCharacter(null)}
                  className="flex items-center gap-1.5 mb-8 text-sm text-on-surface-variant hover:text-primary transition-colors"
                >
                  <span className="material-symbols-outlined text-base">arrow_back</span>
                  {t('character.backToList')}
                </button>

                <div className="mb-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary/10 text-primary text-[10px] font-label uppercase tracking-widest rounded-sm border border-primary/20">
                    <span className="material-symbols-outlined text-xs">visibility</span>
                    {t('character.readOnly')}
                  </span>
                </div>

                <div className="mb-12 relative animate-fade-in">
                  <h1 className="text-4xl md:text-5xl font-headline text-tertiary mb-2 drop-shadow-[0_2px_4px_rgba(197,154,255,0.1)]">
                    {browsingCharacter.name}
                  </h1>
                  <div className="flex items-center gap-4 text-on-surface-variant font-label text-sm uppercase tracking-[0.2em] flex-wrap">
                    <span>{t(`species.${browsingCharacter.species}`, { defaultValue: browsingCharacter.species })}</span>
                    <span className="w-1 h-1 bg-primary rounded-full" />
                  <span>{t('character.gender')}: {getGenderLabel(browsingCharacter.gender, t)}</span>
                  <span className="w-1 h-1 bg-primary rounded-full" />
                  <span>{t('character.age')}: {browsingCharacter.age ?? 23}</span>
                  <span className="w-1 h-1 bg-primary rounded-full" />
                    <span>{browsingCharacter.xp || 0} {t('common.xp')}</span>
                  </div>
                </div>

                <CharacterPanel
                  character={browsingCharacter}
                  settings={settings}
                  t={t}
                  characterVoiceMap={{}}
                  showAdvancement={false}
                  setShowAdvancement={() => {}}
                  dispatch={null}
                  isMultiplayer={false}
                />
              </div>
            ) : (
              <div className="px-4 md:px-10 py-8">
                <div className="text-center mb-10 animate-fade-in">
                  <span className="material-symbols-outlined text-5xl text-primary/30 mb-3">groups</span>
                  <h2 className="font-headline text-2xl text-tertiary mb-2">{t('character.library')}</h2>
                  <p className="text-on-surface-variant text-sm">{t('character.libraryDescription')}</p>
                </div>

                {!libraryLoaded ? (
                  <div className="flex justify-center py-12">
                    <span className="material-symbols-outlined text-3xl text-primary/40 animate-spin">progress_activity</span>
                  </div>
                ) : libraryChars.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 animate-fade-in">
                    <span className="material-symbols-outlined text-6xl text-outline/20 mb-4">person_off</span>
                    <p className="text-on-surface-variant text-sm mb-8">{t('character.noSavedCharacters')}</p>
                    <button
                      onClick={() => {
                        const guard = canLeaveCampaign(state);
                        if (!guard.allowed) { window.alert(getLeaveBlockedMessage(guard.reason)); return; }
                        onClose(); navigate('/');
                      }}
                      className="px-8 py-3 bg-surface-tint text-on-primary font-bold text-xs uppercase tracking-widest rounded-sm"
                    >
                      {t('character.goToLobby')}
                    </button>
                  </div>
                ) : (
                  <div className="animate-fade-in">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-8">
                      {libraryChars.map((ch) => {
                        const charId = ch.backendId || ch.localId || ch.id;
                        return (
                          <div
                            key={charId}
                            className="group relative p-4 rounded-sm border bg-surface-container-high/40 border-outline-variant/10 hover:border-primary/20 hover:bg-surface-container-high/60 transition-all cursor-pointer"
                            onClick={() => setBrowsingCharacter(ch)}
                          >
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 bg-surface-container-lowest rounded-sm flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-xl text-outline/40">person</span>
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-headline text-sm truncate text-tertiary">{ch.name}</p>
                                <p className="text-[10px] text-on-surface-variant truncate">
                                  {t(`species.${ch.species}`, { defaultValue: ch.species })}
                                </p>
                                <div className="flex items-center gap-2 mt-1 text-[9px] text-outline">
                                  <span>{ch.xp || 0} {t('characterPicker.xpLabel')}</span>
                                </div>
                              </div>
                            </div>
                            {deleteConfirmId === charId ? (
                              <div className="absolute inset-0 bg-surface-container-highest/95 backdrop-blur-sm rounded-sm flex flex-col items-center justify-center gap-3 p-4 z-10" onClick={(e) => e.stopPropagation()}>
                                <p className="text-xs text-on-surface-variant text-center">{t('character.deleteConfirm')}</p>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleDeleteCharacter(charId)}
                                    className="px-3 py-1.5 bg-error/20 text-error text-[10px] font-bold uppercase tracking-widest rounded-sm border border-error/30 hover:bg-error/30 transition-colors"
                                  >
                                    {t('character.deleteCharacter')}
                                  </button>
                                  <button
                                    onClick={() => setDeleteConfirmId(null)}
                                    className="px-3 py-1.5 bg-surface-container-high/60 text-on-surface-variant text-[10px] font-bold uppercase tracking-widest rounded-sm border border-outline-variant/20 hover:text-primary transition-colors"
                                  >
                                    {t('common.cancel')}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(charId); }}
                                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-outline hover:text-error transition-all"
                                title={t('character.deleteCharacter')}
                              >
                                <span className="material-symbols-outlined text-base">delete</span>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="text-center">
                      <button
                        onClick={() => {
                          const guard = canLeaveCampaign(state);
                          if (!guard.allowed) { window.alert(getLeaveBlockedMessage(guard.reason)); return; }
                          onClose(); navigate('/');
                        }}
                        className="inline-flex items-center gap-2 px-6 py-2.5 text-on-surface-variant text-xs font-label uppercase tracking-widest hover:text-primary transition-colors"
                      >
                        <span className="material-symbols-outlined text-sm">add</span>
                        {t('character.goToLobby')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          ) : (
            <div className="px-4 md:px-10 py-8">
              {isMultiplayer && allCharacters.length > 1 && (
                <div className="flex gap-2 mb-8 overflow-x-auto animate-fade-in">
                  {allCharacters.map((c, idx) => {
                    const isMe = c.odId === mp.state.myOdId;
                    const isSelected = idx === selectedIdx;
                    return (
                      <button
                        key={c.odId || c.name}
                        onClick={() => setSelectedIdx(idx)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-sm border text-sm font-label transition-all whitespace-nowrap ${
                          isSelected
                            ? 'bg-surface-tint text-on-primary border-primary shadow-[0_0_15px_rgba(197,154,255,0.3)]'
                            : 'bg-surface-container-high/40 text-on-surface-variant border-outline-variant/15 hover:bg-surface-container-high hover:text-tertiary'
                        }`}
                      >
                        <span className="material-symbols-outlined text-base">
                          {isMe ? 'shield' : 'person'}
                        </span>
                        {c.name}
                        {isMe && (
                          <span className="text-[10px] font-bold text-tertiary uppercase tracking-wider">
                            {t('multiplayer.you')}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="mb-12 relative animate-fade-in">
                <h1 className="text-4xl md:text-5xl font-headline text-tertiary mb-2 drop-shadow-[0_2px_4px_rgba(197,154,255,0.1)]">
                  {displayCharacter.name}
                </h1>
                {getActiveTitle(displayCharacter) && (
                  <div className="text-primary font-headline text-sm italic mb-2 tracking-wide">
                    {getActiveTitle(displayCharacter).label}
                  </div>
                )}
                <div className="flex items-center gap-4 text-on-surface-variant font-label text-sm uppercase tracking-[0.2em] flex-wrap">
                  <span>{t(`species.${displayCharacter.species}`, { defaultValue: displayCharacter.species })}</span>
                  <span className="w-1 h-1 bg-primary rounded-full" />
                  <span>{t('character.gender')}: {getGenderLabel(displayCharacter.gender, t)}</span>
                  <span className="w-1 h-1 bg-primary rounded-full" />
                  <span>{t('character.age')}: {displayCharacter.age ?? 23}</span>
                  <span className="w-1 h-1 bg-primary rounded-full" />
                  <span>{t('stats.level', { defaultValue: 'Poziom' })} {displayCharacter.characterLevel || 1}</span>
                </div>
                {dispatch && Array.isArray(displayCharacter.titles) && displayCharacter.titles.length > 1 && (
                  <div className="mt-3">
                    <label className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant block mb-1">
                      {t('character.activeTitle', { defaultValue: 'Aktywny tytuł' })}
                    </label>
                    <select
                      value={displayCharacter.activeTitleId || ''}
                      onChange={(e) => dispatch({ type: 'SET_ACTIVE_TITLE', payload: e.target.value || null })}
                      className="bg-surface-container text-on-surface text-xs px-2 py-1 rounded-sm border border-outline-variant/30 focus:border-primary focus:outline-none"
                    >
                      <option value="">{t('character.noTitle', { defaultValue: '— brak —' })}</option>
                      {getTopTitles(displayCharacter, 20).map((title) => (
                        <option key={title.id} value={title.id}>
                          {title.label} ({title.rarity})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {attrPoints > 0 && (
                  <button
                    onClick={() => setShowAdvancement(true)}
                    className="mt-3 flex items-center gap-2 px-4 py-2 bg-primary/15 text-primary text-xs font-bold uppercase tracking-widest rounded-sm border border-primary/20 hover:bg-primary/25 transition-all animate-fade-in"
                  >
                    <span className="material-symbols-outlined text-sm">upgrade</span>
                    +{attrPoints} {t('advancement.attributePoints', { defaultValue: 'pkt atrybutów' })} — {t('advancement.title')}
                  </button>
                )}
              </div>

              <CharacterPanel
                character={displayCharacter}
                settings={settings}
                t={t}
                characterVoiceMap={characterVoiceMap}
                maleVoices={settings.maleVoices}
                femaleVoices={settings.femaleVoices}
                showAdvancement={showAdvancement}
                setShowAdvancement={setShowAdvancement}
                dispatch={dispatch}
                isMultiplayer={isMultiplayer}
                campaign={campaign}
                scenes={isMultiplayer ? mpGameState?.scenes : soloScenes}
                onPortraitChange={(url) => {
                  dispatch({ type: 'UPDATE_CHARACTER', payload: { portraitUrl: url } });
                  setTimeout(() => autoSave(), 300);
                }}
                onVoiceChange={(charName, voiceId, gender) => {
                  const pool = [...(settings.maleVoices || []), ...(settings.femaleVoices || [])];
                  const voice = pool.find((v) => v.voiceId === voiceId);
                  dispatch({
                    type: 'MAP_CHARACTER_VOICE',
                    payload: { characterName: charName, voiceId, gender, voiceName: voice?.voiceName || null },
                  });
                  setTimeout(() => autoSave(), 300);
                }}
              />
            </div>
          )}
        </div>
      </div>

      {showAdvancement && (
        <AdvancementPanel onClose={() => { setShowAdvancement(false); autoSave(); }} />
      )}
    </div>
  );
}
