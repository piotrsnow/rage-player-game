import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../../services/apiClient';
import { AI_MODELS } from '../../../services/ai/models';

const TASK_CATEGORIES = [
  {
    key: 'sceneGeneration',
    labelKey: 'keys.taskSceneGeneration',
    defaultTier: 'premium',
    icon: 'auto_stories',
    calls: [
      'Solo scene stream (streamingClient)',
      'Short narrative / combat fast-path',
      'Combat commentary',
      'Yassato cameo',
    ],
  },
  {
    key: 'campaignGeneration',
    labelKey: 'keys.taskCampaignGeneration',
    defaultTier: 'premium',
    icon: 'map',
    calls: ['Campaign bootstrap stream'],
  },
  {
    key: 'intentClassification',
    labelKey: 'keys.taskIntentClassification',
    defaultTier: 'nano',
    icon: 'category',
    calls: [
      'Intent classifier / nanoSelector',
      'Translate image prompt',
      'Quest wrap-up fallback',
    ],
  },
  {
    key: 'memoryExtraction',
    labelKey: 'keys.taskMemoryExtraction',
    defaultTier: 'nanoReasoning',
    icon: 'neurology',
    calls: [
      'Memory compressor (running summary)',
      'DM memory updater',
      'Post-campaign fact extraction',
      'Offline summarizer',
      'Location summary',
    ],
  },
  {
    key: 'imagePrompt',
    labelKey: 'keys.taskImagePrompt',
    defaultTier: 'nano / standard',
    icon: 'brush',
    calls: [
      'Image prompt generator (nano)',
      'Image prompt enhancer (standard)',
    ],
  },
  {
    key: 'auxiliary',
    labelKey: 'keys.taskAuxiliary',
    defaultTier: 'standard',
    icon: 'build',
    calls: [
      'Recap generator',
      'NPC dialog',
      'Quest objective verifier',
      'Story prompt',
      'Character legend',
      'Badge',
      'NPC promotion verdict',
      'NPC tick / quest audit / kill judge',
    ],
  },
];

const openaiModels = AI_MODELS.filter((m) => m.provider === 'openai');
const anthropicModels = AI_MODELS.filter((m) => m.provider === 'anthropic');

export default function ModelOverridesSection() {
  const { t } = useTranslation();
  const [overrides, setOverrides] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    apiClient.get('/v1/admin/livingWorld/model-overrides')
      .then((data) => setOverrides(data || {}))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (category, provider, value) => {
    setOverrides((prev) => ({
      ...prev,
      [category]: {
        ...(prev[category] || {}),
        [provider]: value,
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setToast(null);
    try {
      await apiClient.put('/v1/admin/livingWorld/model-overrides', overrides);
      setToast({ type: 'success', text: t('keys.modelsSaved') });
    } catch (err) {
      setToast({ type: 'error', text: err.message || t('keys.modelsSaveError') });
    }
    setSaving(false);
    setTimeout(() => setToast(null), 3000);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-on-surface-variant py-8">
        <span className="material-symbols-outlined animate-spin">progress_activity</span>
        <span className="text-sm">{t('keys.modelsLoading')}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-headline text-lg text-tertiary flex items-center gap-2">
            {t('keys.modelsTitle')}
          </h3>
          <p className="text-sm text-on-surface-variant/70 mt-1 max-w-xl leading-relaxed">
            {t('keys.modelsSubtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="shrink-0 px-5 py-2.5 rounded-sm bg-primary/15 border border-primary/30 text-primary text-sm font-label uppercase tracking-wider hover:bg-primary/25 transition-colors disabled:opacity-40"
        >
          {saving ? t('keys.modelsSaving') : t('keys.modelsSaveBtn')}
        </button>
      </div>

      {toast && (
        <div className={`text-sm px-4 py-2.5 rounded-sm border ${
          toast.type === 'success'
            ? 'bg-primary/10 border-primary/20 text-primary'
            : 'bg-error/10 border-error/20 text-error'
        }`}>
          {toast.text}
        </div>
      )}

      <div className="space-y-4">
        {TASK_CATEGORIES.map((cat) => (
          <CategoryCard
            key={cat.key}
            category={cat}
            value={overrides[cat.key] || {}}
            onChange={(provider, val) => handleChange(cat.key, provider, val)}
            t={t}
          />
        ))}
      </div>
    </div>
  );
}

function CategoryCard({ category, value, onChange, t }) {
  return (
    <div className="rounded-sm border border-outline-variant/15 bg-surface-container-lowest/30 p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-tertiary/70 mt-0.5">{category.icon}</span>
          <div>
            <h4 className="text-base font-headline text-on-surface flex items-center gap-2.5">
              {t(category.labelKey)}
              <span className="text-xs text-outline/60 font-label px-1.5 py-0.5 rounded-sm bg-outline/5 border border-outline/10">
                {category.defaultTier}
              </span>
            </h4>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {category.calls.map((call) => (
                <li key={call} className="text-xs text-on-surface-variant/50 flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-primary/30 shrink-0" />
                  {call}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <ModelSelect
          label="OpenAI"
          models={openaiModels}
          value={value.openai || ''}
          onChange={(v) => onChange('openai', v)}
          t={t}
        />
        <ModelSelect
          label="Anthropic"
          models={anthropicModels}
          value={value.anthropic || ''}
          onChange={(v) => onChange('anthropic', v)}
          t={t}
        />
      </div>
    </div>
  );
}

function ModelSelect({ label, models, value, onChange, t }) {
  return (
    <div>
      <label className="block text-xs text-on-surface-variant/60 font-label uppercase tracking-wider mb-1">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-sm bg-surface-container-lowest border border-outline-variant/15 rounded-sm px-3 py-2 text-on-surface focus:border-primary/40 focus:ring-0 focus:outline-none"
      >
        <option value="">{t('keys.modelsDefault')}</option>
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label} ({m.id})
          </option>
        ))}
      </select>
    </div>
  );
}
