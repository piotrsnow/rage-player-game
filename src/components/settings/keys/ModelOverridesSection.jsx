import { useEffect, useState } from 'react';
import { apiClient } from '../../../services/apiClient';
import { AI_MODELS } from '../../../services/ai/models';

const TASK_CATEGORIES = [
  {
    key: 'sceneGeneration',
    label: 'Generowanie scen',
    defaultTier: 'premium',
    calls: [
      'Solo scene stream (streamingClient)',
      'Short narrative / combat fast-path',
      'Combat commentary',
      'Yassato cameo',
    ],
  },
  {
    key: 'campaignGeneration',
    label: 'Generowanie kampanii',
    defaultTier: 'premium',
    calls: ['Campaign bootstrap stream'],
  },
  {
    key: 'intentClassification',
    label: 'Klasyfikacja intencji (nano)',
    defaultTier: 'nano',
    calls: [
      'Intent classifier / nanoSelector',
      'Translate image prompt',
      'Quest wrap-up fallback',
    ],
  },
  {
    key: 'memoryExtraction',
    label: 'Pamięć i ekstrakcja',
    defaultTier: 'nanoReasoning',
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
    label: 'Prompty do obrazów',
    defaultTier: 'nano / standard',
    calls: [
      'Image prompt generator (nano)',
      'Image prompt enhancer (standard)',
    ],
  },
  {
    key: 'auxiliary',
    label: 'Pomocnicze zapytania',
    defaultTier: 'standard',
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
      setToast({ type: 'success', text: 'Zapisano' });
    } catch (err) {
      setToast({ type: 'error', text: err.message || 'Błąd zapisu' });
    }
    setSaving(false);
    setTimeout(() => setToast(null), 3000);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-on-surface-variant py-4">
        <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
        <span className="text-xs">Ładowanie konfiguracji modeli…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-headline text-sm text-tertiary flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">tune</span>
            Przypisanie modeli do zadań
          </h3>
          <p className="text-[10px] text-on-surface-variant/60 mt-1">
            Wybierz model per-dostawca dla każdej kategorii zapytań AI.
            Puste pole = domyślny model z tieru.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-sm bg-primary/15 border border-primary/30 text-primary text-xs font-label uppercase tracking-wider hover:bg-primary/25 transition-colors disabled:opacity-40"
        >
          {saving ? 'Zapisuję…' : 'Zapisz'}
        </button>
      </div>

      {toast && (
        <div className={`text-xs px-3 py-2 rounded-sm border ${
          toast.type === 'success'
            ? 'bg-primary/10 border-primary/20 text-primary'
            : 'bg-error/10 border-error/20 text-error'
        }`}>
          {toast.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {TASK_CATEGORIES.map((cat) => (
          <CategoryCard
            key={cat.key}
            category={cat}
            value={overrides[cat.key] || {}}
            onChange={(provider, val) => handleChange(cat.key, provider, val)}
          />
        ))}
      </div>
    </div>
  );
}

function CategoryCard({ category, value, onChange }) {
  return (
    <div className="rounded-md border border-outline-variant/15 bg-surface-container-lowest/30 p-3 space-y-2">
      <div>
        <h4 className="text-xs font-headline text-on-surface flex items-center gap-2">
          {category.label}
          <span className="text-[9px] text-outline/50 font-label px-1 py-0.5 rounded-sm bg-outline/5 border border-outline/10">
            {category.defaultTier}
          </span>
        </h4>
        <ul className="mt-1 space-y-0.5">
          {category.calls.map((call) => (
            <li key={call} className="text-[9px] text-on-surface-variant/50 pl-2.5 relative before:content-['•'] before:absolute before:left-0 before:text-primary/30">
              {call}
            </li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <ModelSelect
          label="OpenAI"
          models={openaiModels}
          value={value.openai || ''}
          onChange={(v) => onChange('openai', v)}
        />
        <ModelSelect
          label="Anthropic"
          models={anthropicModels}
          value={value.anthropic || ''}
          onChange={(v) => onChange('anthropic', v)}
        />
      </div>
    </div>
  );
}

function ModelSelect({ label, models, value, onChange }) {
  return (
    <div>
      <label className="block text-[9px] text-outline/50 font-label uppercase tracking-wider mb-0.5">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-[11px] bg-surface-container-lowest border border-outline-variant/15 rounded-sm px-2 py-1 text-on-surface focus:border-primary/40 focus:ring-0 focus:outline-none"
      >
        <option value="">— domyślny (tier) —</option>
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label} ({m.id})
          </option>
        ))}
      </select>
    </div>
  );
}
