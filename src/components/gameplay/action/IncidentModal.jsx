import { useState, useCallback, useEffect, useRef, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useModalA11y } from '../../../hooks/useModalA11y';
import { apiClient } from '../../../services/apiClient';
import { NarrableText } from '../../ui/NarrableText';

const TechnicalDetailsBlock = memo(function TechnicalDetailsBlock({ details, t }) {
  const [open, setOpen] = useState(false);
  if (!details) return null;
  return (
    <div className="border border-outline-variant/10 rounded-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-label uppercase tracking-widest text-on-surface-variant/60 hover:text-on-surface-variant hover:bg-surface-container-high/30 transition-colors"
      >
        <span className="material-symbols-outlined text-xs">terminal</span>
        {t('gameplay.incidentTechnicalDetails')}
        <span className={`material-symbols-outlined text-xs ml-auto transition-transform ${open ? 'rotate-180' : ''}`}>expand_more</span>
      </button>
      {open && (
        <div className="px-3 py-2.5 border-t border-outline-variant/10 bg-surface-container/40">
          <pre className="text-[11px] text-on-surface-variant/80 leading-relaxed whitespace-pre-wrap font-mono">
            {details}
          </pre>
        </div>
      )}
    </div>
  );
});

// Buckets that backend (incidents.js) does NOT persist itself — they live
// FE-only (combat HUD, mapMode, narrativeState, transient effects, etc.).
// We dispatch APPLY_STATE_CHANGES for these after a positive verdict so the
// store mirrors them; backend-persisted buckets (character, quests, npcs,
// location, codex, knowledge) are picked up by the parent's refetch.
const FE_ONLY_CORRECTION_BUCKETS = [
  'combatUpdate',
  'factionChanges',
  'activeEffects',
  'mapMode',
  'narrativeState',
  'startTrade',
  'needsChanges',
  'timeAdvance',
];

function pickFeOnlyChanges(stateChanges) {
  if (!stateChanges || typeof stateChanges !== 'object') return null;
  const out = {};
  let hit = false;
  for (const key of FE_ONLY_CORRECTION_BUCKETS) {
    const v = stateChanges[key];
    if (v == null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) continue;
    out[key] = v;
    hit = true;
  }
  return hit ? out : null;
}

export default function IncidentModal({ campaignId, dispatch = null, onClose, onCorrectionsApplied, onProvidenceScene = null }) {
  const { t } = useTranslation();
  // Forward-ref to handleClose so useModalA11y (called before handleClose is
  // defined) can reach the up-to-date callback through a stable wrapper.
  const handleCloseRef = useRef(null);
  const modalRef = useModalA11y(() => handleCloseRef.current?.());
  const [view, setView] = useState('form'); // 'form' | 'verdict' | 'history'
  const [complaint, setComplaint] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [refetchTriggered, setRefetchTriggered] = useState(false);
  const [history, setHistory] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (view === 'form') textareaRef.current?.focus();
  }, [view]);

  // Server applied corrections atomically — we just refetch campaign state
  // so the FE store mirrors the new world. Single fire per result.
  // Also dispatch FE-only buckets that backend cannot persist (combat HUD,
  // mapMode, narrativeState, etc.) so the store reflects them after the
  // refetch overwrites the rest.
  useEffect(() => {
    if (!result || !result.appliedStateChanges || refetchTriggered) return;
    if (typeof onCorrectionsApplied === 'function') {
      onCorrectionsApplied();
    }
    if (typeof dispatch === 'function') {
      const feOnly = pickFeOnlyChanges(result.corrections?.stateChanges);
      if (feOnly) {
        dispatch({ type: 'APPLY_STATE_CHANGES', payload: feOnly });
      }
    }
    setRefetchTriggered(true);
  }, [result, refetchTriggered, onCorrectionsApplied, dispatch]);

  // Closing the modal after a positive verdict that produced concrete
  // corrections triggers a one-shot "providence" scene — backend signals
  // readiness via `result.providenceQueued` (set when correctionSummary was
  // non-empty AND pendingProvidence was persisted). Resetting to a new
  // report does NOT trigger; only actual close does.
  const handleClose = useCallback(() => {
    if (result?.providenceQueued && typeof onProvidenceScene === 'function') {
      try {
        onProvidenceScene();
      } catch {
        // non-fatal — modal still closes
      }
    }
    onClose();
  }, [result, onProvidenceScene, onClose]);
  handleCloseRef.current = handleClose;

  const handleSubmit = useCallback(async () => {
    if (!complaint.trim() || complaint.trim().length < 10 || submitting) return;
    setSubmitting(true);
    setError(null);
    setRefetchTriggered(false);
    try {
      const data = await apiClient.post(`/ai/campaigns/${campaignId}/incidents`, {
        complaint: complaint.trim(),
      });
      setResult(data);
      setView('verdict');
    } catch (err) {
      setError(err.message || 'Failed to submit incident');
    } finally {
      setSubmitting(false);
    }
  }, [complaint, submitting, campaignId]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const loadHistory = useCallback(async () => {
    if (loadingHistory) return;
    setLoadingHistory(true);
    setView('history');
    try {
      const data = await apiClient.get(`/ai/campaigns/${campaignId}/incidents`);
      setHistory(data.incidents || []);
    } catch (err) {
      setError(err.message || 'Failed to load history');
    } finally {
      setLoadingHistory(false);
    }
  }, [campaignId, loadingHistory]);

  const resetToForm = useCallback(() => {
    setView('form');
    setComplaint('');
    setResult(null);
    setError(null);
    setRefetchTriggered(false);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      <div
        ref={modalRef}
        className="relative w-full max-w-lg max-h-[80vh] bg-surface-container-highest/80 backdrop-blur-2xl border border-outline-variant/15 rounded-sm flex flex-col shadow-2xl animate-fade-in"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-outline-variant/15">
          <h2 className="font-headline text-base text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-400">warning</span>
            {view === 'history'
              ? t('gameplay.incidentHistoryTitle')
              : t('gameplay.incidentModalTitle')}
          </h2>
          <div className="flex items-center gap-1">
            {view !== 'history' && (
              <button
                onClick={loadHistory}
                className="text-xs font-label text-on-surface-variant hover:text-primary transition-colors px-2 py-1 rounded-sm hover:bg-primary/10"
              >
                <span className="material-symbols-outlined text-sm align-middle mr-1">history</span>
                {t('gameplay.incidentHistoryButton')}
              </button>
            )}
            {view === 'history' && (
              <button
                onClick={resetToForm}
                className="text-xs font-label text-on-surface-variant hover:text-primary transition-colors px-2 py-1 rounded-sm hover:bg-primary/10"
              >
                <span className="material-symbols-outlined text-sm align-middle mr-1">add</span>
                {t('gameplay.incidentNewReport')}
              </button>
            )}
            <button onClick={handleClose} aria-label={t('gameplay.incidentClose')} className="text-on-surface-variant hover:text-primary transition-colors p-1">
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 mr-3">
          {view === 'form' && (
            <div className="space-y-4">
              <textarea
                ref={textareaRef}
                value={complaint}
                onChange={(e) => setComplaint(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('gameplay.incidentPlaceholder')}
                disabled={submitting}
                rows={5}
                maxLength={2000}
                className="w-full bg-surface-container/60 border border-outline-variant/20 rounded-sm px-3 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary/40 resize-none disabled:opacity-50"
              />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-on-surface-variant/40">Shift+Enter — wyślij</span>
                  <span className="text-[10px] text-on-surface-variant/60">{complaint.length}/2000</span>
                </div>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || complaint.trim().length < 10}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/30 rounded-sm text-amber-300 text-sm font-label transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <>
                      <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                      {t('gameplay.incidentSubmitting')}
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-sm">send</span>
                      {t('gameplay.incidentSubmit')}
                    </>
                  )}
                </button>
              </div>
              {error && (
                <div className="text-xs text-error bg-error/10 border border-error/20 rounded-sm px-3 py-2">
                  {error}
                </div>
              )}
            </div>
          )}

          {view === 'verdict' && result && (
            <div className="space-y-4">
              <div className={`flex items-center gap-2 px-3 py-2.5 rounded-sm border ${
                result.isPlayerRight
                  ? 'bg-green-500/10 border-green-400/25 text-green-300'
                  : 'bg-red-500/10 border-red-400/25 text-red-300'
              }`}>
                <span className="material-symbols-outlined text-lg">
                  {result.isPlayerRight ? 'check_circle' : 'cancel'}
                </span>
                <span className="text-sm font-label">
                  {result.isPlayerRight
                    ? t('gameplay.incidentPlayerRight')
                    : t('gameplay.incidentPlayerWrong')}
                </span>
              </div>
              <div className="space-y-2">
                <h3 className="text-xs font-label uppercase tracking-widest text-on-surface-variant/70">
                  {t('gameplay.incidentVerdictTitle')}
                </h3>
                <p className="text-sm text-on-surface/90 leading-relaxed">
                  {result.aiVerdict}
                </p>
              </div>

              {/* Narrator comment with TTS */}
              {result.narrativeComment && (
                <div className="bg-primary/5 border border-primary/15 rounded-sm px-3 py-2.5 group/seg">
                  <div className="flex items-start gap-2">
                    <span className="material-symbols-outlined text-primary/60 text-sm mt-0.5 shrink-0">auto_stories</span>
                    <NarrableText text={result.narrativeComment} className="text-sm text-on-surface/85 leading-relaxed italic flex-1" />
                  </div>
                </div>
              )}

              {/* Corrections summary — list of human-readable changes the AI applied */}
              {result.isPlayerRight && Array.isArray(result.correctionSummary) && result.correctionSummary.length > 0 && (
                <div className="border border-green-400/20 rounded-sm bg-green-500/5 px-3 py-2.5 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-label uppercase tracking-widest text-green-300">
                    <span className="material-symbols-outlined text-xs">check_circle</span>
                    {t('gameplay.incidentCorrectionsApplied')}
                  </div>
                  <ul className="text-xs text-on-surface/80 space-y-1 ml-2">
                    {result.correctionSummary.map((line, i) => (
                      <li key={i} className="leading-relaxed flex gap-1.5">
                        <span className="text-green-400/70 shrink-0">•</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <TechnicalDetailsBlock details={result.technicalDetails} t={t} />
              <div className="text-[10px] text-on-surface-variant/50">
                {t('gameplay.incidentScene')} #{result.sceneIndex}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={resetToForm}
                  className="flex-1 px-3 py-2 text-xs font-label text-on-surface-variant hover:text-on-surface bg-surface-container-high/40 hover:bg-surface-container-high border border-outline-variant/15 rounded-sm transition-all"
                >
                  {t('gameplay.incidentNewReport')}
                </button>
                <button
                  onClick={handleClose}
                  className="flex-1 px-3 py-2 text-xs font-label text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-sm transition-all"
                >
                  {t('gameplay.incidentClose')}
                </button>
              </div>
            </div>
          )}

          {view === 'history' && (
            <div className="space-y-3">
              {loadingHistory && (
                <div className="flex items-center justify-center py-8 text-on-surface-variant/60">
                  <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
                </div>
              )}
              {!loadingHistory && history?.length === 0 && (
                <p className="text-sm text-on-surface-variant/60 text-center py-8">
                  {t('gameplay.incidentHistoryEmpty')}
                </p>
              )}
              {!loadingHistory && history?.map((inc) => (
                <div key={inc.id} className="border border-outline-variant/15 rounded-sm p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-on-surface-variant/60">
                      {t('gameplay.incidentScene')} #{inc.sceneIndex} — {new Date(inc.createdAt).toLocaleString()}
                    </span>
                    <span className={`text-[10px] font-label px-1.5 py-0.5 rounded-sm ${
                      inc.isPlayerRight
                        ? 'bg-green-500/15 text-green-300'
                        : 'bg-red-500/15 text-red-300'
                    }`}>
                      {inc.isPlayerRight ? '✓' : '✗'}
                    </span>
                  </div>
                  <p className="text-xs text-on-surface/80 leading-relaxed">
                    <span className="text-on-surface-variant/60 font-label">→ </span>
                    {inc.playerComplaint}
                  </p>
                  <p className="text-xs text-on-surface/70 leading-relaxed italic">
                    {inc.aiVerdict}
                  </p>
                  {inc.isPlayerRight && Array.isArray(inc.corrections?.summary) && inc.corrections.summary.length > 0 && (
                    <ul className="text-[11px] text-on-surface/70 space-y-0.5 ml-1">
                      {inc.corrections.summary.map((line, i) => (
                        <li key={i} className="leading-relaxed flex gap-1.5">
                          <span className="text-green-400/60 shrink-0">•</span>
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {inc.narrativeComment && (
                    <div className="bg-primary/5 border border-primary/10 rounded-sm px-2.5 py-2 group/seg">
                      <div className="flex items-start gap-2">
                        <span className="material-symbols-outlined text-primary/50 text-xs mt-0.5 shrink-0">auto_stories</span>
                        <NarrableText text={inc.narrativeComment} className="text-[11px] text-on-surface/70 leading-relaxed italic flex-1" />
                      </div>
                    </div>
                  )}
                  <TechnicalDetailsBlock details={inc.technicalDetails} t={t} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
