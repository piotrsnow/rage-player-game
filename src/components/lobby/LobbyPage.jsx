import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { storage } from '../../services/storage';
import { apiClient } from '../../services/apiClient';
import { exportAsMarkdown, exportAsJson } from '../../services/exportLog';
import { getPersistedRejoinInfo, clearPersistedRejoinInfo } from '../../services/websocket';
import { useGame } from '../../contexts/GameContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useModals } from '../../contexts/ModalContext';
import { useMultiplayer } from '../../contexts/MultiplayerContext';
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

export default function LobbyPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { dispatch } = useGame();
  const { openSettings } = useModals();
  const { settings, backendUser } = useSettings();
  const mp = useMultiplayer();
  const [campaigns, setCampaigns] = useState([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [rejoinInfo, setRejoinInfo] = useState(null);
  const [rejoining, setRejoining] = useState(false);

  useEffect(() => {
    setCampaigns(storage.getCampaigns());

    if (apiClient.isConnected()) {
      setSyncing(true);
      storage.syncCampaigns()
        .then((synced) => setCampaigns(synced))
        .catch(() => {})
        .finally(() => setSyncing(false));
    }

    const persisted = getPersistedRejoinInfo();
    if (persisted?.roomCode && apiClient.isConnected()) {
      apiClient.get('/multiplayer/my-sessions')
        .then((res) => {
          const sessions = res?.sessions || [];
          const match = sessions.find((s) => s.roomCode === persisted.roomCode);
          if (match) {
            setRejoinInfo({ ...persisted, ...match });
          } else {
            clearPersistedRejoinInfo();
          }
        })
        .catch(() => {
          setRejoinInfo(persisted);
        });
    }
  }, []);

  const handleLoad = (campaign) => {
    dispatch({ type: 'LOAD_CAMPAIGN', payload: campaign });
    navigate('/play');
  };

  const handleDelete = async (id) => {
    await storage.deleteCampaign(id);
    setCampaigns(storage.getCampaigns());
    setShowDeleteConfirm(null);
  };

  const handleContinue = () => {
    const activeId = storage.getActiveCampaignId();
    if (activeId) {
      const data = storage.loadCampaign(activeId);
      if (data) {
        dispatch({ type: 'LOAD_CAMPAIGN', payload: data });
        navigate('/play');
        return;
      }
    }
    if (campaigns.length > 0) {
      dispatch({ type: 'LOAD_CAMPAIGN', payload: campaigns[0] });
      navigate('/play');
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

  const hasApiKey = settings.openaiApiKey || settings.anthropicApiKey;
  const isLoggedIn = !!backendUser;
  const hasCampaigns = campaigns.length > 0;

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] px-6 py-12 relative overflow-hidden">
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
          <GlassCard elevated className="p-6 border-l-2 border-primary">
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
      {!hasApiKey && (
        <div className="mb-8 max-w-md w-full animate-slide-up relative z-10" style={{ animationDelay: '0.25s' }}>
          <div
            onClick={openSettings}
            className="glass-panel-elevated p-6 rounded-sm border-l-2 border-tertiary cursor-pointer hover:border-tertiary/80 transition-all hover:translate-y-[-1px] hover:shadow-[0_12px_40px_rgba(0,0,0,0.4)]"
          >
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-tertiary mt-0.5">key</span>
              <div>
                <p className="font-headline text-tertiary text-sm mb-1">{t('lobby.apiKeyRequired')}</p>
                <p className="text-on-surface-variant text-xs">
                  {t('lobby.apiKeyDescription')}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Saved Campaigns */}
      {isLoggedIn && hasCampaigns && (
        <div className="w-full max-w-2xl animate-slide-up relative z-10" style={{ animationDelay: '0.3s' }}>
          <GlassCard elevated className="p-8">
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
                  key={c.campaign?.id || c.campaign?.backendId || i}
                  campaign={c}
                  onLoad={() => handleLoad(c)}
                  onDelete={() =>
                    showDeleteConfirm === c.campaign.id
                      ? handleDelete(c.campaign.id)
                      : setShowDeleteConfirm(c.campaign.id)
                  }
                  onExportLog={() => exportAsMarkdown(c)}
                  onExportJson={() => exportAsJson(c)}
                />
              ))}
            </div>
          </GlassCard>
        </div>
      )}

      {/* Empty State */}
      {isLoggedIn && !hasCampaigns && hasApiKey && (
        <div className="text-center text-on-surface-variant animate-slide-up relative z-10" style={{ animationDelay: '0.3s' }}>
          <span className="material-symbols-outlined text-6xl text-outline/20 mb-4 block animate-float-slow">
            auto_stories
          </span>
          <p className="text-sm mb-2">{t('lobby.noCampaigns')}</p>
          <p className="text-xs text-outline">{t('lobby.noCampaignsHint', 'Create your first adventure above')}</p>
        </div>
      )}
    </div>
  );
}
