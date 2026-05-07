import { useTranslation } from 'react-i18next';
import Toggle from '../../ui/Toggle';

const QUALITY_LEVELS = ['speed', 'balanced', 'quality'];

const QUALITY_ICONS = { speed: 'bolt', balanced: 'tune', quality: 'auto_awesome' };

const RESOLUTION_BY_PRESET = { speed: 0.25, balanced: 0.5, quality: 1 };

function roundTo8(v) {
  return Math.max(256, Math.round(v / 8) * 8);
}

export default function IpAdapterSection({ settings, updateSettings }) {
  const { t } = useTranslation();

  const ipaEnabled = settings.sdWebuiIpaEnabled ?? (settings.sdWebuiIpaMode !== 'off');
  const preset = settings.sdWebuiQualityPreset || 'balanced';
  const resMul = RESOLUTION_BY_PRESET[preset] ?? 0.5;
  const effectiveW = roundTo8(1344 * resMul);
  const effectiveH = roundTo8(512 * resMul);
  const hintKey = ipaEnabled ? 'ipaOn' : 'ipaOff';

  function selectPreset(level) {
    updateSettings({
      sdWebuiQualityPreset: level,
      imageResolutionMultiplier: RESOLUTION_BY_PRESET[level],
      sdWebuiIpaMode: ipaEnabled ? level : 'off',
    });
  }

  function toggleIpa() {
    const next = !ipaEnabled;
    updateSettings({
      sdWebuiIpaEnabled: next,
      sdWebuiIpaMode: next ? preset : 'off',
    });
  }

  return (
    <div className="bg-surface-container-high/60 backdrop-blur-xl px-5 py-4 rounded-sm">
      <div className="flex items-center gap-5 flex-wrap">
        <div className="flex items-center gap-3 shrink-0">
          <span className="font-headline text-tertiary text-sm whitespace-nowrap">
            {t('imageConfig.qualityLine.title')}
          </span>
          <span className="text-[11px] text-on-surface-variant/60 font-mono tabular-nums whitespace-nowrap">
            {effectiveW}×{effectiveH}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Toggle checked={ipaEnabled} onClick={toggleIpa} />
          <span className={`text-xs font-label transition-colors ${ipaEnabled ? 'text-primary' : 'text-on-surface-variant/60'}`}>
            {t('imageConfig.qualityLine.ipa')}
          </span>
        </div>

        <div className="flex gap-1.5 ml-auto">
          {QUALITY_LEVELS.map((level) => (
            <button
              key={level}
              onClick={() => selectPreset(level)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-label transition-all ${
                preset === level
                  ? 'bg-primary/20 text-primary ring-1 ring-primary/40'
                  : 'bg-surface-container-highest/40 text-on-surface-variant hover:bg-surface-container-highest/60'
              }`}
            >
              <span className="material-symbols-outlined text-sm">{QUALITY_ICONS[level]}</span>
              <span>{t(`imageConfig.qualityLine.${level}`)}</span>
              <span className="text-[10px] opacity-60">
                {t(`imageConfig.qualityLine.${level}Hint_${hintKey}`)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
