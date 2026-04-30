import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../../services/apiClient';

export default function SdWebuiModelPicker({ settings, updateSettings }) {
  const { t } = useTranslation();
  const [models, setModels] = useState([]);
  const [currentLoaded, setCurrentLoaded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadModels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get('/proxy/sd-webui/models');
      const list = Array.isArray(data?.models) ? data.models : [];
      setModels(list);
      setCurrentLoaded(data?.current || null);

      // If the user hasn't picked a model yet, default to the one currently
      // loaded in A1111 (or the first one on the list) so they don't get a
      // 400 on first generation.
      if (!settings.sdWebuiModel && list.length > 0) {
        const fallback = list.find((m) => m.title === data?.current) || list[0];
        updateSettings({ sdWebuiModel: fallback.title });
      }
    } catch (err) {
      const msg = err?.message || 'Failed to load models';
      const offline = /unreachable|not configured|SD_WEBUI/i.test(msg);
      setError(offline
        ? t('settings.sdWebuiOffline', 'Stable Diffusion WebUI is unreachable. Check SD_WEBUI_URL and make sure A1111 runs with --api.')
        : msg);
      setModels([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  const selected = settings.sdWebuiModel || '';

  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest">
          {t('settings.sdWebuiModel', 'Stable Diffusion model')}
        </label>
        <button
          type="button"
          onClick={loadModels}
          disabled={loading}
          className="text-[10px] font-label text-tertiary hover:text-primary transition-colors disabled:opacity-40 flex items-center gap-1"
        >
          <span className={`material-symbols-outlined text-[12px] ${loading ? 'animate-spin' : ''}`}>refresh</span>
          {t('settings.sdWebuiModelRefresh', 'Refresh')}
        </button>
      </div>

      {error && (
        <p className="text-[11px] text-error/80 flex items-start gap-1">
          <span className="material-symbols-outlined text-[14px]">error</span>
          {error}
        </p>
      )}

      {!error && models.length === 0 && !loading && (
        <p className="text-[11px] text-on-surface-variant">
          {t('settings.sdWebuiNoModels', 'No checkpoints installed in A1111.')}
        </p>
      )}

      {models.length > 0 && (
        <select
          value={selected}
          onChange={(e) => updateSettings({ sdWebuiModel: e.target.value })}
          className="w-full px-2 py-2 rounded-sm bg-surface-container-high/40 border border-outline-variant/20 text-xs text-on-surface focus:outline-none focus:border-primary/50"
        >
          {models.map((m) => (
            <option key={m.title} value={m.title}>
              {m.title}{m.title === currentLoaded ? ' ✓' : ''}
            </option>
          ))}
        </select>
      )}

      {currentLoaded && (
        <p className="text-[10px] text-on-surface-variant">
          {t('settings.sdWebuiCurrentlyLoaded', 'Currently loaded in A1111: {{title}}', { title: currentLoaded })}
        </p>
      )}
    </div>
  );
}
