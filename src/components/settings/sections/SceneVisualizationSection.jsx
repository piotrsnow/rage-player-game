import { useTranslation } from 'react-i18next';
import Slider from '../../ui/Slider';
import Toggle from '../../ui/Toggle';

const IMAGE_STYLES = [
  { id: 'illustration', icon: 'palette' },
  { id: 'pencil', icon: 'edit' },
  { id: 'noir', icon: 'contrast' },
  { id: 'anime', icon: 'animated_images' },
  { id: 'painting', icon: 'brush' },
  { id: 'watercolor', icon: 'water_drop' },
  { id: 'comic', icon: 'auto_stories' },
  { id: 'darkFantasy', icon: 'skull' },
  { id: 'vanGogh', icon: 'texture' },
  { id: 'photoreal', icon: 'photo_camera' },
  { id: 'retro', icon: 'grid_on' },
  { id: 'gothic', icon: 'castle' },
  { id: 'hiphop', icon: 'mic' },
  { id: 'crayon', icon: 'draw' },
];

export default function SceneVisualizationSection({ settings, updateSettings, updateDMSettings }) {
  const { t } = useTranslation();
  const dmSettings = settings.dmSettings;

  const seriousnessValue = dmSettings.narratorSeriousness ?? 50;
  const seriousnessLabel = seriousnessValue < 25
    ? t('settings.seriousnessLabels.silly')
    : seriousnessValue < 50
      ? t('settings.seriousnessLabels.lighthearted')
      : seriousnessValue < 75
        ? t('settings.seriousnessLabels.serious')
        : t('settings.seriousnessLabels.grave');

  const visOptions = [
    { id: 'image', icon: 'image', label: t('settings.sceneVisImage') },
    { id: 'map', icon: 'grid_on', label: t('settings.sceneVisMap') },
    { id: '3d', icon: 'view_in_ar', label: t('settings.sceneVis3D') },
    { id: 'canvas', icon: 'brush', label: t('settings.sceneVisCanvas') },
    { id: 'none', icon: 'visibility_off', label: t('settings.sceneVisNone') },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="bg-surface-container-high/40 p-6 rounded-sm border-b border-outline-variant/15 group hover:bg-surface-container-high transition-colors col-span-1 md:col-span-2">
        <div className="mb-3">
          <p className="font-headline text-tertiary">{t('settings.sceneVisualization')}</p>
          <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest mt-1">
            {t('settings.sceneVisualizationDesc')}
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {visOptions.map((opt) => (
            <button
              key={opt.id}
              onClick={() => updateSettings({ sceneVisualization: opt.id })}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-sm border text-center transition-all ${
                (settings.sceneVisualization || 'image') === opt.id
                  ? 'bg-surface-tint/10 border-primary/30 text-primary'
                  : 'bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-primary/20'
              }`}
            >
              <span className="material-symbols-outlined text-sm">{opt.icon}</span>
              <span className="font-headline text-xs">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {(settings.sceneVisualization || 'image') === 'image' && (
        <div className="bg-surface-container-high/40 p-6 rounded-sm border-b border-outline-variant/15 group hover:bg-surface-container-high transition-colors col-span-1 md:col-span-2">
          <div className="mb-3">
            <p className="font-headline text-tertiary">{t('settings.imageStyle')}</p>
            <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest mt-1">
              {t('settings.imageStyleDesc')}
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {IMAGE_STYLES.map((style) => (
              <button
                key={style.id}
                onClick={() => updateDMSettings({ imageStyle: style.id })}
                className={`flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-sm border text-center transition-all ${
                  (dmSettings.imageStyle || 'painting') === style.id
                    ? 'bg-surface-tint/10 border-primary/30 text-primary'
                    : 'bg-surface-container-high/40 border-outline-variant/15 text-on-surface-variant hover:border-primary/20'
                }`}
              >
                <span className="material-symbols-outlined text-sm">{style.icon}</span>
                <span className="font-headline text-[11px]">{t(`settings.imageStyles.${style.id}`)}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between mt-4 p-3 bg-surface-container-high/40 rounded-sm border border-outline-variant/10">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-sm text-primary-dim">dark_mode</span>
              <div>
                <p className="font-headline text-tertiary text-sm">{t('settings.darkPalette')}</p>
                <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest mt-0.5">
                  {t('settings.darkPaletteDesc')}
                </p>
              </div>
            </div>
            <Toggle
              checked={!!dmSettings.darkPalette}
              onClick={() => updateDMSettings({ darkPalette: !dmSettings.darkPalette })}
            />
          </div>
        </div>
      )}

      <div className="bg-surface-container-high/40 p-6 rounded-sm border-b border-outline-variant/15 group hover:bg-surface-container-high transition-colors col-span-1 md:col-span-2">
        <Slider
          label={t('settings.narratorSeriousness')}
          description={t('settings.narratorSeriousnessDesc')}
          value={seriousnessValue}
          onChange={(v) => updateDMSettings({ narratorSeriousness: v })}
          displayValue={`${seriousnessValue}% — ${seriousnessLabel}`}
        />
      </div>

      <div className="bg-surface-container-high/40 p-6 rounded-sm border-b border-outline-variant/15 flex items-center justify-between group hover:bg-surface-container-high transition-colors">
        <div>
          <p className="font-headline text-tertiary">{t('settings.canvasEffects')}</p>
          <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest mt-1">
            {t('settings.canvasEffectsDesc')}
          </p>
        </div>
        <Toggle
          checked={settings.canvasEffectsEnabled !== false}
          onClick={() => updateSettings({ canvasEffectsEnabled: !settings.canvasEffectsEnabled })}
        />
      </div>

      <div className="bg-surface-container-high/40 p-6 rounded-sm border-b border-outline-variant/15 flex items-center justify-between group hover:bg-surface-container-high transition-colors">
        <div>
          <p className="font-headline text-tertiary">{t('settings.itemImages')}</p>
          <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest mt-1">
            {t('settings.itemImagesDesc')}
          </p>
        </div>
        <Toggle
          checked={settings.itemImagesEnabled !== false}
          onClick={() => updateSettings({ itemImagesEnabled: !(settings.itemImagesEnabled !== false) })}
        />
      </div>

      <div className="bg-surface-container-high/40 p-6 rounded-sm border-b border-outline-variant/15 flex items-center justify-between group hover:bg-surface-container-high transition-colors">
        <div>
          <p className="font-headline text-tertiary">{t('settings.needsSystem')}</p>
          <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest mt-1">
            {t('settings.needsSystemDesc')}
          </p>
        </div>
        <Toggle
          checked={!!settings.needsSystemEnabled}
          onClick={() => updateSettings({ needsSystemEnabled: !settings.needsSystemEnabled })}
        />
      </div>
    </div>
  );
}
