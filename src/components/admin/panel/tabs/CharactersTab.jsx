// Characters tab. Each participant character can be edited via the FE-shape
// snapshot (scalars + skills + inventory + materials).

import { useState, useEffect } from 'react';
import ListDetailLayout from '../shared/ListDetailLayout';
import { adminApi } from '../shared/adminApi';
import { useAdminPanelStore } from '../../../../stores/adminPanelStore';

export default function CharactersTab({ campaign }) {
  const refreshCurrent = useAdminPanelStore((s) => s.refreshCurrent);
  const validate = useAdminPanelStore((s) => s.validate);
  const characters = campaign.characters || [];
  const [selectedId, setSelectedId] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!selectedId) { setSnapshot(null); setDraft(''); return; }
    setError(null);
    adminApi.getCharacter(selectedId).then((s) => {
      setSnapshot(s);
      setDraft(JSON.stringify(s, null, 2));
    });
  }, [selectedId]);

  async function save() {
    if (!selectedId) return;
    let parsed;
    try {
      parsed = JSON.parse(draft);
    } catch (err) {
      setError(`JSON parse: ${err.message}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await adminApi.putCharacter(selectedId, parsed, campaign.campaign.id);
      const fresh = await adminApi.getCharacter(selectedId);
      setSnapshot(fresh);
      setDraft(JSON.stringify(fresh, null, 2));
      await refreshCurrent();
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  }

  async function deleteItem(itemKey) {
    if (!window.confirm(`Usunąć item "${itemKey}"?`)) return;
    setBusy(true);
    try {
      await adminApi.deleteInventoryItem(selectedId, itemKey, campaign.campaign.id);
      const fresh = await adminApi.getCharacter(selectedId);
      setSnapshot(fresh);
      setDraft(JSON.stringify(fresh, null, 2));
      await refreshCurrent();
    } finally { setBusy(false); }
  }

  return (
    <ListDetailLayout
      items={characters}
      getKey={(c) => c.id}
      getLabel={(c) => c.name}
      getSublabel={(c) => `Lvl ${c.characterLevel} · ${c.species}`}
      selectedId={selectedId}
      onSelect={setSelectedId}
      emptyHint="Brak postaci w tej kampanii."
    >
      {snapshot && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-100">{snapshot.name}</h2>
            <button
              type="button"
              onClick={validate}
              className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700"
            >
              Sprawdź spójność
            </button>
          </div>

          <section className="rounded border border-slate-800 bg-slate-900/30 p-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-200">Inventory</h3>
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-400">
                <tr>
                  <th className="text-left">itemKey</th>
                  <th className="text-left">Nazwa</th>
                  <th className="text-left">Ilość</th>
                  <th className="text-left">Equipped</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(snapshot.inventory || []).map((item) => {
                  const equipped = [
                    snapshot.equipped?.mainHand === item.id && 'mainHand',
                    snapshot.equipped?.offHand === item.id && 'offHand',
                    snapshot.equipped?.armour === item.id && 'armour',
                  ].filter(Boolean).join(', ');
                  return (
                    <tr key={item.id} className="border-t border-slate-800/60">
                      <td className="py-1 font-mono text-xs text-slate-500">{item.id}</td>
                      <td className="py-1 text-slate-200">{item.name}</td>
                      <td className="py-1 text-slate-300">{item.quantity}</td>
                      <td className="py-1 text-emerald-300">{equipped || '—'}</td>
                      <td className="py-1 text-right">
                        <button
                          type="button"
                          onClick={() => deleteItem(item.id)}
                          className="rounded border border-red-700 px-2 py-0.5 text-xs text-red-300 hover:bg-red-900/30"
                        >
                          Usuń
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-200">Pełen snapshot (FE-shape) — edytuj JSON</h3>
            <textarea
              className="w-full rounded border border-slate-700 bg-slate-950 p-2 font-mono text-xs text-slate-100"
              rows={24}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            {error && (
              <div className="mt-2 rounded border border-red-700 bg-red-900/30 p-2 text-sm text-red-200">
                {error}
              </div>
            )}
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={save}
                disabled={busy}
                className="rounded border border-emerald-700 bg-emerald-700/30 px-3 py-1.5 text-sm text-emerald-100 hover:bg-emerald-700/50 disabled:opacity-50"
              >
                {busy ? 'Zapisuję…' : 'Zapisz całą postać'}
              </button>
              <button
                type="button"
                onClick={() => setDraft(JSON.stringify(snapshot, null, 2))}
                className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
              >
                Reset draft
              </button>
            </div>
          </section>
        </div>
      )}
    </ListDetailLayout>
  );
}
