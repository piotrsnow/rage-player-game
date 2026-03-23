import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGame } from '../../contexts/GameContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useMultiplayer } from '../../contexts/MultiplayerContext';
import { useModalA11y } from '../../hooks/useModalA11y';
import { storage } from '../../services/storage';
import StatsGrid from './StatsGrid';
import Inventory from './Inventory';
import QuestLog from './QuestLog';
import CodexPanel from './CodexPanel';
import StatusBar from '../ui/StatusBar';
import AdvancementPanel from './AdvancementPanel';
import { translateSkill, translateTalent, translateCareer, translateTierName, translateStatus } from '../../utils/wfrpTranslate';

const NEEDS_META = [
  { key: 'hunger', icon: 'restaurant', color: 'tertiary' },
  { key: 'thirst', icon: 'water_drop', color: 'primary' },
  { key: 'bladder', icon: 'wc', color: 'tertiary' },
  { key: 'hygiene', icon: 'shower', color: 'primary' },
  { key: 'rest', icon: 'bedtime', color: 'tertiary' },
];

function CharacterPanel({ character, settings, t, characterVoiceMap, onVoiceChange, characterVoices, showAdvancement, setShowAdvancement, dispatch, isMultiplayer }) {
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-3 space-y-6 animate-fade-in">
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-tr from-primary-dim to-primary opacity-20 blur-xl group-hover:opacity-30 transition duration-500" />
            <div className="relative bg-surface-container-high border border-outline-variant/15 p-1 rounded-sm overflow-hidden">
              <div className="w-full aspect-[3/4] bg-gradient-to-br from-surface-container to-surface-container-lowest flex items-center justify-center">
                <span className="material-symbols-outlined text-8xl text-outline/20">person</span>
              </div>
              <div className="absolute bottom-0 left-0 w-full p-4 bg-gradient-to-t from-surface-dim to-transparent">
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-tertiary font-headline text-lg">{t('character.inspiration')}</p>
                    <div className="flex gap-1 mt-1">
                      <span className="w-4 h-4 bg-primary rounded-full shadow-[0_0_6px_rgba(197,154,255,0.6)]" />
                      <span className="w-4 h-4 bg-surface-container rounded-full border border-outline-variant/30" />
                    </div>
                  </div>
                  <p className="text-primary font-headline text-2xl">{t('common.tier')} {character.career?.tier}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-surface-container-low p-6 border border-outline-variant/10 rounded-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-tertiary font-headline flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">auto_fix_high</span>
                {t('character.vitals')}
              </h3>
              <button
                onClick={() => setShowAdvancement(true)}
                className="flex items-center gap-1 text-[10px] text-primary-dim hover:text-primary transition-colors"
              >
                <span className="material-symbols-outlined text-sm">upgrade</span>
                {t('advancement.title')}
              </button>
            </div>
            <div className="space-y-4">
              <StatusBar label={t('character.wounds')} current={character.wounds} max={character.maxWounds} color="error" />
              {character.status === 'dead' && (
                <div className="px-3 py-2 bg-error/15 border border-error/30 rounded-sm text-center">
                  <span className="text-error text-xs font-bold uppercase tracking-widest">{t('character.dead', 'DEAD')}</span>
                </div>
              )}
              {(character.criticalWoundCount || 0) > 0 && character.status !== 'dead' && (
                <div className="px-3 py-1 bg-error/10 border border-error/20 rounded-sm text-center">
                  <span className="text-error text-[10px] uppercase tracking-widest">
                    {t('character.criticalWoundCount', 'Critical Wounds')}: {character.criticalWoundCount}/3
                  </span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="text-center">
                  <span className="text-[10px] uppercase tracking-widest text-on-surface-variant">{t('character.fate')}</span>
                  <p className="text-tertiary font-headline text-lg">{character.fate}</p>
                </div>
                <div className="text-center">
                  <span className="text-[10px] uppercase tracking-widest text-on-surface-variant">{t('character.fortune')}</span>
                  <p className="text-primary font-headline text-lg">{character.fortune}</p>
                  {!isMultiplayer && dispatch && character.fortune > 0 && (
                    <button
                      onClick={() => dispatch({ type: 'SPEND_FORTUNE' })}
                      className="mt-1 text-[9px] text-primary/70 hover:text-primary uppercase tracking-widest transition-colors"
                    >
                      {t('character.spendFortune', 'Spend (reroll)')}
                    </button>
                  )}
                </div>
                <div className="text-center">
                  <span className="text-[10px] uppercase tracking-widest text-on-surface-variant">{t('character.resilience')}</span>
                  <p className="text-tertiary font-headline text-lg">{character.resilience}</p>
                </div>
                <div className="text-center">
                  <span className="text-[10px] uppercase tracking-widest text-on-surface-variant">{t('character.resolve')}</span>
                  <p className="text-primary font-headline text-lg">{character.resolve}</p>
                  {!isMultiplayer && dispatch && character.resolve > 0 && (
                    <button
                      onClick={() => dispatch({ type: 'SPEND_RESOLVE' })}
                      className="mt-1 text-[9px] text-primary/70 hover:text-primary uppercase tracking-widest transition-colors"
                    >
                      {t('character.spendResolve', 'Spend (remove condition)')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {settings.needsSystemEnabled && character.needs && (
            <div className="bg-surface-container-low p-6 border border-outline-variant/10 rounded-sm">
              <h3 className="text-tertiary font-headline mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">self_care</span>
                {t('needs.title')}
              </h3>
              <div className="space-y-4">
                {NEEDS_META.map(({ key, color }) => (
                  <StatusBar
                    key={key}
                    label={t(`needs.${key}`)}
                    current={Math.round(character.needs[key] ?? 100)}
                    max={100}
                    color={color}
                  />
                ))}
              </div>
            </div>
          )}

          {characterVoices && characterVoices.length > 0 && onVoiceChange && (
            <div className="bg-surface-container-low p-6 border border-outline-variant/10 rounded-sm">
              <h3 className="text-tertiary font-headline mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">record_voice_over</span>
                {t('character.voice')}
              </h3>
              <select
                value={characterVoiceMap?.[character.name]?.voiceId || ''}
                onChange={(e) => {
                  const voice = characterVoices.find((v) => v.voiceId === e.target.value);
                  onVoiceChange(character.name, e.target.value || null, voice?.gender || null);
                }}
                className="w-full bg-surface-container-high/60 border border-outline-variant/20 focus:border-primary/50 focus:ring-0 text-on-surface text-sm py-2 px-3 rounded-sm font-body"
              >
                <option value="">{t('character.noVoice')}</option>
                {characterVoices.map((v) => (
                  <option key={v.voiceId} value={v.voiceId}>{v.voiceName}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="lg:col-span-5 space-y-6 animate-fade-in">
          <StatsGrid characteristics={character.characteristics} advances={character.advances} />

          {character.skills && Object.keys(character.skills).length > 0 && (
            <div className="bg-surface-container-low p-6 border border-outline-variant/10 rounded-sm">
              <h3 className="text-tertiary font-headline mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">school</span>
                {t('character.skills')}
              </h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {Object.entries(character.skills).map(([name, adv]) => (
                  <div key={name} className="flex justify-between text-on-surface-variant">
                    <span>{translateSkill(name, t)}</span>
                    <span className="text-primary-dim font-bold">+{adv}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {character.talents?.length > 0 && (
            <div className="bg-surface-container-low p-6 border border-outline-variant/10 rounded-sm">
              <h3 className="text-tertiary font-headline mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">star</span>
                {t('character.talents')}
              </h3>
              <div className="flex flex-wrap gap-2">
                {character.talents.map((talent) => (
                  <span key={talent} className="px-3 py-1 bg-surface-container-high text-on-surface-variant text-xs rounded-sm border border-outline-variant/10">
                    {translateTalent(talent, t)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {character.criticalWounds?.length > 0 && (
            <div className="bg-surface-container-low p-6 border border-error/15 rounded-sm">
              <h3 className="text-error font-headline mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">healing</span>
                {t('character.criticalWounds', 'Critical Wounds')}
              </h3>
              <div className="space-y-2">
                {character.criticalWounds.map((cw, i) => (
                  <div key={i} className="p-2 bg-error-container/10 rounded-sm border border-error/10">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-sm font-bold text-error">{cw.name}</span>
                      <span className="text-[9px] text-error/70 uppercase tracking-wider">{cw.location} — {cw.severity}</span>
                    </div>
                    <p className="text-[11px] text-on-surface-variant">{cw.effect}</p>
                    <p className="text-[10px] text-outline mt-0.5">{cw.duration}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-4 space-y-6 animate-fade-in">
          <Inventory items={character.inventory} money={character.money} />

          <div className="bg-surface-container-low p-6 rounded-sm border border-outline-variant/10 relative">
            <div className="absolute top-0 right-0 p-4">
              <span className="material-symbols-outlined text-primary-dim text-sm opacity-50">
                psychology
              </span>
            </div>
            <h3 className="text-tertiary font-headline mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">auto_stories</span>
              {t('character.origins')}
            </h3>
            <div className="text-on-surface-variant font-body leading-relaxed text-sm">
              {character.backstory || (
                <p className="italic text-outline">
                  {t('character.originsEmpty')}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {showAdvancement && <AdvancementPanel onClose={() => setShowAdvancement(false)} />}
    </>
  );
}

export default function CharacterSheet({ onClose }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { state, dispatch } = useGame();
  const { settings } = useSettings();
  const mp = useMultiplayer();

  const isMultiplayer = mp.state.isMultiplayer && mp.state.phase === 'playing';
  const mpGameState = mp.state.gameState;

  const allCharacters = isMultiplayer ? (mpGameState?.characters || []) : [];
  const myCharacter = isMultiplayer
    ? allCharacters.find((c) => c.odId === mp.state.myOdId) || allCharacters[0]
    : state.character;
  const campaign = isMultiplayer ? mpGameState?.campaign : state.campaign;
  const quests = isMultiplayer ? (mpGameState?.quests || { active: [], completed: [] }) : state.quests;
  const world = isMultiplayer ? (mpGameState?.world || {}) : (state.world || {});

  const [selectedIdx, setSelectedIdx] = useState(0);
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

  const availableXp = (displayCharacter?.xp || 0) - (displayCharacter?.xpSpent || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={t('nav.armory')} onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        ref={modalRef}
        className="relative w-full max-w-7xl max-h-[90vh] bg-surface-container-highest/80 backdrop-blur-2xl border border-outline-variant/15 rounded-sm flex flex-col shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/15 shrink-0">
          <h2 className="font-headline text-xl text-tertiary flex items-center gap-2">
            <span className="material-symbols-outlined text-primary-dim">shield</span>
            {t('nav.armory')}
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
                    <span>{translateCareer((browsingCharacter.career || browsingCharacter.careerData)?.name, t)} ({translateTierName((browsingCharacter.career || browsingCharacter.careerData)?.tierName, t)})</span>
                    <span className="w-1 h-1 bg-primary rounded-full" />
                    <span>{browsingCharacter.xp || 0} {t('common.xp')}</span>
                  </div>
                </div>

                <CharacterPanel
                  character={{ ...browsingCharacter, career: browsingCharacter.career || browsingCharacter.careerData }}
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
                      onClick={() => { onClose(); navigate('/'); }}
                      className="px-8 py-3 bg-surface-tint text-on-primary font-bold text-xs uppercase tracking-widest rounded-sm"
                    >
                      {t('character.goToLobby')}
                    </button>
                  </div>
                ) : (
                  <div className="animate-fade-in">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-8">
                      {libraryChars.map((ch) => {
                        const career = ch.careerData || ch.career || {};
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
                                  {t(`species.${ch.species}`, { defaultValue: ch.species })} · {career.name ? translateCareer(career.name, t) : '—'}
                                </p>
                                <div className="flex items-center gap-2 mt-1 text-[9px] text-outline">
                                  <span>{t('characterPicker.tierLabel')} {career.tier || 1}</span>
                                  <span>·</span>
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
                        onClick={() => { onClose(); navigate('/'); }}
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
                <div className="flex items-center gap-4 text-on-surface-variant font-label text-sm uppercase tracking-[0.2em] flex-wrap">
                  <span>{t(`species.${displayCharacter.species}`, { defaultValue: displayCharacter.species })}</span>
                  <span className="w-1 h-1 bg-primary rounded-full" />
                  <span>{translateCareer(displayCharacter.career?.name, t)} ({translateTierName(displayCharacter.career?.tierName, t)})</span>
                  <span className="w-1 h-1 bg-primary rounded-full" />
                  <span>{translateStatus(displayCharacter.career?.status, t)}</span>
                  <span className="w-1 h-1 bg-primary rounded-full" />
                  <span>{displayCharacter.xp} {t('common.xp')}</span>
                </div>
                {availableXp > 0 && (
                  <button
                    onClick={() => setShowAdvancement(true)}
                    className="mt-3 flex items-center gap-2 px-4 py-2 bg-primary/15 text-primary text-xs font-bold uppercase tracking-widest rounded-sm border border-primary/20 hover:bg-primary/25 transition-all animate-fade-in"
                  >
                    <span className="material-symbols-outlined text-sm">upgrade</span>
                    {availableXp} {t('common.xp')} — {t('advancement.title')}
                  </button>
                )}
              </div>

              <CharacterPanel
                character={displayCharacter}
                settings={settings}
                t={t}
                characterVoiceMap={state.characterVoiceMap}
                characterVoices={settings.characterVoices}
                showAdvancement={showAdvancement}
                setShowAdvancement={setShowAdvancement}
                dispatch={dispatch}
                isMultiplayer={isMultiplayer}
                onVoiceChange={(charName, voiceId, gender) => {
                  dispatch({
                    type: 'MAP_CHARACTER_VOICE',
                    payload: { characterName: charName, voiceId, gender },
                  });
                }}
              />

              {quests && (quests.active?.length > 0 || quests.completed?.length > 0) && (
                <div className="mt-8 animate-fade-in">
                  <QuestLog active={quests.active} completed={quests.completed} />
                </div>
              )}

              {world.codex && Object.keys(world.codex).length > 0 && (
                <div className="mt-8 animate-fade-in">
                  <CodexPanel codex={world.codex} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
