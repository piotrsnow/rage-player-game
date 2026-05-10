// Top bar — breadcrumb (campaign name + scene count) + tab switcher + global
// actions (Validate report, manual snapshot).

import { useState } from 'react';
import { useAdminPanelStore } from '../../../stores/adminPanelStore';
import ConsistencyReportModal from './shared/ConsistencyReportModal';

export default function AdminWorkspaceHeader({ tabs, activeTabKey, campaign, onSelectTab }) {
  const validate = useAdminPanelStore((s) => s.validate);
  const validating = useAdminPanelStore((s) => s.validating);
  const lastValidationReport = useAdminPanelStore((s) => s.lastValidationReport);
  const createManualSnapshot = useAdminPanelStore((s) => s.createManualSnapshot);
  const currentCampaignId = useAdminPanelStore((s) => s.currentCampaignId);

  const [reportOpen, setReportOpen] = useState(false);

  async function runValidate() {
    const r = await validate();
    if (r) setReportOpen(true);
  }

  async function takeSnapshot() {
    const reason = window.prompt('Opis snapshotu (opcjonalnie):', '');
    if (reason === null) return;
    await createManualSnapshot(reason);
    window.alert('Snapshot zapisany.');
  }

  return (
    <header className="flex flex-col border-b border-slate-800 bg-slate-900/30">
      <div className="flex items-center justify-between gap-4 px-6 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wider text-slate-500">Admin / Kampania</div>
          <div className="truncate text-base font-semibold text-slate-100">
            {campaign?.name || 'Wybierz kampanię'}
            {campaign && (
              <span className="ml-2 text-xs font-normal text-slate-500">
                {campaign.id}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={!currentCampaignId || validating}
            onClick={runValidate}
            className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {validating ? 'Sprawdzam…' : 'Walidacja'}
            {lastValidationReport && !validating && (
              <span className="ml-2 text-xs">
                ({lastValidationReport.summary.errors}E / {lastValidationReport.summary.warnings}W)
              </span>
            )}
          </button>
          <button
            type="button"
            disabled={!currentCampaignId}
            onClick={takeSnapshot}
            className="rounded border border-emerald-700 bg-emerald-700/30 px-3 py-1.5 text-sm text-emerald-100 hover:bg-emerald-700/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Zapisz snapshot
          </button>
        </div>
      </div>
      <nav className="flex flex-wrap gap-1 px-6 pb-2">
        {tabs.map((t) => {
          const active = t.key === activeTabKey;
          return (
            <button
              key={t.key}
              type="button"
              disabled={!currentCampaignId}
              onClick={() => onSelectTab(t.key)}
              className={[
                'rounded-t border-b-2 px-3 py-1.5 text-sm transition-colors',
                active
                  ? 'border-emerald-500 text-emerald-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200',
                !currentCampaignId && 'cursor-not-allowed opacity-40',
              ].filter(Boolean).join(' ')}
            >
              {t.label}
            </button>
          );
        })}
      </nav>
      {reportOpen && lastValidationReport && (
        <ConsistencyReportModal
          report={lastValidationReport}
          onClose={() => setReportOpen(false)}
        />
      )}
    </header>
  );
}
