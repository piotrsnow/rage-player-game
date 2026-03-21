import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { storage } from '../../services/storage';
import { useGame } from '../../contexts/GameContext';
import { useSettings } from '../../contexts/SettingsContext';
import Button from '../ui/Button';
import GlassCard from '../ui/GlassCard';
import CampaignCard from './CampaignCard';

export default function LobbyPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { dispatch } = useGame();
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
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] px-6 py-12">
      {/* Hero Section */}
      <div className="text-center mb-16 max-w-2xl animate-fade-in">
        <h1 className="font-headline text-5xl md:text-7xl text-tertiary mb-4 tracking-tighter drop-shadow-2xl">
          {t('lobby.title')}
        </h1>
        <p className="text-on-surface-variant font-body text-lg max-w-lg mx-auto leading-relaxed">
          {t('lobby.subtitle')}
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-6 items-center mb-16">
        <Button size="lg" onClick={() => navigate('/create')}>
          {t('lobby.newCampaign')}
        </Button>
        {hasCampaigns && (
          <Button size="lg" variant="secondary" onClick={handleContinue}>
            {t('lobby.continueCampaign')}
          </Button>
        )}
      </div>

      {/* API Key Warning */}
      {!hasApiKey && (
        <div className="mb-8 max-w-md w-full animate-fade-in">
          <div
            onClick={() => navigate('/settings')}
            className="bg-surface-container-high/60 backdrop-blur-xl p-6 rounded-sm border-l-2 border-tertiary cursor-pointer hover:bg-surface-container-highest/60 transition-colors"
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
        <div className="w-full max-w-2xl animate-fade-in">
          <GlassCard className="p-8">
            <h3 className="font-headline text-tertiary text-xl mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary-dim">save</span>
              {t('lobby.savedCampaigns')}
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
                />
              ))}
            </div>
          </GlassCard>
        </div>
      )}

      {/* Empty State */}
      {!hasCampaigns && hasApiKey && (
        <div className="text-center text-on-surface-variant animate-fade-in">
          <span className="material-symbols-outlined text-6xl text-outline/20 mb-4 block">
            auto_stories
          </span>
          <p className="text-sm">{t('lobby.noCampaigns')}</p>
        </div>
      )}
    </div>
  );
}
