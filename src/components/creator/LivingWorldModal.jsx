import { useTranslation } from 'react-i18next';
import Slider from '../ui/Slider';

/**
 * @deprecated Living World creation settings are no longer exposed from the campaign creator menu.
 * Keep this component only as a reference while the old modal flow is retired.
 */
export default function LivingWorldModal({ enabled, onEnabledChange, worldTimeRatio, onWorldTimeRatioChange, worldTimeMaxGapDays, onWorldTimeMaxGapDaysChange, disabled, onClose }) {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="bg-surface-container border border-outline-variant/20 rounded-sm shadow-xl w-full max-w-lg mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-tertiary text-2xl">public</span>
            <h2 className="font-headline text-xl text-on-surface">Living World</h2>
            <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded-sm bg-tertiary/20 text-tertiary border border-tertiary/30">
              Experimental
            </span>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <label className="flex items-start gap-3 cursor-pointer mb-6">
          <input
            type="checkbox"
            className="mt-1 accent-tertiary"
            checked={!!enabled}
            disabled={disabled}
            onChange={(e) => onEnabledChange(e.target.checked)}
          />
          <div className="flex-1">
            <span className="font-label text-sm text-on-surface font-bold">
              {t('creator.livingWorldToggle', 'Enable Living World')}
            </span>
            <p className="text-on-surface-variant text-xs leading-relaxed mt-1">
              Ważni NPC i lokacje żyją między wizytami. Gdy opuścisz lokację, NPC zostaje zapauzowany i „żyje dalej" po powrocie (zależnie od upływu czasu). Świat persystuje między Twoimi kampaniami.
            </p>
          </div>
        </label>

        {enabled && !disabled && (
          <div className="border-t border-outline-variant/15 pt-5">
            <p className="text-on-surface-variant text-xs mb-4">
              Tempo upływu czasu w świecie gry względem realnego + maksymalna "dziura" gdy wracasz po przerwie.
            </p>
            <Slider
              label="Tempo czasu"
              description="1h realnego = N godzin w grze (domyślnie 24 → 1h real = 1 dzień gry)"
              min={1}
              max={72}
              value={worldTimeRatio}
              onChange={onWorldTimeRatioChange}
              displayValue={`${worldTimeRatio}×`}
            />
            <Slider
              label="Maks. offline gap"
              description="Ile dni gry maksymalnie upływa gdy wracasz po długiej przerwie"
              min={1}
              max={30}
              value={worldTimeMaxGapDays}
              onChange={onWorldTimeMaxGapDaysChange}
              displayValue={`${worldTimeMaxGapDays} dni`}
            />
          </div>
        )}

        <div className="flex justify-end mt-4">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-sm font-label text-sm border bg-surface-tint text-on-primary border-primary transition-all duration-300 hover:shadow-[0_0_20px_rgba(197,154,255,0.3)]"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
