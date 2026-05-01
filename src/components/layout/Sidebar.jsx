import { useMemo, useState, useCallback, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  useGameCampaign,
  useGameCharacter,
  useGameParty,
  useGameSlice,
  useGameIsGeneratingScene,
  useGameDispatch,
} from '../../stores/gameSelectors';
import { getGameState } from '../../stores/gameStore';
import { useMultiplayer } from '../../contexts/MultiplayerContext';
import { useModals } from '../../contexts/ModalContext';
import { useAI } from '../../hooks/useAI';
import { apiClient } from '../../services/apiClient';
import { storage } from '../../services/storage';
import StatusBar from '../ui/StatusBar';
import NeedsPanel from '../gameplay/NeedsPanel';
import SidebarPartyList from './SidebarPartyList';
import { translateAttribute } from '../../utils/rpgTranslate';

export default function Sidebar() {
  const location = useLocation();
  const { t } = useTranslation();
  const campaign = useGameCampaign();
  const soloCharacter = useGameCharacter();
  const soloParty = useGameParty();
  const soloActiveId = useGameSlice((s) => s.activeCharacterId);
  const timeStateSolo = useGameSlice((s) => s.world?.timeState);
  const isGeneratingScene = useGameIsGeneratingScene();
  const dispatch = useGameDispatch();
  const mp = useMultiplayer();
  const { generateScene } = useAI();
  const { openCharacterSheet, openTasksInfo, openSettings, openKeys } = useModals();
  const [activeNeedKey, setActiveNeedKey] = useState(null);
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved'
  const saveTimeoutRef = useRef(null);

  const isMultiplayer = mp.state.isMultiplayer && mp.state.phase === 'playing';
  const hasActiveGame = !!campaign || isMultiplayer;
  const character = isMultiplayer
    ? (mp.state.gameState?.characters?.find((c) => c.odId === mp.state.myOdId) || mp.state.gameState?.characters?.[0])
    : soloCharacter;
  const party = isMultiplayer
    ? (mp.state.gameState?.party || [])
    : (soloParty || []);
  const activeId = isMultiplayer
    ? mp.state.gameState?.activeCharacterId
    : soloActiveId;
  const mana = character?.mana || { current: 0, max: 0 };
  const timeState = isMultiplayer
    ? mp.state.gameState?.world?.timeState
    : timeStateSolo;
  const canTriggerNeedAction = useMemo(() => (
    Boolean(campaign)
    && location.pathname.startsWith('/play')
    && !isMultiplayer
    && !isGeneratingScene
    && (campaign?.status || 'active') === 'active'
    && character?.status !== 'dead'
  ), [
    campaign,
    isGeneratingScene,
    location.pathname,
    isMultiplayer,
    character?.status,
  ]);

  const handleInstantNeedAction = async (needKey) => {
    if (!canTriggerNeedAction || !character || activeNeedKey) return;

    const currentNeed = Number(character.needs?.[needKey] ?? 0);
    const safeCurrentNeed = Number.isFinite(currentNeed) ? Math.max(0, Math.min(100, currentNeed)) : 0;

    const needLabel = t(`needs.${needKey}`);
    const actionText = `[INSTANT_NEED_OVERRIDE]
Potrzeba "${needLabel}" musi zostać spełniona natychmiast, nawet kosztem absurdalnych, ryzykownych i skrajnych działań.
Licznik tej potrzeby jest już wyzerowany do 0 i to jest fakt kanoniczny.
Opisz bardzo konkretne konsekwencje tej decyzji dla fabuły: relacji, zasobów, reputacji, położenia postaci i kolejnych scen.
`;

    setActiveNeedKey(needKey);
    dispatch({
      type: 'APPLY_STATE_CHANGES',
      payload: {
        needsChanges: { [needKey]: -safeCurrentNeed },
        journalEntries: [
          `Instant need override used: ${needLabel} set to 0 through extreme immediate actions.`,
        ],
      },
    });

    try {
      await generateScene(actionText, false, true, false);
    } finally {
      setActiveNeedKey(null);
    }
  };

  const handleSaveCampaign = useCallback(async () => {
    const snapshot = getGameState();
    if (saveStatus === 'saving' || !snapshot.campaign) return;
    setSaveStatus('saving');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    try {
      await storage.saveCampaign(snapshot);
      setSaveStatus('saved');
      saveTimeoutRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      console.error('[Sidebar] Manual save error:', err);
      setSaveStatus('idle');
    }
  }, [saveStatus]);

  const modalActions = {
    '/character': openCharacterSheet,
    '/tasks-info': openTasksInfo,
    '/settings': openSettings,
    '/keys': openKeys,
  };

  const navItems = [
    hasActiveGame && { path: '/play', icon: 'book_5', label: t('nav.grimoire') },
    { path: '/character', icon: 'shield', label: t('nav.characterSheet') },
    hasActiveGame && { path: '/tasks-info', icon: 'assignment', label: t('nav.tasksInfo') },
    { path: '/keys', icon: 'vpn_key', label: t('nav.keys') },
    { path: '/gallery', icon: 'photo_library', label: t('nav.gallery') },
    { path: '/settings', icon: 'settings', label: t('nav.settings') },
    { path: '/', icon: 'home', label: t('nav.lobby') },
  ].filter(Boolean);

  return (
    <aside className="hidden lg:flex flex-col h-screen w-64 fixed left-0 top-0 z-40 bg-surface-container-low shadow-[20px_0_40px_rgba(0,0,0,0.5)] pt-20">
      {character && (
        <div className="px-6 mb-8">
          {character.portraitUrl && (
            <div className="mt-[60px] mb-4 aspect-[3/4] overflow-hidden rounded-sm border border-outline-variant/20 bg-surface-container-high shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
              <img
                src={apiClient.resolveMediaUrl(character.portraitUrl)}
                alt={character.name}
                className="h-full w-full object-cover"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            </div>
          )}
          <div className="flex items-center gap-3 mb-4 p-3 -mx-3 rounded-sm bg-gradient-to-r from-surface-container-high/40 to-transparent hover:from-surface-container-high/60 transition-all duration-300 group">
            <div className="w-10 h-10 bg-surface-container-high rounded-sm flex items-center justify-center border border-tertiary/20 group-hover:border-tertiary/40 group-hover:shadow-[0_0_12px_rgba(255,239,213,0.1)] transition-all duration-300">
              <span className="material-symbols-outlined text-tertiary text-xl">shield</span>
            </div>
            <div className="min-w-0">
              <div className="font-headline text-tertiary text-sm font-bold truncate">{character.name}</div>
              <div className="text-[10px] text-on-surface-variant uppercase tracking-widest truncate">
                {t(`species.${character.species}`, { defaultValue: character.species })}
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <StatusBar label={t('common.wounds')} current={character.wounds} max={character.maxWounds} color="error" />
            {mana.max > 0 && (
              <StatusBar label="Mana" current={mana.current} max={mana.max} color="blue" />
            )}
          </div>
          <SidebarPartyList party={party} activeCharacterId={activeId} />
          <div className="mt-4">
            <NeedsPanel
              needs={character.needs || { hunger: 100, thirst: 100, bladder: 100, hygiene: 100, rest: 100 }}
              timeState={timeState}
              onNeedAction={canTriggerNeedAction ? handleInstantNeedAction : null}
              actionLocked={Boolean(activeNeedKey)}
              activeNeedKey={activeNeedKey}
            />
          </div>
        </div>
      )}

      {character && <div className="mx-6 mb-4 h-px bg-gradient-to-r from-transparent via-outline-variant/20 to-transparent" />}

      <nav className="flex-1 flex flex-col gap-0.5 px-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const modalAction = modalActions[item.path];
          const className = `relative flex items-center gap-4 px-4 py-3 rounded-sm transition-all duration-300 ease-in-out ${
            isActive && !modalAction
              ? 'text-primary bg-surface-container-high/80'
              : 'text-on-surface-variant hover:bg-surface-container-high/40 hover:text-tertiary'
          }`;
          if (modalAction) {
            return (
              <button key={item.path} onClick={modalAction} className={className}>
                <span className="material-symbols-outlined">{item.icon}</span>
                <span className="font-headline text-sm">{item.label}</span>
              </button>
            );
          }
          return (
            <Link key={item.path} to={item.path} className={className}>
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-primary rounded-full shadow-[0_0_8px_rgba(197,154,255,0.6)]" />
              )}
              <span className="material-symbols-outlined">{item.icon}</span>
              <span className="font-headline text-sm">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {hasActiveGame && !isMultiplayer && (
        <div className="px-4 pb-4 pt-2">
          <button
            onClick={handleSaveCampaign}
            disabled={saveStatus === 'saving'}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-sm text-xs font-label uppercase tracking-widest transition-all duration-300 border ${
              saveStatus === 'saved'
                ? 'bg-primary/20 border-primary/40 text-primary shadow-[0_0_12px_rgba(197,154,255,0.15)]'
                : 'bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:text-primary hover:border-primary/30 hover:bg-primary/10'
            }`}
          >
            {saveStatus === 'saving' ? (
              <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
            ) : saveStatus === 'saved' ? (
              <span className="material-symbols-outlined text-sm">check_circle</span>
            ) : (
              <span className="material-symbols-outlined text-sm">save</span>
            )}
            {saveStatus === 'saving'
              ? t('nav.saving')
              : saveStatus === 'saved'
                ? t('nav.campaignSaved')
                : t('nav.saveCampaign')}
          </button>
        </div>
      )}
    </aside>
  );
}
