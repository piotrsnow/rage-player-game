import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../../services/apiClient';

const MAX_SEED = 0xFFFF_FFFF;

export default function SdWebuiModelPicker({ settings, updateSettings }) {
  const { t } = useTranslation();
  const [models, setModels] = useState([]);
  const [currentLoaded, setCurrentLoaded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Seed is "inactive" when settings.sdWebuiSeed is null → backend rolls a
  // random seed per request. Double-click on the field flips between
  // inactive (random) and active (editable number).
  const seedActive = settings.sdWebuiSeed !== null && settings.sdWebuiSeed !== undefined;
  const seedInputRef = useRef(null);
  const [seedDraft, setSeedDraft] = useState(() => (seedActive ? String(settings.sdWebuiSeed) : ''));

  useEffect(() => {
    setSeedDraft(seedActive ? String(settings.sdWebuiSeed ?? '') : '');
  }, [seedActive, settings.sdWebuiSeed]);

  const toggleSeedActive = useCallback(() => {
    if (seedActive) {
      updateSettings({ sdWebuiSeed: null });
    } else {
      const initial = Math.floor(Math.random() * (MAX_SEED + 1));
      updateSettings({ sdWebuiSeed: initial });
      // Focus + select on next tick so typing replaces the seed immediately.
      setTimeout(() => {
        seedInputRef.current?.focus();
        seedInputRef.current?.select();
      }, 0);
    }
  }, [seedActive, updateSettings]);

  const commitSeedDraft = useCallback((raw) => {
    if (!seedActive) return;
    if (raw === '' || raw === null || raw === undefined) {
      updateSettings({ sdWebuiSeed: 0 });
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const clamped = Math.max(0, Math.min(MAX_SEED, Math.floor(n)));
    updateSettings({ sdWebuiSeed: clamped });
  }, [seedActive, updateSettings]);

  const rerollSeed = useCallback(() => {
    if (!seedActive) return;
    updateSettings({ sdWebuiSeed: Math.floor(Math.random() * (MAX_SEED + 1)) });
  }, [seedActive, updateSettings]);

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

      <div className="pt-3 mt-2 border-t border-outline-variant/10 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest">
            {t('settings.sdWebuiSeed', 'Seed')}
          </label>
          <span className="text-[10px] font-label text-outline">
            {seedActive
              ? t('settings.sdWebuiSeedManual', 'manual')
              : t('settings.sdWebuiSeedRandom', 'random')}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={seedInputRef}
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_SEED}
            step={1}
            value={seedActive ? seedDraft : ''}
            placeholder={seedActive ? '' : t('settings.sdWebuiSeedPlaceholder', 'Random (double-click to fix)')}
            onDoubleClick={toggleSeedActive}
            onChange={(e) => setSeedDraft(e.target.value)}
            onBlur={(e) => commitSeedDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              }
            }}
            disabled={!seedActive}
            className={`flex-1 px-2 py-2 rounded-sm border text-xs font-mono tabular-nums focus:outline-none ${
              seedActive
                ? 'bg-surface-container-high/40 border-primary/30 text-on-surface focus:border-primary/60 cursor-text'
                : 'bg-surface-container-high/20 border-outline-variant/15 text-on-surface-variant/60 cursor-pointer select-none'
            }`}
          />
          <button
            type="button"
            onClick={rerollSeed}
            disabled={!seedActive}
            title={t('settings.sdWebuiSeedReroll', 'Roll a new seed')}
            className="px-2 py-2 rounded-sm border border-outline-variant/20 text-on-surface-variant hover:text-primary hover:border-primary/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-[14px]">casino</span>
          </button>
        </div>

        <p className="text-[10px] text-on-surface-variant leading-snug">
          {t('settings.sdWebuiSeedHint', 'Double-click the field to toggle between random (new seed each time) and manual (same seed → same image).')}
        </p>
      </div>
    </div>
  );
}
