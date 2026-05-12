import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useModalA11y } from '../../../hooks/useModalA11y';
import { apiClient } from '../../../services/apiClient';
import { OBJECTIVE_TYPES } from '../../../../shared/domain/questObjectiveTypes.js';

const TYPE_COLORS = {
  kill: 'border-red-500/40 bg-red-500/10 text-red-300',
  escort: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
  fetch: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  deliver: 'border-teal-500/40 bg-teal-500/10 text-teal-300',
  craft: 'border-orange-500/40 bg-orange-500/10 text-orange-300',
  explore: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  interact: 'border-violet-500/40 bg-violet-500/10 text-violet-300',
  survive: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
  gather: 'border-lime-500/40 bg-lime-500/10 text-lime-300',
};

export default function SelfQuestModal({ campaignId, onClose, onQuestAccepted }) {
  const { t } = useTranslation();
  const modalRef = useModalA11y(onClose);
  const [view, setView] = useState('form');
  const [description, setDescription] = useState('');
  const [requiredTypes, setRequiredTypes] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const toggleType = useCallback((type) => {
    setRequiredTypes((prev) =>
      prev.includes(type) ? prev.filter((v) => v !== type) : [...prev, type]
    );
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = description.trim();
    if (!trimmed || trimmed.length < 10 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const body = { description: trimmed };
      if (requiredTypes.length > 0) body.requiredTypes = requiredTypes;
      const data = await apiClient.post(`/ai/campaigns/${campaignId}/self-quest`, body);
      setResult(data);
      setView(data.approved ? 'success' : 'rejection');
    } catch (err) {
      setError(err.message || t('gameplay.selfQuestError'));
    } finally {
      setSubmitting(false);
    }
  }, [description, submitting, campaignId, requiredTypes, t]);

  const handleConfirmQuest = useCallback(() => {
    if (result?.quest && onQuestAccepted) {
      onQuestAccepted(result.quest);
    }
    onClose();
  }, [result, onQuestAccepted, onClose]);

  const resetToForm = useCallback(() => {
    setView('form');
    setDescription('');
    setRequiredTypes([]);
    setResult(null);
    setError(null);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={modalRef}
        className="relative w-full max-w-lg max-h-[80vh] bg-surface-container-highest/80 backdrop-blur-2xl border border-outline-variant/15 rounded-sm flex flex-col shadow-2xl animate-fade-in"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-outline-variant/15">
          <h2 className="font-headline text-base text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">add_task</span>
            {t('gameplay.selfQuestTitle')}
          </h2>
          <button onClick={onClose} aria-label={t('gameplay.incidentClose')} className="text-on-surface-variant hover:text-primary transition-colors p-1">
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
          {view === 'form' && (
            <div className="space-y-4">
              <p className="text-xs text-on-surface-variant/70 leading-relaxed">
                {t('gameplay.selfQuestHint')}
              </p>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.shiftKey && !e.ctrlKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSubmit();
                  }
                }}
                placeholder={t('gameplay.selfQuestPlaceholder')}
                disabled={submitting}
                rows={4}
                maxLength={500}
                className="w-full bg-surface-container/60 border border-outline-variant/20 rounded-sm px-3 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/40 resize-none disabled:opacity-50"
              />
              {/* Objective type checkboxes */}
              <div className="space-y-1.5">
                <p className="text-[10px] text-on-surface-variant/50 uppercase tracking-widest font-label">
                  {t('gameplay.selfQuestTypesHint', { defaultValue: 'Wymagane typy celów (reszta losowana)' })}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {OBJECTIVE_TYPES.map((type) => {
                    const active = requiredTypes.includes(type);
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => toggleType(type)}
                        disabled={submitting}
                        className={`px-2 py-1 text-[10px] font-label uppercase tracking-wider rounded-sm border transition-all ${active ? TYPE_COLORS[type] : 'border-outline-variant/20 bg-surface-container/40 text-on-surface-variant/60 hover:border-outline-variant/40'}`}
                      >
                        {t(`quests.objectiveTypes.${type}`)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-on-surface-variant/40">Shift+Enter — wyślij</span>
                  <span className="text-[10px] text-on-surface-variant/60">{description.length}/500</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={onClose}
                    className="px-3 py-2 text-xs font-label text-on-surface-variant hover:text-on-surface bg-surface-container-high/40 hover:bg-surface-container-high border border-outline-variant/15 rounded-sm transition-all"
                  >
                    {t('gameplay.selfQuestCancel')}
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || description.trim().length < 10}
                    className="flex items-center gap-2 px-4 py-2 bg-primary/15 hover:bg-primary/25 border border-primary/30 rounded-sm text-primary text-sm font-label transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {submitting ? (
                      <>
                        <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                        {t('gameplay.selfQuestLoading')}
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-sm">send</span>
                        {t('gameplay.selfQuestSubmit')}
                      </>
                    )}
                  </button>
                </div>
              </div>
              {error && (
                <div className="text-xs text-error bg-error/10 border border-error/20 rounded-sm px-3 py-2">
                  {error}
                </div>
              )}
            </div>
          )}

          {view === 'success' && result?.quest && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-sm border bg-green-500/10 border-green-400/25 text-green-300">
                <span className="material-symbols-outlined text-lg">check_circle</span>
                <span className="text-sm font-label">{t('gameplay.selfQuestApproved')}</span>
              </div>

              {/* Quest card preview */}
              <div className="border border-primary/20 rounded-sm bg-primary/5 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-lg">assignment</span>
                  <h3 className="font-headline text-sm text-on-surface">{result.quest.name}</h3>
                  <span className="ml-auto text-[10px] font-label px-1.5 py-0.5 rounded-sm bg-primary/15 text-primary/80 uppercase tracking-widest">
                    {result.quest.type}
                  </span>
                </div>
                <p className="text-xs text-on-surface/80 leading-relaxed">{result.quest.description}</p>
                {result.quest.completionCondition && (
                  <p className="text-[11px] text-on-surface-variant/70 italic">
                    {result.quest.completionCondition}
                  </p>
                )}
                {result.quest.objectives?.length > 0 && (
                  <ul className="space-y-1 ml-1">
                    {result.quest.objectives.map((obj, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-on-surface/75">
                        <span className="material-symbols-outlined text-xs text-on-surface-variant/50 mt-0.5 shrink-0">radio_button_unchecked</span>
                        {obj.description}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 px-3 py-2 text-xs font-label text-on-surface-variant hover:text-on-surface bg-surface-container-high/40 hover:bg-surface-container-high border border-outline-variant/15 rounded-sm transition-all"
                >
                  {t('gameplay.selfQuestCancel')}
                </button>
                <button
                  onClick={handleConfirmQuest}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-label text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-sm transition-all"
                >
                  <span className="material-symbols-outlined text-sm">check</span>
                  {t('gameplay.selfQuestConfirm')}
                </button>
              </div>
            </div>
          )}

          {view === 'rejection' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-sm border bg-red-500/10 border-red-400/25 text-red-300">
                <span className="material-symbols-outlined text-lg">cancel</span>
                <span className="text-sm font-label">{t('gameplay.selfQuestRejected')}</span>
              </div>

              <div className="bg-surface-container/60 border border-outline-variant/15 rounded-sm px-4 py-3">
                <p className="text-sm text-on-surface/85 leading-relaxed">
                  {result?.reason}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 px-3 py-2 text-xs font-label text-on-surface-variant hover:text-on-surface bg-surface-container-high/40 hover:bg-surface-container-high border border-outline-variant/15 rounded-sm transition-all"
                >
                  {t('gameplay.selfQuestCancel')}
                </button>
                <button
                  onClick={resetToForm}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-label text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-sm transition-all"
                >
                  <span className="material-symbols-outlined text-sm">refresh</span>
                  {t('gameplay.selfQuestRetry')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
