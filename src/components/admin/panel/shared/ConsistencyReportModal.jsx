// Modal showing the validator output. Errors and warnings are grouped, each
// issue can suggest an autoFix payload that the modal replays via apiClient.

import { createPortal } from 'react-dom';
import { useState } from 'react';
import { apiClient } from '../../../../services/apiClient';
import { useAdminPanelStore } from '../../../../stores/adminPanelStore';

export default function ConsistencyReportModal({ report, onClose }) {
  const refreshCurrent = useAdminPanelStore((s) => s.refreshCurrent);
  const validate = useAdminPanelStore((s) => s.validate);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  if (!report) return null;
  const { issues = [], summary = {} } = report;
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  async function applyFix(issue) {
    if (!issue.autoFix) return;
    setBusyId(`${issue.ruleId}:${issue.entityId}`);
    setError(null);
    try {
      await apiClient.request(issue.autoFix.path.replace(/^\/v1/, ''), {
        method: issue.autoFix.method,
        body: issue.autoFix.body,
      });
      await refreshCurrent();
      await validate();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusyId(null);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-3xl flex-col rounded-lg border border-slate-700 bg-slate-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-slate-100">Raport spójności</div>
            <div className="text-xs text-slate-400">
              {summary.errors || 0} błędów, {summary.warnings || 0} ostrzeżeń
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
          >
            Zamknij
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {issues.length === 0 && (
            <div className="rounded border border-emerald-700 bg-emerald-900/30 p-4 text-emerald-200">
              Brak wykrytych niespójności. Świat wygląda zdrowo.
            </div>
          )}
          {error && (
            <div className="rounded border border-red-700 bg-red-900/30 p-3 text-sm text-red-200">
              {error}
            </div>
          )}
          {errors.length > 0 && (
            <Section title="Błędy" tone="error" issues={errors} busyId={busyId} onFix={applyFix} />
          )}
          {warnings.length > 0 && (
            <Section title="Ostrzeżenia" tone="warning" issues={warnings} busyId={busyId} onFix={applyFix} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Section({ title, tone, issues, busyId, onFix }) {
  const colours = tone === 'error'
    ? 'border-red-700 bg-red-900/20 text-red-100'
    : 'border-amber-700 bg-amber-900/20 text-amber-100';
  return (
    <div>
      <div className="mb-2 text-xs uppercase tracking-wider text-slate-400">{title} ({issues.length})</div>
      <ul className="space-y-2">
        {issues.map((i, idx) => (
          <li key={idx} className={`rounded border p-3 text-sm ${colours}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-xs opacity-80">
                  {i.ruleId} · {i.entity} {i.entityId && <span className="opacity-60">({i.entityId})</span>}
                </div>
                <div className="mt-1">{i.message}</div>
              </div>
              {i.autoFix && (
                <button
                  type="button"
                  onClick={() => onFix(i)}
                  disabled={busyId === `${i.ruleId}:${i.entityId}`}
                  className="shrink-0 rounded border border-slate-600 bg-slate-900/50 px-2 py-1 text-xs text-slate-100 hover:bg-slate-800 disabled:opacity-50"
                >
                  {busyId === `${i.ruleId}:${i.entityId}` ? '…' : 'Auto-fix'}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
