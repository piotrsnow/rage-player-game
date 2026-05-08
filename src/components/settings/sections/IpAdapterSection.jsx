import { useTranslation } from 'react-i18next';
import Toggle from '../../ui/Toggle';
import { QUALITY_SD_PARAMS, RESOLUTION_PRESETS } from '../../../services/imagePrompts';

const QUALITY_LEVELS = ['speed', 'balanced', 'quality'];
const RESOLUTION_LEVELS = ['low', 'base', 'high'];

const QUALITY_ICONS = { speed: 'bolt', balanced: 'tune', quality: 'auto_awesome' };
const RESOLUTION_ICONS = { low: 'photo_size_select_small', base: 'photo_size_select_large', high: 'high_quality' };

function roundTo8(v) {
  return Math.max(256, Math.round(v / 8) * 8);
}

export default function IpAdapterSection({ settings, updateSettings }) {
  const { t } = useTranslation();

  const ipaEnabled = settings.sdWebuiIpaEnabled ?? (settings.sdWebuiIpaMode !== 'off');
  const qualityPreset = settings.sdWebuiQualityPreset || 'balanced';
  const resPreset = settings.imageResolutionPreset || 'base';
  const resMul = RESOLUTION_PRESETS[resPreset] ?? 1;
  const effectiveW = roundTo8(1344 * resMul);
  const effectiveH = roundTo8(512 * resMul);
  const hintKey = ipaEnabled ? 'ipaOn' : 'ipaOff';

  function selectQuality(level) {
    updateSettings({
      sdWebuiQualityPreset: level,
      sdWebuiIpaMode: ipaEnabled ? level : 'off',
    });
  }

  function selectResolution(level) {
    updateSettings({
      imageResolutionPreset: level,
      imageResolutionMultiplier: RESOLUTION_PRESETS[level],
    });
  }

  function toggleIpa() {
    const next = !ipaEnabled;
    updateSettings({
      sdWebuiIpaEnabled: next,
      sdWebuiIpaMode: next ? qualityPreset : 'off',
    });
  }

  return (
    <div className="bg-surface-container-high/60 backdrop-blur-xl px-5 py-4 rounded-sm space-y-3">
      {/* Row 1: Quality (steps/cfg) */}
      <div className="flex items-center gap-5 flex-wrap">
        <div className="flex items-center gap-3 shrink-0">
          <span className="font-headline text-tertiary text-sm whitespace-nowrap">
            {t('imageConfig.qualityLine.title')}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Toggle checked={ipaEnabled} onClick={toggleIpa} />
          <span className={`text-xs font-label transition-colors ${ipaEnabled ? 'text-primary' : 'text-on-surface-variant/60'}`}>
            {t('imageConfig.qualityLine.ipa')}
          </span>
        </div>

        <div className="flex gap-1.5 ml-auto">
          {QUALITY_LEVELS.map((level) => {
            const params = QUALITY_SD_PARAMS[level];
            return (
              <button
                key={level}
                onClick={() => selectQuality(level)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-label transition-all ${
                  qualityPreset === level
                    ? 'bg-primary/20 text-primary ring-1 ring-primary/40'
                    : 'bg-surface-container-highest/40 text-on-surface-variant hover:bg-surface-container-highest/60'
                }`}
              >
                <span className="material-symbols-outlined text-sm">{QUALITY_ICONS[level]}</span>
                <span>{t(`imageConfig.qualityLine.${level}`)}</span>
                <span className="text-[10px] opacity-60">
                  {t(`imageConfig.qualityLine.${level}Hint_${hintKey}`, { steps: params.steps, cfg: params.cfg })}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Row 2: Resolution (multiplier) */}
      <div className="flex items-center gap-5 flex-wrap">
        <div className="flex items-center gap-3 shrink-0">
          <span className="font-headline text-tertiary text-sm whitespace-nowrap">
            {t('imageConfig.resolutionLine.title')}
          </span>
          <span className="text-[11px] text-on-surface-variant/60 font-mono tabular-nums whitespace-nowrap">
            {effectiveW}×{effectiveH}
          </span>
        </div>

        <div className="flex gap-1.5 ml-auto">
          {RESOLUTION_LEVELS.map((level) => {
            const mul = RESOLUTION_PRESETS[level];
            const w = roundTo8(1344 * mul);
            const h = roundTo8(512 * mul);
            return (
              <button
                key={level}
                onClick={() => selectResolution(level)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-label transition-all ${
                  resPreset === level
                    ? 'bg-primary/20 text-primary ring-1 ring-primary/40'
                    : 'bg-surface-container-highest/40 text-on-surface-variant hover:bg-surface-container-highest/60'
                }`}
              >
                <span className="material-symbols-outlined text-sm">{RESOLUTION_ICONS[level]}</span>
                <span>{t(`imageConfig.resolutionLine.${level}`)}</span>
                <span className="text-[10px] opacity-60">{w}×{h}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
