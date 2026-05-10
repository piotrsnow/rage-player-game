// Read-only browser of CampaignIncident entries (player complaints + verdicts).

import { useState } from 'react';
import RawJsonEditor from '../shared/RawJsonEditor';

export default function IncidentsTab({ campaign }) {
  const incidents = campaign.incidents || [];
  const [selected, setSelected] = useState(null);

  return (
    <div className="flex h-full gap-4">
      <div className="w-72 shrink-0 overflow-y-auto rounded border border-slate-800 bg-slate-900/30">
        <ul>
          {incidents.length === 0 && (
            <li className="px-3 py-4 text-xs text-slate-500">Brak skarg w tej kampanii.</li>
          )}
          {incidents.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                onClick={() => setSelected(i)}
                className={[
                  'block w-full border-b border-slate-800/60 px-3 py-2 text-left',
                  selected?.id === i.id ? 'bg-emerald-700/20 text-emerald-200' : 'text-slate-200 hover:bg-slate-800/50',
                ].join(' ')}
              >
                <div className="text-sm">
                  Scena #{i.sceneIndex} · {i.isPlayerRight ? '✓ wygrał' : '✗ przegrał'}
                </div>
                <div className="truncate text-[11px] text-slate-500">{i.playerComplaint}</div>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex-1 overflow-y-auto">
        {!selected && (
          <div className="rounded border border-slate-800 bg-slate-900/30 p-6 text-sm text-slate-400">
            Wybierz skargę.
          </div>
        )}
        {selected && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">Skarga · scena #{selected.sceneIndex}</h2>
              <div className="mt-1 text-xs text-slate-500">
                {new Date(selected.createdAt).toLocaleString()} · player right: {String(selected.isPlayerRight)} · world correction applied: {String(selected.worldCorrectionApplied)}
              </div>
            </div>
            <Section label="Skarga gracza"><Pre>{selected.playerComplaint}</Pre></Section>
            <Section label="Werdykt AI"><Pre>{selected.aiVerdict}</Pre></Section>
            {selected.narrativeComment && (
              <Section label="Komentarz narracyjny (providence)"><Pre>{selected.narrativeComment}</Pre></Section>
            )}
            {selected.technicalDetails && (
              <Section label="Technical details"><Pre>{selected.technicalDetails}</Pre></Section>
            )}
            <Section label="Corrections (JSON)">
              <RawJsonEditor value={selected.corrections} readOnly rows={12} />
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ label, children }) {
  return (
    <section className="rounded border border-slate-800 bg-slate-900/30 p-3">
      <div className="mb-2 text-xs uppercase tracking-wider text-slate-400">{label}</div>
      {children}
    </section>
  );
}
function Pre({ children }) {
  return <div className="whitespace-pre-wrap text-sm text-slate-200">{children}</div>;
}
