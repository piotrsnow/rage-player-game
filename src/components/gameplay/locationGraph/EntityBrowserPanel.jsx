import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

const TYPE_ICONS = {
  WorldNPC: 'person',
  WorldLocation: 'location_on',
  Road: 'route',
  CampaignNPC: 'person_outline',
  CampaignLocation: 'pin_drop',
  CampaignQuest: 'task_alt',
  Character: 'badge',
};

export default function EntityBrowserPanel({
  entities, counts, loading, error,
  typeFilter, onTypeFilter,
  search, onSearch,
  page, onPageChange,
  selectedIds, onToggleSelect, onSelectAll, onClearSelection,
  onBulkDelete, onSelectEntity, campaignId,
  PAGE_SIZE, ENTITY_TYPES,
}) {
  const { t } = useTranslation();
  const [confirmBulk, setConfirmBulk] = useState(false);

  const handleBulkDelete = useCallback(() => {
    if (!confirmBulk) {
      setConfirmBulk(true);
      return;
    }
    setConfirmBulk(false);
    onBulkDelete();
  }, [confirmBulk, onBulkDelete]);

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Filter bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-outline-variant/15 bg-surface-container/30">
        <select
          value={typeFilter || ''}
          onChange={(e) => onTypeFilter(e.target.value || null)}
          className="bg-surface-container border border-outline-variant/30 rounded-sm px-2 py-1 text-xs text-on-surface"
        >
          <option value="">{t('locationGraph.entityBrowser.allTypes')}</option>
          {ENTITY_TYPES.map((type) => (
            <option key={type} value={type}>
              {type} ({counts[type] || 0})
            </option>
          ))}
        </select>

        <div className="relative flex-1 max-w-xs">
          <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-[16px] text-outline">search</span>
          <input
            type="text"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={t('locationGraph.entityBrowser.searchPlaceholder')}
            className="w-full pl-7 pr-2 py-1 text-xs bg-surface-container border border-outline-variant/30 rounded-sm text-on-surface placeholder:text-outline"
          />
        </div>

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-on-surface-variant">
              {t('locationGraph.entityBrowser.selected', { count: selectedIds.size })}
            </span>
            <button
              onClick={handleBulkDelete}
              className={`px-2 py-1 text-xs rounded-sm transition-colors ${
                confirmBulk
                  ? 'bg-red-500 text-white'
                  : 'bg-red-500/20 text-red-300 hover:bg-red-500/30'
              }`}
            >
              {confirmBulk
                ? t('locationGraph.entityBrowser.confirmDelete')
                : t('locationGraph.entityBrowser.deleteSelected', { count: selectedIds.size })}
            </button>
            <button
              onClick={() => { setConfirmBulk(false); onClearSelection(); }}
              className="text-xs text-outline hover:text-on-surface-variant"
            >
              {t('common.cancel')}
            </button>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 bg-red-500/10 text-red-300 text-xs">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {loading && entities.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-outline text-xs">
            <span className="material-symbols-outlined animate-spin mr-2 text-sm">progress_activity</span>
            {t('common.loading')}
          </div>
        ) : entities.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-outline text-xs">
            {t('locationGraph.entityBrowser.noResults')}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-container-highest/90 backdrop-blur-sm">
              <tr className="border-b border-outline-variant/15 text-left text-[10px] uppercase tracking-wider text-outline">
                <th className="px-3 py-1.5 w-8">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === entities.length && entities.length > 0}
                    onChange={(e) => e.target.checked ? onSelectAll() : onClearSelection()}
                    className="accent-primary"
                  />
                </th>
                <th className="px-3 py-1.5 w-10">{t('locationGraph.entityBrowser.colType')}</th>
                <th className="px-3 py-1.5">{t('locationGraph.entityBrowser.colName')}</th>
                <th className="px-3 py-1.5 w-24">{t('locationGraph.entityBrowser.colStatus')}</th>
                <th className="px-3 py-1.5 w-24">{t('locationGraph.entityBrowser.colDetails')}</th>
                <th className="px-3 py-1.5 w-20">{t('locationGraph.entityBrowser.colSource')}</th>
                <th className="px-3 py-1.5 w-32">{t('locationGraph.entityBrowser.colCampaign')}</th>
              </tr>
            </thead>
            <tbody>
              {entities.map((entity) => {
                const isCurrent = campaignId && entity.campaignId === campaignId;
                return (
                  <tr
                    key={`${entity.type}:${entity.id}`}
                    onClick={() => onSelectEntity(entity)}
                    className={`border-b border-outline-variant/10 cursor-pointer hover:bg-primary/5 transition-colors ${
                      isCurrent ? 'bg-primary/5' : ''
                    }`}
                  >
                    <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(entity.id)}
                        onChange={() => onToggleSelect(entity.id)}
                        className="accent-primary"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="material-symbols-outlined text-[14px] text-outline" title={entity.type}>
                        {TYPE_ICONS[entity.type] || 'help'}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-on-surface truncate max-w-[200px]">{entity.name}</td>
                    <td className="px-3 py-1.5 text-on-surface-variant">{entity.status}</td>
                    <td className="px-3 py-1.5 text-on-surface-variant">{entity.details}</td>
                    <td className="px-3 py-1.5">
                      <span className={`px-1.5 py-0.5 rounded-sm text-[10px] ${
                        entity.source === 'world'
                          ? 'bg-blue-500/20 text-blue-300'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}>
                        {entity.source}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-on-surface-variant truncate max-w-[120px]">
                      {entity.campaignName || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {entities.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-outline-variant/15 text-xs text-outline">
          <span>{t('locationGraph.entityBrowser.page', { page })}</span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="px-2 py-0.5 rounded-sm bg-surface-container hover:bg-primary/10 disabled:opacity-30"
            >
              ←
            </button>
            <button
              disabled={entities.length < PAGE_SIZE}
              onClick={() => onPageChange(page + 1)}
              className="px-2 py-0.5 rounded-sm bg-surface-container hover:bg-primary/10 disabled:opacity-30"
            >
              →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
