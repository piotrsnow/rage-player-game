import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { storage } from '../../services/storage';
import { exportAsMarkdown, exportAsJson } from '../../services/exportLog';
import { useGame } from '../../contexts/GameContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useModals } from '../../contexts/ModalContext';
import Button from '../ui/Button';
import GlassCard from '../ui/GlassCard';
import CampaignCard from './CampaignCard';

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
  const { settings } = useSettings();
  const [campaigns, setCampaigns] = useState([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);

  useEffect(() => {
    setCampaigns(storage.getCampaigns());
  }, []);

  const handleLoad = (campaign) => {
    dispatch({ type: 'LOAD_CAMPAIGN', payload: campaign });
    navigate('/play');
  };

  const handleDelete = (id) => {
    storage.deleteCampaign(id);
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

  const hasApiKey = settings.openaiApiKey || settings.anthropicApiKey;
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
        <img src="/logo.png" alt={t('lobby.title')} className="h-28 md:h-40 w-auto mx-auto mb-6 drop-shadow-2xl" />

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

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-6 items-center mb-16 animate-slide-up relative z-10" style={{ animationDelay: '0.15s' }}>
        <Button size="lg" onClick={() => navigate('/create')}>
          {t('lobby.newCampaign')}
        </Button>
        {hasCampaigns && (
          <>
            <span className="text-xs text-outline uppercase tracking-widest hidden sm:block">{t('common.or', 'or')}</span>
            <Button size="lg" variant="secondary" onClick={handleContinue}>
              {t('lobby.continueCampaign')}
            </Button>
          </>
        )}
      </div>

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
      {hasCampaigns && (
        <div className="w-full max-w-2xl animate-slide-up relative z-10" style={{ animationDelay: '0.3s' }}>
          <GlassCard elevated className="p-8">
            <h3 className="font-headline text-tertiary text-xl mb-6 flex items-center gap-3">
              <span className="material-symbols-outlined text-primary-dim">save</span>
              {t('lobby.savedCampaigns')}
              <span className="ml-auto text-xs text-outline font-label">{campaigns.length}</span>
            </h3>
            <div className="space-y-1">
              {campaigns.map((c) => (
                <CampaignCard
                  key={c.campaign.id}
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
      {!hasCampaigns && hasApiKey && (
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
