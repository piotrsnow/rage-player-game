import { useTranslation } from 'react-i18next';
import CustomSelect from '../../ui/CustomSelect';

const SLIDER_CLASS = 'flex-1 min-w-0 h-6 appearance-none mana-slider bg-transparent cursor-ew-resize touch-none';
const rangeValue = (e) => Number(e?.target?.value ?? 0);

function SliderRow({ label, min, max, step, value, onChange, formatValue, minWidth = '32px' }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-[10px] text-on-surface-variant/70 uppercase tracking-widest whitespace-nowrap">
        {label}
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(rangeValue(e))}
        onInput={(e) => onChange(rangeValue(e))}
        className={SLIDER_CLASS}
      />
      <span className="text-[10px] text-primary/80 font-label uppercase tracking-wider text-right" style={{ minWidth }}>
        {formatValue(value)}
      </span>
    </div>
  );
}

export default function SummaryOptionsPanel({
  summaryOptions,
  onSummaryOptionsChange,
  sentencesPerScene,
  onSentencesPerSceneChange,
}) {
  const { t } = useTranslation();
  const summaryMode = summaryOptions?.mode || 'story';
  const literaryStyle = Number.isFinite(Number(summaryOptions?.literaryStyle)) ? Number(summaryOptions.literaryStyle) : 50;
  const dramaticity = Number.isFinite(Number(summaryOptions?.dramaticity)) ? Number(summaryOptions.dramaticity) : 50;
  const factuality = Number.isFinite(Number(summaryOptions?.factuality)) ? Number(summaryOptions.factuality) : 50;
  const dialogueParticipants = Number.isFinite(Number(summaryOptions?.dialogueParticipants)) ? Number(summaryOptions.dialogueParticipants) : 3;

  const updateOption = (key) => (v) => {
    onSummaryOptionsChange?.((prev) => ({ ...prev, [key]: v }));
  };

  return (
    <>
      <div className="mt-3 flex items-center gap-3">
        <label className="text-[10px] text-on-surface-variant/70 uppercase tracking-widest whitespace-nowrap">
          {t('gameplay.summarySentencesPerScene', 'Sentences per scene')}
        </label>
        <input
          type="range"
          min={0.25}
          max={4}
          step={0.25}
          value={sentencesPerScene}
          onChange={(e) => onSentencesPerSceneChange?.(rangeValue(e))}
          onInput={(e) => onSentencesPerSceneChange?.(rangeValue(e))}
          className={SLIDER_CLASS}
        />
        <span className="text-[10px] text-primary/80 font-label uppercase tracking-wider min-w-[44px] text-right">
          {Number(sentencesPerScene).toFixed(2)}x
        </span>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <label className="text-[10px] text-on-surface-variant/70 uppercase tracking-widest whitespace-nowrap">
          {t('gameplay.summaryMode', 'Type')}
        </label>
        <CustomSelect
          value={summaryMode}
          onChange={(nextMode) => onSummaryOptionsChange?.((prev) => ({ ...prev, mode: nextMode }))}
          options={[
            { value: 'story', label: t('gameplay.summaryModeStory', 'Story') },
            { value: 'dialogue', label: t('gameplay.summaryModeDialogue', 'Dialogue') },
            { value: 'poem', label: t('gameplay.summaryModePoem', 'Poem') },
            { value: 'report', label: t('gameplay.summaryModeReport', 'Report') },
          ]}
          className="flex-1"
          buttonClassName="text-xs py-1.5"
          menuClassName="text-xs"
        />
      </div>

      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
        <SliderRow
          label={t('gameplay.summaryLiteraryStyle', 'Literary style')}
          min={0} max={100} step={1}
          value={literaryStyle}
          onChange={updateOption('literaryStyle')}
          formatValue={(v) => Math.round(v)}
        />
        <SliderRow
          label={t('gameplay.summaryDramaticity', 'Dramaticity')}
          min={0} max={100} step={1}
          value={dramaticity}
          onChange={updateOption('dramaticity')}
          formatValue={(v) => Math.round(v)}
        />
        <SliderRow
          label={t('gameplay.summaryFactuality', 'Factuality')}
          min={0} max={100} step={1}
          value={factuality}
          onChange={updateOption('factuality')}
          formatValue={(v) => Math.round(v)}
        />
        <SliderRow
          label={t('gameplay.summaryDialogueParticipants', 'Dialogue participants')}
          min={2} max={6} step={1}
          value={dialogueParticipants}
          onChange={updateOption('dialogueParticipants')}
          formatValue={(v) => Math.round(v)}
        />
      </div>
    </>
  );
}
