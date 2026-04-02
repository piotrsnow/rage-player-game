import { useState, useEffect } from 'react';
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
  const career = char.career?.name || char.careerData?.name || char.career || char.careerData || '—';
  const tier = char.career?.tier || char.careerData?.tier || '?';
  const xp = char.xp ?? 0;
  const xpSpent = char.xpSpent ?? 0;
  return (
    <div className={`flex-1 min-w-0 p-4 rounded-sm border transition-colors ${disabled ? 'opacity-40 border-outline-variant/20 bg-surface-container-low/30' : `border-${accent}/20 bg-surface-container-low`}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`material-symbols-outlined text-sm ${disabled ? 'text-outline' : `text-${accent}`}`}>{icon}</span>
        <span className={`font-label text-xs uppercase tracking-wider ${disabled ? 'text-outline' : `text-${accent}`}`}>{label}</span>
      </div>
      <p className="text-on-surface font-headline text-sm truncate">{char.name || '—'}</p>
      <p className="text-on-surface-variant text-xs mt-1">{career} (T{tier})</p>
      <p className="text-on-surface-variant text-[10px] mt-1">XP: {xp} / {xpSpent} spent</p>
    </div>
  );
}

function CharacterChoiceModal({ campaign, libraryCharacter, libraryLoading, onChooseCampaign, onChooseLibrary, onCancel, t }) {
  const campaignChar = campaign.character;
  const hasLibrary = libraryCharacter != null && libraryCharacter !== undefined;
  const libraryDisabled = !hasLibrary || libraryLoading;

  return (
    <div data-testid="character-choice-modal" className="bg-surface-container border border-outline-variant/20 rounded-sm shadow-2xl w-full max-w-lg mx-4 animate-slide-up">
      <div className="p-6 border-b border-outline-variant/10">
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

      <div className="p-6 flex gap-4">
        <CharacterSummary
          char={campaignChar}
          label={t('lobby.campaignCharacter', 'Campaign Character')}
          icon="save"
          accent="tertiary"
        />
        {libraryLoading ? (
          <div className="flex-1 min-w-0 p-4 rounded-sm border border-outline-variant/20 bg-surface-container-low/30 flex items-center justify-center">
            <span className="material-symbols-outlined text-sm text-outline animate-spin">sync</span>
          </div>
        ) : hasLibrary ? (
          <CharacterSummary
            char={libraryCharacter}
            label={t('lobby.libraryCharacter', 'Current Character (Library)')}
            icon="person"
            accent="primary"
          />
        ) : (
          <div className="flex-1 min-w-0 p-4 rounded-sm border border-outline-variant/20 bg-surface-container-low/30 flex flex-col items-center justify-center gap-2">
            <span className="material-symbols-outlined text-lg text-outline/40">person_off</span>
            <p className="text-outline text-[10px] text-center">{t('lobby.libraryCharacterNotFound', 'Character not found in library')}</p>
          </div>
        )}
      </div>

      <div className="px-6 pb-6 flex gap-3">
        <Button className="flex-1" variant="secondary" onClick={onChooseCampaign}>
          {t('lobby.useCampaignChar', 'Use Campaign Version')}
        </Button>
        <Button className="flex-1" onClick={onChooseLibrary} disabled={libraryDisabled}>
          {t('lobby.useLibraryChar', 'Use Library Version')}
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
  const { t } = useTranslation();
  const { dispatch } = useGame();
  const { openSettings } = useModals();
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
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [campaignNotFound, setCampaignNotFound] = useState(false);
  const [loadingCampaignId, setLoadingCampaignId] = useState(null);

  useEffect(() => {
    if (location.state?.campaignNotFound) {
      setCampaignNotFound(true);
      navigate('/', { replace: true, state: {} });
    }
  }, [location.state, navigate]);

  useEffect(() => {
    if (!backendUser || !apiClient.isConnected()) {
      setCampaigns([]);
      setSyncing(false);
      return;
    }

    let cancelled = false;
    setSyncing(true);
    storage.getCampaigns()
      .then((list) => {
        if (cancelled) return;
        setCampaigns(list);
        if (list.some((c) => !c.characterName && c.sceneCount > 0)) {
          apiClient.post('/campaigns/backfill-summaries')
            .then(() => storage.getCampaigns())
            .then((fresh) => { if (!cancelled) setCampaigns(fresh); })
            .catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSyncing(false);
      });

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

    return () => {
      cancelled = true;
    };
  }, [backendUser]);

  const openCharacterChoice = async (campaignData) => {
    setPendingCampaign(campaignData);
    setLibraryCharacter(undefined);
    if (!campaignData.character) {
      setLibraryLoading(false);
      return;
    }
    setLibraryLoading(true);
    try {
      const chars = await storage.getCharactersAsync();
      const match = storage.findMatchingLibraryCharacter(campaignData.character, chars);
      setLibraryCharacter(match);
    } catch {
      setLibraryCharacter(null);
    } finally {
      setLibraryLoading(false);
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
          career: libraryCharacter.career || libraryCharacter.careerData,
          localId: pendingCampaign.character?.localId || libraryCharacter.localId,
          backendId: libraryCharacter.backendId || libraryCharacter.id || pendingCampaign.character?.backendId,
        },
      };
    }
    dispatch({ type: 'LOAD_CAMPAIGN', payload });
    setPendingCampaign(null);
    setLibraryCharacter(undefined);
    navigate(`/play/${payload.campaign.backendId || payload.campaign.id}`);
  };

  const handleLoad = async (campaign) => {
    if (loadingCampaignId) return;
    setLoadingCampaignId(campaign.id);
    try {
      const data = await storage.loadCampaign(campaign.id);
      if (data) openCharacterChoice(data);
    } catch (err) {
      console.warn('[LobbyPage] Failed to load campaign:', err.message);
    } finally {
      setLoadingCampaignId(null);
    }
  };

  const handleDelete = async (id) => {
    await storage.deleteCampaign(id);
    try {
      setCampaigns(await storage.getCampaigns());
    } catch { /* ignore */ }
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

  const hasServerAi = hasApiKey('openai') || hasApiKey('anthropic');
  const isLoggedIn = !!backendUser;
  const hasCampaigns = campaigns.length > 0;

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] px-6 py-12 relative overflow-hidden">
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
      <FloatingRune delay={1} className="text-7xl top-[40%] right-[6%] animate-float-slow" />

      {/* Hero Section */}
      <div className="text-center mb-16 max-w-2xl animate-slide-up relative z-10">
        <img src={t('common.logoPath', '/nikczemnu_logo.png')} alt={t('lobby.title')} className="h-56 md:h-80 w-auto mx-auto mb-6 drop-shadow-2xl" />

        {/* Ornamental divider */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="h-px w-16 bg-gradient-to-r from-transparent to-primary/40" />
          <span className="material-symbols-outlined text-primary/40 text-sm">diamond</span>
          <div className="h-px w-16 bg-gradient-to-l from-transparent to-primary/40" />
        </div>

        <p className="text-on-surface-variant font-body text-lg max-w-lg mx-auto leading-relaxed">
          {t('lobby.subtitle')}
        </p>
      </div>

      {/* Auth Panel */}
      <div className="mb-12 w-full flex justify-center animate-slide-up relative z-10" style={{ animationDelay: '0.12s' }}>
        <AuthPanel />
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-6 items-center mb-16 animate-slide-up relative z-10" style={{ animationDelay: '0.2s' }}>
        <Button size="lg" onClick={() => navigate('/create')}>
          {t('lobby.newCampaign')}
        </Button>
        {isLoggedIn && hasCampaigns && (
          <>
            <span className="text-xs text-outline uppercase tracking-widest hidden sm:block">{t('common.or', 'or')}</span>
            <Button size="lg" variant="secondary" onClick={handleContinue}>
              {t('lobby.continueCampaign')}
            </Button>
          </>
        )}
      </div>

      {/* Multiplayer Rejoin Banner */}
      {rejoinInfo && (
        <div className="mb-8 max-w-md w-full animate-slide-up relative z-10" style={{ animationDelay: '0.2s' }}>
          <GlassCard elevated className="p-6 border-l-2 border-primary" data-testid="rejoin-banner">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-primary mt-0.5">wifi_off</span>
              <div className="flex-1 min-w-0">
                <p className="font-headline text-primary text-sm mb-1">
                  {t('lobby.activeMultiplayerSession', 'Active Multiplayer Session')}
                </p>
                <p className="text-on-surface-variant text-xs mb-3">
                  {t('lobby.rejoinDescription', 'You were disconnected from a multiplayer game. Rejoin to continue playing.')}
                  {rejoinInfo.campaignName && (
                    <span className="block mt-1 text-on-surface/70 font-medium">
                      {rejoinInfo.campaignName} &middot; {rejoinInfo.roomCode}
                    </span>
                  )}
                  {!rejoinInfo.campaignName && (
                    <span className="block mt-1 text-on-surface/70 font-medium">
                      {t('multiplayer.room', 'Room')}: {rejoinInfo.roomCode}
                    </span>
                  )}
                </p>
                <div className="flex gap-3">
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
            </div>
          </GlassCard>
        </div>
      )}

      {/* API Key Warning */}
      {!hasServerAi && (
        <div className="mb-8 max-w-md w-full animate-slide-up relative z-10" style={{ animationDelay: '0.25s' }}>
          <div
            onClick={openSettings}
            data-testid="api-key-warning"
            className="glass-panel-elevated p-6 rounded-sm border-l-2 border-tertiary cursor-pointer hover:border-tertiary/80 transition-all hover:translate-y-[-1px] hover:shadow-[0_12px_40px_rgba(0,0,0,0.4)]"
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
        </div>
      )}

      {/* Saved Campaigns */}
      {isLoggedIn && hasCampaigns && (
        <div className="w-full max-w-2xl animate-slide-up relative z-10" style={{ animationDelay: '0.3s' }}>
          <GlassCard elevated className="p-8" data-testid="saved-campaigns">
            <h3 className="font-headline text-tertiary text-xl mb-6 flex items-center gap-3">
              <span className="material-symbols-outlined text-primary-dim">save</span>
              {t('lobby.savedCampaigns')}
              {syncing && (
                <span className="text-xs text-outline font-label flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm animate-spin">sync</span>
                  {t('lobby.syncing', 'Syncing...')}
                </span>
              )}
              <span className="ml-auto text-xs text-outline font-label">{campaigns.length}</span>
            </h3>
            <div className="space-y-1">
              {campaigns.map((c, i) => (
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
          </GlassCard>
        </div>
      )}

      {/* Empty State */}
      {isLoggedIn && !hasCampaigns && hasServerAi && (
        <div className="text-center text-on-surface-variant animate-slide-up relative z-10" style={{ animationDelay: '0.3s' }}>
          <span className="material-symbols-outlined text-6xl text-outline/20 mb-4 block animate-float-slow">
            auto_stories
          </span>
          <p className="text-sm mb-2">{t('lobby.noCampaigns')}</p>
          <p className="text-xs text-outline">{t('lobby.noCampaignsHint', 'Create your first adventure above')}</p>
        </div>
      )}

      {/* Character Version Choice Modal */}
      {pendingCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <CharacterChoiceModal
            campaign={pendingCampaign}
            libraryCharacter={libraryCharacter}
            libraryLoading={libraryLoading}
            onChooseCampaign={() => confirmLoad(false)}
            onChooseLibrary={() => confirmLoad(true)}
            onCancel={() => { setPendingCampaign(null); setLibraryCharacter(undefined); }}
            t={t}
          />
        </div>
      )}
    </div>
  );
}
