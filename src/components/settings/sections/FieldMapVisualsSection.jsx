import { useTranslation } from 'react-i18next';

const PROVIDERS = [
  { id: 'sd-webui', icon: 'lan', label: 'SD-WebUI (local)' },
  { id: 'stability', icon: 'cloud', label: 'Stability (cloud)' },
];

const BASE_TILE_PX_OPTIONS = [32, 48, 64, 96, 128];
const PROJECT_TILESIZE_OPTIONS = [16, 24, 32, 48];

/**
 * Per-campaign settings for the field-map visual pipeline. Backend reads
 * these from coreState.dmSettings; missing values fall back to config defaults
 * (FIELD_MAP_* env vars).
 */
export default function FieldMapVisualsSection({ dmSettings, updateDMSettings }) {
  const { t } = useTranslation();
  const provider = dmSettings.fieldMapVisualProvider || 'sd-webui';
  const baseTilePx = dmSettings.fieldMapBaseTilePx || 64;
  const projectTilesize = dmSettings.fieldMapProjectTilesize || 24;
  const styleSuffix = dmSettings.fieldMapStyleSuffix ?? '';

  return (
    <div className="bg-surface-container-high/60 backdrop-blur-xl p-8 rounded-sm border-l border-primary/20">
      <h2 className="font-headline text-xl text-tertiary mb-2 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary-dim">grid_view</span>
        {t('settings.fieldMapVisuals', 'Mapy pól — grafika')}
      </h2>
      <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-6">
        {t('settings.fieldMapVisualsDesc', 'Async generacja kafli (tilesetu) per lokacja')}
      </p>

      <div className="mb-5">
        <p className="font-headline text-tertiary text-sm mb-2">
          {t('settings.fieldMapProvider', 'Dostawca obrazu')}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              onClick={() => updateDMSettings({ fieldMapVisualProvider: p.id })}
              className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-sm border text-center transition-all ${
                provider === p.id
                  ? 'bg-surface-tint/10 border-primary/30 text-primary'
                  : 'bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-primary/20'
              }`}
            >
              <span className="material-symbols-outlined text-sm">{p.icon}</span>
              <span className="font-headline text-xs">{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-5">
        <p className="font-headline text-tertiary text-sm mb-2">
          {t('settings.fieldMapBaseTilePx', 'Bazowa rozdzielczość kafla (px)')}
        </p>
        <div className="flex flex-wrap gap-2">
          {BASE_TILE_PX_OPTIONS.map((px) => (
            <button
              key={px}
              onClick={() => updateDMSettings({ fieldMapBaseTilePx: px })}
              className={`px-3 py-1.5 text-xs font-label uppercase tracking-wider rounded-sm border transition-colors ${
                baseTilePx === px
                  ? 'bg-primary/20 border-primary/40 text-primary'
                  : 'border-outline-variant/20 text-on-surface-variant hover:border-primary/30'
              }`}
            >
              {px}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-on-surface-variant font-label tracking-widest mt-2">
          {t('settings.fieldMapBaseTilePxDesc', 'Wymiar PNG kafla 1×1 (stamp 2×2 → 2× tej wartości)')}
        </p>
      </div>

      <div className="mb-5">
        <p className="font-headline text-tertiary text-sm mb-2">
          {t('settings.fieldMapProjectTilesize', 'Rozmiar wyświetlania (px)')}
        </p>
        <div className="flex flex-wrap gap-2">
          {PROJECT_TILESIZE_OPTIONS.map((px) => (
            <button
              key={px}
              onClick={() => updateDMSettings({ fieldMapProjectTilesize: px })}
              className={`px-3 py-1.5 text-xs font-label uppercase tracking-wider rounded-sm border transition-colors ${
                projectTilesize === px
                  ? 'bg-primary/20 border-primary/40 text-primary'
                  : 'border-outline-variant/20 text-on-surface-variant hover:border-primary/30'
              }`}
            >
              {px}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="font-headline text-tertiary text-sm mb-2">
          {t('settings.fieldMapStyleSuffix', 'Globalny sufiks stylu')}
        </p>
        <input
          type="text"
          value={styleSuffix}
          maxLength={200}
          onChange={(e) => updateDMSettings({ fieldMapStyleSuffix: e.target.value })}
          placeholder="top-down view, pixel art, seamless, no text"
          className="w-full bg-surface-container/60 border border-outline-variant/15 rounded-sm px-3 py-2 text-sm text-on-surface focus:border-primary/40 focus:outline-none"
        />
        <p className="text-[10px] text-on-surface-variant font-label tracking-widest mt-2">
          {t('settings.fieldMapStyleSuffixDesc', 'Doklejane do każdego promptu assetu')}
        </p>
      </div>
    </div>
  );
}
