// Quests tab — left list of quests, right pane with form + objectives + prereqs.

import { useState, useEffect } from 'react';
import EntityForm from '../shared/EntityForm';
import { questFields, objectiveFields } from '../entityConfigs';
import { adminApi } from '../shared/adminApi';
import { useAdminPanelStore } from '../../../../stores/adminPanelStore';

export default function QuestsTab({ campaign }) {
  const refreshCurrent = useAdminPanelStore((s) => s.refreshCurrent);
  const validate = useAdminPanelStore((s) => s.validate);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);

  const quests = campaign.quests || [];
  const allQuests = quests; // for prereq picker

  async function loadDetail(questId) {
    if (!questId) return;
    const q = await adminApi.getQuest(campaign.campaign.id, questId);
    setDetail(q);
  }

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId]);

  async function handleSaveQuest(diff) {
    setBusy(true);
    try {
      await adminApi.patchQuest(campaign.campaign.id, selectedId, diff);
      await Promise.all([refreshCurrent(), loadDetail(selectedId)]);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteQuest() {
    if (!window.confirm(`Usunąć quest "${detail?.name}"?`)) return;
    setBusy(true);
    try {
      await adminApi.deleteQuest(campaign.campaign.id, selectedId);
      setSelectedId(null);
      setDetail(null);
      await refreshCurrent();
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateQuest() {
    const name = window.prompt('Nazwa nowego questa:');
    if (!name) return;
    const questIdSlug = name.toLowerCase().replace(/\s+/g, '_').slice(0, 60);
    setBusy(true);
    try {
      const created = await adminApi.createQuest(campaign.campaign.id, {
        name, questId: questIdSlug, type: 'side', status: 'active',
      });
      setSelectedId(created.id);
      await refreshCurrent();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full gap-4">
      {/* Quest list */}
      <div className="w-72 shrink-0 overflow-y-auto rounded border border-slate-800 bg-slate-900/30">
        <div className="border-b border-slate-800 p-2">
          <button
            type="button"
            onClick={handleCreateQuest}
            className="w-full rounded border border-emerald-700 bg-emerald-700/30 px-2 py-1 text-xs text-emerald-100 hover:bg-emerald-700/50"
          >
            + Nowy quest
          </button>
        </div>
        <ul>
          {quests.length === 0 && (
            <li className="px-3 py-4 text-xs text-slate-500">Brak questów.</li>
          )}
          {quests.map((q) => {
            const active = q.id === selectedId;
            return (
              <li key={q.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(q.id)}
                  className={[
                    'block w-full border-b border-slate-800/60 px-3 py-2 text-left',
                    active ? 'bg-emerald-700/20 text-emerald-200' : 'text-slate-200 hover:bg-slate-800/50',
                  ].join(' ')}
                >
                  <div className="truncate text-sm font-medium">{q.name}</div>
                  <div className="text-[11px] text-slate-500">
                    {q.type} · {q.status}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Detail pane */}
      <div className="flex-1 overflow-y-auto">
        {!detail && (
          <div className="rounded border border-slate-800 bg-slate-900/30 p-6 text-sm text-slate-400">
            Wybierz quest z listy.
          </div>
        )}
        {detail && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-100">{detail.name}</h2>
              <button
                type="button"
                onClick={handleDeleteQuest}
                className="rounded border border-red-700 bg-red-900/30 px-3 py-1.5 text-sm text-red-200 hover:bg-red-900/50"
              >
                Usuń quest
              </button>
            </div>

            <EntityForm
              fields={questFields}
              value={detail}
              onSave={handleSaveQuest}
              onValidate={validate}
              busy={busy}
            />

            <ObjectivesEditor
              campaignId={campaign.campaign.id}
              questId={detail.id}
              objectives={detail.objectives || []}
              onChange={() => loadDetail(selectedId)}
            />

            <PrerequisitesEditor
              campaignId={campaign.campaign.id}
              questId={detail.id}
              prerequisites={detail.prerequisites || []}
              allQuests={allQuests}
              onChange={() => loadDetail(selectedId)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ObjectivesEditor({ campaignId, questId, objectives, onChange }) {
  const [editing, setEditing] = useState(null); // objective row
  const [busy, setBusy] = useState(false);

  async function addObjective() {
    const description = window.prompt('Opis nowego celu:');
    if (!description) return;
    setBusy(true);
    try {
      await adminApi.createObjective(campaignId, questId, { description, status: 'pending' });
      await onChange();
    } finally {
      setBusy(false);
    }
  }

  async function saveObjective(diff) {
    if (!editing) return;
    setBusy(true);
    try {
      await adminApi.patchObjective(campaignId, questId, String(editing.id), diff);
      await onChange();
      setEditing(null);
    } finally {
      setBusy(false);
    }
  }

  async function deleteObjective(o) {
    if (!window.confirm(`Usunąć cel "${o.description.slice(0, 40)}"?`)) return;
    setBusy(true);
    try {
      await adminApi.deleteObjective(campaignId, questId, String(o.id));
      await onChange();
      if (editing?.id === o.id) setEditing(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded border border-slate-800 bg-slate-900/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Cele questu ({objectives.length})</h3>
        <button
          type="button"
          onClick={addObjective}
          className="rounded border border-emerald-700 bg-emerald-700/30 px-2 py-1 text-xs text-emerald-100 hover:bg-emerald-700/50"
        >
          + Dodaj cel
        </button>
      </div>
      <table className="w-full text-sm">
        <thead className="text-xs text-slate-400">
          <tr>
            <th className="py-1 text-left">#</th>
            <th className="py-1 text-left">Opis</th>
            <th className="py-1 text-left">Status</th>
            <th className="py-1 text-left">Progress</th>
            <th className="py-1 text-left">nodeKey</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {objectives.map((o) => (
            <tr key={o.id} className="border-t border-slate-800/60">
              <td className="py-1 text-slate-500">{o.displayOrder}</td>
              <td className="py-1 text-slate-200">{o.description}</td>
              <td className="py-1 text-slate-400">{o.status}</td>
              <td className="py-1 text-slate-400">{o.progress}/{o.targetAmount}</td>
              <td className="py-1 font-mono text-xs text-slate-500">{o.nodeKey || '—'}</td>
              <td className="py-1 text-right">
                <button
                  type="button"
                  onClick={() => setEditing(o)}
                  className="mr-1 rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-200 hover:bg-slate-800"
                >
                  Edytuj
                </button>
                <button
                  type="button"
                  onClick={() => deleteObjective(o)}
                  className="rounded border border-red-700 px-2 py-0.5 text-xs text-red-300 hover:bg-red-900/30"
                >
                  Usuń
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && (
        <div className="mt-4 rounded border border-slate-700 bg-slate-950/50 p-3">
          <div className="mb-2 text-xs text-slate-400">Edytujesz cel #{editing.displayOrder}</div>
          <EntityForm
            fields={objectiveFields}
            value={editing}
            onSave={saveObjective}
            busy={busy}
          />
        </div>
      )}
    </section>
  );
}

function PrerequisitesEditor({ campaignId, questId, prerequisites, allQuests, onChange }) {
  const [draft, setDraft] = useState(() => prerequisites.map((p) => p.prerequisiteId));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(prerequisites.map((p) => p.prerequisiteId));
  }, [prerequisites]);

  async function save() {
    setBusy(true);
    try {
      await adminApi.putPrerequisites(campaignId, questId, draft);
      await onChange();
    } finally {
      setBusy(false);
    }
  }

  function toggle(qid) {
    setDraft((d) => (d.includes(qid) ? d.filter((x) => x !== qid) : [...d, qid]));
  }

  return (
    <section className="rounded border border-slate-800 bg-slate-900/30 p-4">
      <h3 className="mb-2 text-sm font-semibold text-slate-200">Prerekwizyty ({draft.length})</h3>
      <div className="mb-3 text-xs text-slate-500">
        Zaznacz questy, które muszą zostać ukończone zanim ten quest stanie się aktywny.
        Walidator wykryje cykle.
      </div>
      <div className="max-h-56 overflow-y-auto rounded border border-slate-800 bg-slate-950 p-2 text-sm">
        {allQuests
          .filter((q) => q.id !== questId)
          .map((q) => (
            <label key={q.id} className="mb-0.5 flex items-center gap-2 rounded px-1 py-0.5 hover:bg-slate-800/50">
              <input
                type="checkbox"
                checked={draft.includes(q.id)}
                onChange={() => toggle(q.id)}
              />
              <span className="text-slate-200">{q.name}</span>
              <span className="text-xs text-slate-500">({q.status})</span>
            </label>
          ))}
        {allQuests.length <= 1 && (
          <div className="text-xs text-slate-500">Brak innych questów do wyboru.</div>
        )}
      </div>
      <div className="mt-2">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded border border-emerald-700 bg-emerald-700/30 px-3 py-1.5 text-sm text-emerald-100 hover:bg-emerald-700/50 disabled:opacity-50"
        >
          {busy ? 'Zapisuję…' : 'Zapisz prerekwizyty'}
        </button>
      </div>
    </section>
  );
}
