import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { useGame } from '../../contexts/GameContext';
import { apiClient } from '../../services/apiClient';
import LoadingSpinner from '../ui/LoadingSpinner';
import GameplayPage from '../gameplay/GameplayPage';

export default function CampaignViewerPage() {
  const { shareToken } = useParams();
  const { t } = useTranslation();
  const { settings } = useSettings();
  const { state, dispatch } = useGame();
  const loadedRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const backendUrl = apiClient.getBaseUrl() || settings.backendUrl || '';

  const fetchAndLoad = useCallback(async (force = false) => {
    if (!force && loadedRef.current) return;
    if (!shareToken) {
      setError(t('viewer.notFound'));
      setLoading(false);
      return;
    }

    const base = backendUrl.replace(/\/+$/, '');
    if (!base) {
      setError(t('viewer.backendRequired'));
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${base}/v1/campaigns/share/${shareToken}`);
      if (!res.ok) {
        setError(t('viewer.notFound'));
        setLoading(false);
        return;
      }
      const json = await res.json();
      const gameState = json.data;
      if (!gameState?.campaign) {
        setError(t('viewer.notFound'));
        setLoading(false);
        return;
      }

      loadedRef.current = true;
      setError(null);
      dispatch({ type: 'LOAD_CAMPAIGN', payload: gameState });
    } catch {
      setError(t('viewer.notFound'));
    } finally {
      setLoading(false);
    }
  }, [shareToken, backendUrl, t, dispatch]);

  useEffect(() => {
    fetchAndLoad();
  }, [fetchAndLoad]);

  const handleRefresh = useCallback(async () => {
    loadedRef.current = false;
    setError(null);
    await fetchAndLoad(true);
  }, [fetchAndLoad]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner size="lg" text={t('viewer.loading')} />
      </div>
    );
  }

  if (error || !state.campaign) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <span className="material-symbols-outlined text-6xl text-outline/30">link_off</span>
        <p className="text-on-surface-variant text-lg">{error || t('viewer.notFound')}</p>
        <a href="/" className="text-primary hover:text-primary/80 text-sm underline underline-offset-4">
          {t('viewer.goHome')}
        </a>
      </div>
    );
  }

  return <GameplayPage readOnly shareToken={shareToken} onRefresh={handleRefresh} />;
}
