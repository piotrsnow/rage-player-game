import { useEffect } from 'react';
import { storage } from '../services/storage';
import { useSettings } from '../contexts/SettingsContext';

/**
 * Loads the campaign from URL param when none is active. Redirects to `/` on
 * missing/failed load. Only runs in solo, non-viewer mode.
 */
export function useCampaignLoader({ campaign, isMultiplayer, readOnly, urlCampaignId, dispatch, navigate }) {
  const { backendAuthChecking } = useSettings();
  useEffect(() => {
    if (campaign || isMultiplayer || readOnly) return;
    // Wait for auth bootstrap to finish before attempting a backend load —
    // otherwise storage.loadCampaign sees `isConnected === false` and falls
    // through to the (usually empty) local snapshot.
    if (backendAuthChecking) return;
    if (urlCampaignId) {
      let cancelled = false;
      storage.loadCampaign(urlCampaignId)
        .then((data) => {
          if (cancelled) return;
          if (data) {
            dispatch({ type: 'LOAD_CAMPAIGN', payload: data });
            storage.saveLocalSnapshot(data);
          } else {
            navigate('/', { replace: true, state: { campaignNotFound: true } });
          }
        })
        .catch(() => {
          if (!cancelled) navigate('/', { replace: true, state: { campaignNotFound: true } });
        });
      return () => { cancelled = true; };
    }
    navigate('/');
  }, [campaign, isMultiplayer, readOnly, navigate, urlCampaignId, dispatch, backendAuthChecking]);
}
