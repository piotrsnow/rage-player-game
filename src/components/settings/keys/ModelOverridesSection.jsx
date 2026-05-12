import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AI_TASK_CATEGORIES } from '../../../../shared/domain/aiTaskCategories.js';
import { apiClient } from '../../../services/apiClient';
import { AI_MODELS } from '../../../services/ai/models';

const PROVIDERS = [
  { key: 'openai', label: 'OpenAI' },
  { key: 'anthropic', label: 'Anthropic' },
];

const ACTIVE_TASKS = AI_TASK_CATEGORIES.filter((category) => !category.legacy);

const PROVIDER_MODELS = {
  openai: AI_MODELS.filter((model) => model.provider === 'openai'),
  anthropic: AI_MODELS.filter((model) => model.provider === 'anthropic'),
};

const GROUP_STYLES = {
  Scenes:           { icon: 'theaters',        cls: 'text-amber-400 bg-amber-400/10 border-amber-400/25 hover:bg-amber-400/20' },
  Campaigns:        { icon: 'auto_stories',    cls: 'text-indigo-400 bg-indigo-400/10 border-indigo-400/25 hover:bg-indigo-400/20' },
  Classifiers:      { icon: 'category',        cls: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/25 hover:bg-cyan-400/20' },
  Memory:           { icon: 'psychology',      cls: 'text-violet-400 bg-violet-400/10 border-violet-400/25 hover:bg-violet-400/20' },
  Images:           { icon: 'image',           cls: 'text-rose-400 bg-rose-400/10 border-rose-400/25 hover:bg-rose-400/20' },
  Creator:          { icon: 'draw',            cls: 'text-sky-400 bg-sky-400/10 border-sky-400/25 hover:bg-sky-400/20' },
  Combat:           { icon: 'swords',          cls: 'text-red-400 bg-red-400/10 border-red-400/25 hover:bg-red-400/20' },
  Quests:           { icon: 'flag',            cls: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/25 hover:bg-emerald-400/20' },
  'Living World':   { icon: 'public',          cls: 'text-teal-400 bg-teal-400/10 border-teal-400/25 hover:bg-teal-400/20' },
  Magic:            { icon: 'auto_awesome',    cls: 'text-purple-400 bg-purple-400/10 border-purple-400/25 hover:bg-purple-400/20' },
  Diagnostics:      { icon: 'bug_report',      cls: 'text-orange-400 bg-orange-400/10 border-orange-400/25 hover:bg-orange-400/20' },
  'Location Graph': { icon: 'hub',             cls: 'text-lime-400 bg-lime-400/10 border-lime-400/25 hover:bg-lime-400/20' },
  Travel:           { icon: 'directions_walk', cls: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/25 hover:bg-yellow-400/20' },
  Multiplayer:      { icon: 'groups',          cls: 'text-blue-400 bg-blue-400/10 border-blue-400/25 hover:bg-blue-400/20' },
  Characters:       { icon: 'person',          cls: 'text-pink-400 bg-pink-400/10 border-pink-400/25 hover:bg-pink-400/20' },
};

const FALLBACK_STYLE = { icon: 'token', cls: 'text-gray-400 bg-gray-400/10 border-gray-400/25 hover:bg-gray-400/20' };

function getGroupStyle(group) {
  return GROUP_STYLES[group] || FALLBACK_STYLE;
}

function fallbackModelFor(provider, task, modelConfig) {
  const tierModel = modelConfig.defaults?.[task.defaultTier]?.[provider];
  if (tierModel) return tierModel;
  return PROVIDER_MODELS[provider]?.[0]?.id || '';
}

function completeOverrides(rawOverrides, modelConfig) {
  const next = {};
  for (const task of ACTIVE_TASKS) {
    next[task.key] = {};
    for (const { key: provider } of PROVIDERS) {
      next[task.key][provider] = rawOverrides?.[task.key]?.[provider]
        || fallbackModelFor(provider, task, modelConfig);
    }
  }
  return next;
}

function buildPayload(overrides, modelConfig) {
  const payload = {};
  for (const task of ACTIVE_TASKS) {
    payload[task.key] = {};
    for (const { key: provider } of PROVIDERS) {
      payload[task.key][provider] = overrides?.[task.key]?.[provider]
        || fallbackModelFor(provider, task, modelConfig);
    }
  }
  return payload;
}

function uniqueModelsForProvider(provider, assignments) {
  const baseModels = PROVIDER_MODELS[provider] || [];
  const catalogIds = new Set(baseModels.map((model) => model.id));
  const customModels = [...new Set(Object.values(assignments).filter(Boolean))]
    .filter((id) => !catalogIds.has(id))
    .map((id) => ({ id, provider, label: id, cost: 'custom / env' }));
  return [...baseModels, ...customModels];
}

export default function ModelOverridesSection() {
  const { t } = useTranslation();
  const [overrides, setOverrides] = useState({});
  const [modelConfig, setModelConfig] = useState({ defaults: {} });
  const [provider, setProvider] = useState('openai');
  const [draggedTask, setDraggedTask] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [showEmpty, setShowEmpty] = useState(false);

  useEffect(() => {
    Promise.all([
      apiClient.get('/v1/admin/livingWorld/model-overrides'),
      apiClient.get('/ai/model-config'),
    ])
      .then(([savedOverrides, config]) => {
        const nextConfig = config || { defaults: {} };
        setModelConfig(nextConfig);
        setOverrides(completeOverrides(savedOverrides || {}, nextConfig));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const providerAssignments = useMemo(() => {
    const assignments = {};
    for (const task of ACTIVE_TASKS) {
      assignments[task.key] = overrides?.[task.key]?.[provider] || fallbackModelFor(provider, task, modelConfig);
    }
    return assignments;
  }, [modelConfig, overrides, provider]);

  const models = useMemo(
    () => uniqueModelsForProvider(provider, providerAssignments),
    [provider, providerAssignments],
  );

  const tasksByModel = useMemo(() => {
    const grouped = Object.fromEntries(models.map((model) => [model.id, []]));
    for (const task of ACTIVE_TASKS) {
      const modelId = providerAssignments[task.key];
      if (!grouped[modelId]) grouped[modelId] = [];
      grouped[modelId].push(task);
    }
    return grouped;
  }, [models, providerAssignments]);

  const { assignedModels, emptyModels } = useMemo(() => {
    const assigned = [];
    const empty = [];
    for (const model of models) {
      if ((tasksByModel[model.id] || []).length > 0) {
        assigned.push(model);
      } else {
        empty.push(model);
      }
    }
    return { assignedModels: assigned, emptyModels: empty };
  }, [models, tasksByModel]);

  const assignTask = (taskKey, modelId) => {
    if (!taskKey || !modelId) return;
    setOverrides((prev) => ({
      ...prev,
      [taskKey]: {
        ...(prev[taskKey] || {}),
        [provider]: modelId,
      },
    }));
    setSelectedTask(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setToast(null);
    try {
      const payload = buildPayload(overrides, modelConfig);
      await apiClient.put('/v1/admin/livingWorld/model-overrides', payload);
      setOverrides(payload);
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
        <span className="text-base">{t('keys.modelsLoading')}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-headline text-xl text-tertiary flex items-center gap-2">
            {t('keys.modelsTitle')}
          </h3>
          <p className="text-base text-on-surface-variant/70 mt-1 max-w-2xl leading-relaxed">
            {t('keys.modelsSubtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="shrink-0 px-6 py-3 rounded-sm bg-primary/15 border border-primary/30 text-primary text-base font-label uppercase tracking-wider hover:bg-primary/25 transition-colors disabled:opacity-40"
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

      <div className="flex flex-wrap gap-2">
        {PROVIDERS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              setProvider(item.key);
              setSelectedTask(null);
            }}
            className={`px-5 py-2.5 rounded-sm border text-base font-label uppercase tracking-wider transition-colors ${
              provider === item.key
                ? 'border-primary/40 bg-primary/15 text-primary'
                : 'border-outline-variant/15 bg-surface-container-lowest/40 text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {assignedModels.map((model) => (
          <ModelBox
            key={model.id}
            model={model}
            tasks={tasksByModel[model.id] || []}
            selectedTask={selectedTask}
            onTaskSelect={setSelectedTask}
            onAssign={(taskKey) => assignTask(taskKey, model.id)}
            onDragStart={setDraggedTask}
            onDragEnd={() => setDraggedTask(null)}
            onDrop={() => {
              assignTask(draggedTask, model.id);
              setDraggedTask(null);
            }}
          />
        ))}
      </div>

      {emptyModels.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowEmpty((v) => !v)}
            className="flex items-center gap-2 text-sm text-on-surface-variant/60 hover:text-on-surface-variant transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">
              {showEmpty ? 'expand_less' : 'expand_more'}
            </span>
            Unused models ({emptyModels.length})
          </button>

          {showEmpty && (
            <div className="grid gap-3 xl:grid-cols-3 mt-3 animate-fade-in">
              {emptyModels.map((model) => (
                <ModelBox
                  key={model.id}
                  model={model}
                  tasks={[]}
                  selectedTask={selectedTask}
                  onTaskSelect={setSelectedTask}
                  onAssign={(taskKey) => assignTask(taskKey, model.id)}
                  onDragStart={setDraggedTask}
                  onDragEnd={() => setDraggedTask(null)}
                  onDrop={() => {
                    assignTask(draggedTask, model.id);
                    setDraggedTask(null);
                  }}
                  compact
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ModelBox({ model, tasks, selectedTask, onTaskSelect, onAssign, onDragStart, onDragEnd, onDrop, compact }) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false);
      }}
      onDrop={() => { setDragOver(false); onDrop(); }}
      className={`rounded-sm border p-5 transition-all ${
        dragOver
          ? 'border-primary/50 bg-primary/5 shadow-[0_0_12px_rgba(197,154,255,0.15)]'
          : 'border-outline-variant/15 bg-surface-container-lowest/35 hover:border-primary/25'
      } ${compact ? '' : 'min-h-44'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-headline text-lg text-on-surface">{model.label}</h4>
          <p className="text-sm text-on-surface-variant/60 font-mono">{model.id}</p>
          {!compact && <p className="text-sm text-on-surface-variant/45 mt-0.5">{model.cost}</p>}
        </div>
        <span className="text-sm px-2.5 py-1 rounded-sm bg-primary/10 text-primary border border-primary/15 font-medium tabular-nums">
          {tasks.length}
        </span>
      </div>

      {selectedTask && (
        <button
          type="button"
          onClick={() => onAssign(selectedTask)}
          className="mt-3 w-full px-3 py-2.5 rounded-sm bg-primary/10 border border-primary/20 text-primary text-sm font-label uppercase tracking-wider hover:bg-primary/15"
        >
          Assign selected here
        </button>
      )}

      <div className="flex flex-wrap gap-2 mt-4">
        {tasks.length === 0 && !compact && (
          <span className="text-sm text-on-surface-variant/40 italic">Drop query types here</span>
        )}
        {tasks.map((task) => {
          const style = getGroupStyle(task.group);
          return (
            <button
              key={task.key}
              type="button"
              draggable
              onClick={() => onTaskSelect(task.key)}
              onDragStart={() => onDragStart(task.key)}
              onDragEnd={onDragEnd}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-sm border text-sm cursor-grab active:cursor-grabbing ${style.cls}`}
              title={task.description}
            >
              <span className="material-symbols-outlined text-[16px]">{style.icon}</span>
              {task.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
