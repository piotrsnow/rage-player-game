import { useEffect } from 'react';
import { storage } from '../services/storage';

/**
 * Loads the campaign from URL param when none is active. Redirects to `/` on
 * missing/failed load. Only runs in solo, non-viewer mode.
 */
export function useCampaignLoader({ campaign, isMultiplayer, readOnly, urlCampaignId, dispatch, navigate }) {
  useEffect(() => {
    if (campaign || isMultiplayer || readOnly) return;
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
  }, [campaign, isMultiplayer, readOnly, navigate, urlCampaignId, dispatch]);
}
