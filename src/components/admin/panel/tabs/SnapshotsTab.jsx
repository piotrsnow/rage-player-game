// Snapshots tab — list / pin / restore / delete.

import { useEffect } from 'react';
import { useAdminPanelStore } from '../../../../stores/adminPanelStore';

export default function SnapshotsTab() {
  const snapshots = useAdminPanelStore((s) => s.snapshots);
  const loading = useAdminPanelStore((s) => s.snapshotsLoading);
  const loadSnapshots = useAdminPanelStore((s) => s.loadSnapshots);
  const restoreSnapshot = useAdminPanelStore((s) => s.restoreSnapshot);
  const togglePin = useAdminPanelStore((s) => s.toggleSnapshotPin);
  const deleteSnapshot = useAdminPanelStore((s) => s.deleteSnapshot);
  const createManualSnapshot = useAdminPanelStore((s) => s.createManualSnapshot);

  useEffect(() => { loadSnapshots(); }, [loadSnapshots]);

  async function handleRestore(s) {
    if (!window.confirm(`Przywrócić snapshot "${s.reason || s.id}" z ${new Date(s.createdAt).toLocaleString()}?\n\nWszystkie obecne zmiany w kampanii zostaną zastąpione.`)) return;
    try {
      await restoreSnapshot(s.id);
      window.alert('Przywrócono.');
    } catch (err) {
      window.alert(`Błąd: ${err.message}`);
    }
  }

  async function handleDelete(s) {
    if (!window.confirm(`Usunąć snapshot "${s.reason || s.id}"?`)) return;
    await deleteSnapshot(s.id);
  }

  async function handleManual() {
    const reason = window.prompt('Opis snapshotu:', 'manual');
    if (!reason) return;
    await createManualSnapshot(reason);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-100">Snapshoty kampanii</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={loadSnapshots}
            className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700"
          >
            Odśwież
          </button>
          <button
            type="button"
            onClick={handleManual}
            className="rounded border border-emerald-700 bg-emerald-700/30 px-3 py-1.5 text-sm text-emerald-100 hover:bg-emerald-700/50"
          >
            + Ręczny snapshot
          </button>
        </div>
      </div>

      {loading && <div className="text-sm text-slate-400">Ładowanie…</div>}
      {!loading && snapshots.length === 0 && (
        <div className="rounded border border-slate-800 bg-slate-900/30 p-6 text-sm text-slate-400">
          Brak snapshotów. Pierwsza edycja jakiejkolwiek encji utworzy automatyczny snapshot.
        </div>
      )}

      <table className="w-full text-sm">
        <thead className="text-xs text-slate-400">
          <tr>
            <th className="py-1 text-left">Data</th>
            <th className="py-1 text-left">Powód</th>
            <th className="py-1 text-left">Pin</th>
            <th className="py-1 text-left">id</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {snapshots.map((s) => (
            <tr key={s.id} className="border-t border-slate-800/60">
              <td className="py-1 text-slate-300">{new Date(s.createdAt).toLocaleString()}</td>
              <td className="py-1 text-slate-200">{s.reason || '—'}</td>
              <td className="py-1">
                <button
                  type="button"
                  onClick={() => togglePin(s.id, !s.pinned)}
                  className={s.pinned ? 'text-amber-300' : 'text-slate-500 hover:text-slate-300'}
                  title={s.pinned ? 'Odepnij' : 'Przypnij (chronione przed FIFO trim)'}
                >
                  {s.pinned ? '📌' : '○'}
                </button>
              </td>
              <td className="py-1 font-mono text-[10px] text-slate-500">{s.id}</td>
              <td className="py-1 text-right">
                <button
                  type="button"
                  onClick={() => handleRestore(s)}
                  className="mr-1 rounded border border-emerald-700 bg-emerald-700/20 px-2 py-0.5 text-xs text-emerald-200 hover:bg-emerald-700/40"
                >
                  Przywróć
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(s)}
                  className="rounded border border-red-700 px-2 py-0.5 text-xs text-red-300 hover:bg-red-900/30"
                >
                  Usuń
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
