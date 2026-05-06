import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { storage } from '../../services/storage';
import { apiClient } from '../../services/apiClient';
import { getPersistedRejoinInfo, clearPersistedRejoinInfo } from '../../services/websocket';
import { useGame } from '../../contexts/GameContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useModals } from '../../contexts/ModalContext';
import { useMultiplayer } from '../../contexts/MultiplayerContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import Button from '../ui/Button';
import GlassCard from '../ui/GlassCard';
import CampaignCard from './CampaignCard';
import AuthPanel from './AuthPanel';
import IntroOverlay from './IntroOverlay';

function FloatingRune({ delay, className }) {
  return (
    <span
      className={`absolute text-primary/[0.07] font-headline select-none pointer-events-none ${className}`}
      style={{ animationDelay: `${delay}s` }}
    >
      &#x2726;
    </span>
  );
}

function CharacterSummary({ char, label, icon, accent, disabled }) {
  if (!char) return null;
  const level = char.characterLevel || 1;
  return (
    <div className={`flex-1 min-w-0 p-4 rounded-sm border transition-colors ${disabled ? 'opacity-40 border-outline-variant/20 bg-surface-container-low/30' : `border-${accent}/20 bg-surface-container-low`}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`material-symbols-outlined text-sm ${disabled ? 'text-outline' : `text-${accent}`}`}>{icon}</span>
        <span className={`font-label text-xs uppercase tracking-wider ${disabled ? 'text-outline' : `text-${accent}`}`}>{label}</span>
      </div>
      <p className="text-on-surface font-headline text-sm truncate">{char.name || '—'}</p>
      <p className="text-on-surface-variant text-xs mt-1">{char.species || '—'}</p>
      <p className="text-on-surface-variant text-[10px] mt-1">Poziom {level}</p>
    </div>
  );
}

function CharacterChoiceModal({ campaign, libraryCharacter, onChooseCampaign, onChooseLibrary, onCancel, t, locale }) {
  const campaignChar = campaign.character;
  const hasLibrary = libraryCharacter != null;

  const libraryHint = useMemo(() => {
    if (!hasLibrary) return null;
    const level = libraryCharacter.characterLevel || 1;
    const ts = libraryCharacter.updatedAt
      ? (typeof libraryCharacter.updatedAt === 'number'
        ? libraryCharacter.updatedAt
        : new Date(libraryCharacter.updatedAt).getTime())
      : null;
    const date = ts
      ? new Date(ts).toLocaleDateString(locale, { month: 'short', day: 'numeric' })
      : null;
    if (date) {
      return t('lobby.libraryNewerHint', 'Newer library version available (Level {{level}}, updated {{date}})', { level, date });
    }
    return t('lobby.libraryNewerHintNoDate', 'Newer library version available (Level {{level}})', { level });
  }, [hasLibrary, libraryCharacter, locale, t]);

  return (
    <div data-testid="character-choice-modal" className="relative bg-surface-container border border-outline-variant/20 rounded-sm shadow-2xl w-full max-w-md mx-4 animate-slide-up">
      {hasLibrary && (
        <button
          type="button"
          data-testid="character-choice-switch-library"
          onClick={onChooseLibrary}
          title={t('lobby.useLibraryChar', 'Use Library Version')}
          className="absolute top-3 right-3 flex items-center gap-1.5 px-2 py-1 rounded-sm text-[10px] uppercase tracking-wider text-outline hover:text-primary hover:bg-primary/5 transition-colors z-10"
        >
          <span className="material-symbols-outlined text-xs">swap_horiz</span>
          {t('lobby.switchToLibrary', 'Use current')}
        </button>
      )}

      <div className="p-6 pr-28 border-b border-outline-variant/10">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary">person</span>
          <div>
            <h3 className="font-headline text-on-surface text-lg">{t('lobby.characterChoice', 'Character Version')}</h3>
            <p className="text-on-surface-variant text-xs mt-0.5">{t('lobby.characterChoiceDesc', 'Choose which character version to use')}</p>
          </div>
        </div>
        {campaign.campaign?.name && (
          <p className="text-on-surface-variant text-xs mt-3 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-xs text-outline">auto_stories</span>
            {campaign.campaign.name}
          </p>
        )}
      </div>

      <div className="p-6">
        <CharacterSummary
          char={campaignChar}
          label={t('lobby.campaignCharacter', 'Campaign Character')}
          icon="save"
          accent="tertiary"
        />
        {libraryHint && (
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-outline">
            <span className="material-symbols-outlined text-xs text-outline">schedule</span>
            {libraryHint}
          </p>
        )}
      </div>

      <div className="px-6 pb-6">
        <Button className="w-full" onClick={onChooseCampaign}>
          {t('lobby.useCampaignChar', 'Use Campaign Version')}
        </Button>
      </div>

      <div className="px-6 pb-4 flex justify-center">
        <button onClick={onCancel} className="text-xs text-outline hover:text-on-surface-variant transition-colors">
          {t('common.cancel', 'Cancel')}
        </button>
      </div>
    </div>
  );
}

export default function LobbyPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const { dispatch } = useGame();
  const { openSettings, openProfile } = useModals();
  useDocumentTitle(t('common.tagline'));
  const { backendUser, hasApiKey } = useSettings();
  const mp = useMultiplayer();
  const [campaigns, setCampaigns] = useState([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [rejoinInfo, setRejoinInfo] = useState(null);
  const [rejoining, setRejoining] = useState(false);
  const [pendingCampaign, setPendingCampaign] = useState(null);
  const [libraryCharacter, setLibraryCharacter] = useState(undefined);
  const [campaignNotFound, setCampaignNotFound] = useState(false);
  const [loadingCampaignId, setLoadingCampaignId] = useState(null);

  useEffect(() => {
    if (location.state?.campaignNotFound) {
      setCampaignNotFound(true);
      navigate('/', { replace: true, state: {} });
    }
  }, [location.state, navigate]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('credits') === 'success' || params.get('credits') === 'cancel') {
      openProfile();
    }
  }, [openProfile]);

  useEffect(() => {
    let cancelled = false;
    setSyncing(true);
    storage.getCampaigns()
      .then((list) => {
        if (cancelled) return;
        setCampaigns(list);
      })
      .catch(() => { if (!cancelled) setCampaigns([]); })
      .finally(() => {
        if (!cancelled) setSyncing(false);
      });

    if (backendUser && apiClient.isConnected()) {
      const persisted = getPersistedRejoinInfo();
      if (persisted?.roomCode) {
        apiClient.get('/multiplayer/my-sessions')
          .then((res) => {
            if (cancelled) return;
            const sessions = res?.sessions || [];
            const match = sessions.find((s) => s.roomCode === persisted.roomCode);
            if (match) {
              setRejoinInfo({ ...persisted, ...match });
            } else {
              clearPersistedRejoinInfo();
            }
          })
          .catch(() => {
            if (!cancelled) setRejoinInfo(persisted);
          });
      }
    }

    return () => {
      cancelled = true;
    };
  }, [backendUser]);

  const loadCampaignDirectly = (payload) => {
    dispatch({ type: 'LOAD_CAMPAIGN', payload });
    storage.saveLocalSnapshot(payload);
    setPendingCampaign(null);
    setLibraryCharacter(undefined);
    navigate(`/play/${payload.campaign.backendId || payload.campaign.id}`);
  };

  const openCharacterChoice = async (campaignData) => {
    if (!campaignData.character) {
      loadCampaignDirectly(campaignData);
      return;
    }
    try {
      const chars = await storage.getCharactersAsync();
      const match = storage.findMatchingLibraryCharacter(campaignData.character, chars);
      if (!match || !storage.libraryCharacterDiffers(campaignData.character, match)) {
        loadCampaignDirectly(campaignData);
        return;
      }
      setLibraryCharacter(match);
      setPendingCampaign(campaignData);
    } catch {
      loadCampaignDirectly(campaignData);
    }
  };

  const confirmLoad = (useLibrary) => {
    if (!pendingCampaign) return;
    let payload = pendingCampaign;
    if (useLibrary && libraryCharacter) {
      payload = {
        ...pendingCampaign,
        character: {
          ...libraryCharacter,
          localId: pendingCampaign.character?.localId || libraryCharacter.localId,
          backendId: libraryCharacter.backendId || libraryCharacter.id || pendingCampaign.character?.backendId,
        },
      };
    }
    loadCampaignDirectly(payload);
  };

  const handleLoad = async (campaign) => {
    if (loadingCampaignId) return;
    setLoadingCampaignId(campaign.id);
    try {
      const campaignPromise = campaign.source === 'local'
        ? Promise.resolve(storage.loadLocalSnapshot())
        : storage.loadCampaign(campaign.id);
      const [data, chars] = await Promise.all([
        campaignPromise,
        storage.getCharactersAsync().catch(() => []),
      ]);
      if (!data) return;
      if (!data.character) {
        loadCampaignDirectly(data);
        return;
      }
      const match = storage.findMatchingLibraryCharacter(data.character, chars);
      if (!match || !storage.libraryCharacterDiffers(data.character, match)) {
        loadCampaignDirectly(data);
        return;
      }
      setLibraryCharacter(match);
      setPendingCampaign(data);
    } catch (err) {
      console.warn('[LobbyPage] Failed to load campaign:', err.message);
    } finally {
      setLoadingCampaignId(null);
    }
  };

  const handleDelete = async (id) => {
    const target = campaigns.find((c) => c.id === id);
    if (target?.source === 'local') {
      storage.clearLocalSnapshot();
    } else {
      await storage.deleteCampaign(id);
    }
    try {
      setCampaigns(await storage.getCampaigns());
    } catch { setCampaigns([]); }
    setShowDeleteConfirm(null);
  };

  const handleContinue = async () => {
    const activeId = storage.getActiveCampaignId();
    if (activeId && campaigns.length > 0) {
      const match = campaigns.find((c) => c.id === activeId);
      if (match) {
        setSyncing(true);
        try {
          const data = await storage.loadCampaign(match.id);
          if (data) { openCharacterChoice(data); return; }
        } catch { /* ignore */ } finally { setSyncing(false); }
      }
    }
    if (campaigns.length > 0) {
      setSyncing(true);
      try {
        const data = await storage.loadCampaign(campaigns[0].id);
        if (data) openCharacterChoice(data);
      } catch { /* ignore */ } finally { setSyncing(false); }
    }
  };

  useEffect(() => {
    if (rejoining && mp.state.isMultiplayer && mp.state.roomCode) {
      setRejoining(false);
      const target = mp.state.phase === 'playing' ? '/play' : '/create';
      navigate(target);
    }
  }, [rejoining, mp.state.isMultiplayer, mp.state.roomCode, mp.state.phase, navigate]);

  useEffect(() => {
    if (rejoining && mp.state.error) {
      setRejoining(false);
      clearPersistedRejoinInfo();
      setRejoinInfo(null);
    }
  }, [rejoining, mp.state.error]);

  const handleRejoin = async () => {
    setRejoining(true);
    try {
      const success = await mp.rejoinRoom();
      if (!success) {
        clearPersistedRejoinInfo();
        setRejoinInfo(null);
        setRejoining(false);
      }
    } catch {
      clearPersistedRejoinInfo();
      setRejoinInfo(null);
      setRejoining(false);
    }
  };

  const handleDismissRejoin = () => {
    clearPersistedRejoinInfo();
    setRejoinInfo(null);
  };

  const [showAllCampaigns, setShowAllCampaigns] = useState(false);

  const hasServerAi = hasApiKey('openai') || hasApiKey('anthropic');
  const isLoggedIn = !!backendUser;
  const hasCampaigns = campaigns.length > 0;

  const RECENT_COUNT = 3;
  const recentCampaigns = campaigns.slice(0, RECENT_COUNT);
  const hasMoreCampaigns = campaigns.length > RECENT_COUNT;

  return (
    <>
    <IntroOverlay />
    <div className="flex flex-col items-center min-h-[calc(100vh-4rem)] px-6 py-6 relative z-10 overflow-hidden">
      {campaignNotFound && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-lg bg-error/15 border border-error/30 text-error text-sm font-label shadow-lg backdrop-blur-sm animate-slide-up">
          <span className="material-symbols-outlined text-base">error</span>
          {t('lobby.campaignNotFound')}
          <button onClick={() => setCampaignNotFound(false)} className="ml-2 hover:text-on-surface transition-colors">
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
      )}

      {/* Background radial glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/[0.04] rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[400px] bg-tertiary/[0.03] rounded-full blur-[100px] pointer-events-none" />

      {/* Floating decorative runes */}
      <FloatingRune delay={0} className="text-6xl top-[15%] left-[10%] animate-float-slow" />
      <FloatingRune delay={1.5} className="text-4xl top-[20%] right-[12%] animate-float" />
      <FloatingRune delay={0.8} className="text-5xl bottom-[25%] left-[8%] animate-float-slow" />
      <FloatingRune delay={2} className="text-3xl bottom-[30%] right-[15%] animate-float" />

      {/* Multiplayer Rejoin Banner — full width above columns */}
      {rejoinInfo && (
        <div className="mb-4 max-w-5xl w-full animate-slide-up relative z-10">
          <GlassCard elevated className="p-4 border-l-2 border-primary" data-testid="rejoin-banner">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-primary">wifi_off</span>
              <div className="flex-1 min-w-0">
                <p className="font-headline text-primary text-sm">
                  {t('lobby.activeMultiplayerSession', 'Active Multiplayer Session')}
                  {rejoinInfo.campaignName && (
                    <span className="text-on-surface/70 font-body text-xs ml-2">
                      {rejoinInfo.campaignName} &middot; {rejoinInfo.roomCode}
                    </span>
                  )}
                  {!rejoinInfo.campaignName && (
                    <span className="text-on-surface/70 font-body text-xs ml-2">
                      {rejoinInfo.roomCode}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" onClick={handleRejoin} disabled={rejoining}>
                  {rejoining
                    ? t('lobby.rejoining', 'Rejoining...')
                    : t('lobby.rejoinSession', 'Rejoin Game')}
                </Button>
                <Button size="sm" variant="ghost" onClick={handleDismissRejoin} disabled={rejoining}>
                  {t('lobby.dismissSession', 'Dismiss')}
                </Button>
              </div>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Main content — fits viewport */}
      <div className="w-full max-w-5xl flex flex-col items-center relative z-10 animate-slide-up my-auto gap-6">

        {/* Hero logo — big, centered */}
        <img src={t('common.logoPath', '/nikczemnu_logo.png')} alt={t('lobby.title')} className="h-48 md:h-64 lg:h-72 w-auto drop-shadow-2xl" />

        <div className="flex items-center gap-3">
          <div className="h-px w-12 bg-gradient-to-r from-transparent to-primary/40" />
          <span className="material-symbols-outlined text-primary/40 text-sm">diamond</span>
          <div className="h-px w-12 bg-gradient-to-l from-transparent to-primary/40" />
        </div>

        <p className="text-on-surface-variant font-body text-base max-w-md leading-relaxed text-center">
          {t('lobby.subtitle')}
        </p>

        {/* Not logged in — centered auth panel */}
        {!isLoggedIn && (
          <div className="w-full max-w-sm">
            <AuthPanel />
          </div>
        )}

        {/* Logged in — two-column: left = auth + buttons, right = campaigns */}
        {isLoggedIn && (
          <div className="w-full grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-6 items-stretch">

            {/* Left — auth, buttons, warnings */}
            <div className="flex flex-col items-center lg:items-start gap-5">
              <div className="w-full max-w-sm">
                <AuthPanel />
              </div>

              <div className="hidden lg:block flex-1" />

              {!hasServerAi && (
                <div
                  onClick={openSettings}
                  data-testid="api-key-warning"
                  className="w-full max-w-sm glass-panel-elevated p-4 rounded-sm border-l-2 border-tertiary cursor-pointer hover:border-tertiary/80 transition-all hover:translate-y-[-1px] hover:shadow-[0_12px_40px_rgba(0,0,0,0.4)]"
                >
                  <div className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-tertiary mt-0.5">key</span>
                    <div>
                      <p className="font-headline text-tertiary text-sm mb-1">{t('lobby.apiKeyRequired', 'Server AI configuration required')}</p>
                      <p className="text-on-surface-variant text-xs">
                        {t('lobby.apiKeyDescription', 'Connect backend and configure provider API keys in backend environment variables.')}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {!hasCampaigns && hasServerAi && (
                <div className="text-center lg:text-left text-on-surface-variant">
                  <span className="material-symbols-outlined text-4xl text-outline/20 mb-2 block animate-float-slow">
                    auto_stories
                  </span>
                  <p className="text-sm mb-1">{t('lobby.noCampaigns')}</p>
                  <p className="text-xs text-outline">{t('lobby.noCampaignsHint', 'Create your first adventure above')}</p>
                </div>
              )}

              <div className="flex flex-row gap-4 items-center">
                <Button size="lg" onClick={() => navigate('/create')}>
                  {t('lobby.newCampaign')}
                </Button>
                {hasCampaigns && (
                  <Button size="lg" variant="secondary" onClick={handleContinue}>
                    {t('lobby.continueCampaign')}
                  </Button>
                )}
              </div>
            </div>

          {/* Right — recent campaigns */}
          {isLoggedIn && hasCampaigns && (
            <div className="animate-slide-up" style={{ animationDelay: '0.1s' }}>
              <GlassCard elevated className="p-5" data-testid="saved-campaigns">
                <h3 className="font-headline text-tertiary text-base mb-3 flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary-dim text-lg">save</span>
                  {t('lobby.recentCampaigns', 'Ostatnie kampanie')}
                  {syncing && (
                    <span className="text-xs text-outline font-label flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm animate-spin">sync</span>
                      {t('lobby.syncing', 'Syncing...')}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-outline font-label">{campaigns.length}</span>
                </h3>
                <div className="space-y-1">
                  {recentCampaigns.map((c, i) => (
                    <CampaignCard
                      key={c.id || i}
                      campaign={c}
                      loading={loadingCampaignId === c.id}
                      disabled={!!loadingCampaignId}
                      onLoad={() => handleLoad(c)}
                      onDelete={() =>
                        showDeleteConfirm === c.id
                          ? handleDelete(c.id)
                          : setShowDeleteConfirm(c.id)
                      }
                    />
                  ))}
                </div>
                {hasMoreCampaigns && (
                  <button
                    type="button"
                    onClick={() => setShowAllCampaigns(true)}
                    className="mt-3 w-full flex items-center justify-center gap-2 py-2 text-sm text-primary hover:text-tertiary font-label uppercase tracking-wider transition-colors hover:bg-primary/5 rounded-sm"
                  >
                    <span className="material-symbols-outlined text-base">expand_more</span>
                    {t('lobby.showAllCampaigns', 'Wszystkie kampanie')} ({campaigns.length})
                  </button>
                )}
              </GlassCard>
            </div>
          )}
        </div>
        )}
      </div>

      {/* All Campaigns Modal */}
      {showAllCampaigns && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowAllCampaigns(false)}>
          <div
            className="relative bg-surface-container border border-outline-variant/20 rounded-sm shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 pb-4 border-b border-outline-variant/10">
              <h3 className="font-headline text-tertiary text-lg flex items-center gap-2">
                <span className="material-symbols-outlined text-primary-dim">save</span>
                {t('lobby.savedCampaigns')}
                <span className="text-xs text-outline font-label ml-1">{campaigns.length}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAllCampaigns(false)}
                className="p-1 rounded-sm text-outline hover:text-on-surface hover:bg-surface-container-high transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="overflow-y-auto p-6 pt-4 space-y-1">
              {campaigns.map((c, i) => (
                <CampaignCard
                  key={c.id || i}
                  campaign={c}
                  loading={loadingCampaignId === c.id}
                  disabled={!!loadingCampaignId}
                  onLoad={() => { handleLoad(c); setShowAllCampaigns(false); }}
                  onDelete={() =>
                    showDeleteConfirm === c.id
                      ? handleDelete(c.id)
                      : setShowDeleteConfirm(c.id)
                  }
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Character Version Choice Modal */}
      {pendingCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <CharacterChoiceModal
            campaign={pendingCampaign}
            libraryCharacter={libraryCharacter}
            onChooseCampaign={() => confirmLoad(false)}
            onChooseLibrary={() => confirmLoad(true)}
            onCancel={() => { setPendingCampaign(null); setLibraryCharacter(undefined); }}
            t={t}
            locale={i18n.language === 'pl' ? 'pl-PL' : undefined}
          />
        </div>
      )}
    </div>
    </>
  );
}
