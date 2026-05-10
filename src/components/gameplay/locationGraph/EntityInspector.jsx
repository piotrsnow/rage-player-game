import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

export default function EntityInspector({ entity, onDelete }) {
  const { t } = useTranslation();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = useCallback(() => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setConfirmDelete(false);
    onDelete(entity.type, entity.id);
  }, [confirmDelete, entity, onDelete]);

  if (!entity) {
    return (
      <div className="flex items-center justify-center h-full text-outline text-xs px-4 text-center">
        {t('locationGraph.entityBrowser.selectToInspect')}
      </div>
    );
  }

  const fields = buildFields(entity, t);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {/* Header */}
        <div>
          <h3 className="text-sm font-headline text-tertiary truncate">{entity.name}</h3>
          <span className={`inline-block mt-1 px-1.5 py-0.5 rounded-sm text-[10px] ${
            entity.source === 'world'
              ? 'bg-blue-500/20 text-blue-300'
              : 'bg-amber-500/20 text-amber-300'
          }`}>
            {entity.type}
          </span>
        </div>

        {/* Fields */}
        <div className="space-y-2">
          {fields.map(({ label, value }) => (
            <div key={label}>
              <dt className="text-[10px] uppercase tracking-wider text-outline">{label}</dt>
              <dd className="text-xs text-on-surface mt-0.5 break-words">{value || '—'}</dd>
            </div>
          ))}
        </div>
      </div>

      {/* Delete button */}
      <div className="px-4 py-3 border-t border-outline-variant/15">
        <button
          onClick={handleDelete}
          onBlur={() => setConfirmDelete(false)}
          className={`w-full px-3 py-1.5 rounded-sm text-xs transition-colors ${
            confirmDelete
              ? 'bg-red-500 text-white'
              : 'bg-red-500/15 text-red-300 hover:bg-red-500/25'
          }`}
        >
          {confirmDelete
            ? t('locationGraph.entityBrowser.confirmDeleteEntity')
            : t('locationGraph.entityBrowser.deleteEntity')}
        </button>
      </div>
    </div>
  );
}

function buildFields(entity, t) {
  const fields = [
    { label: 'ID', value: entity.id },
    { label: t('locationGraph.entityBrowser.colStatus'), value: entity.status },
    { label: t('locationGraph.entityBrowser.colDetails'), value: entity.details },
    { label: t('locationGraph.entityBrowser.colSource'), value: entity.source },
  ];
  if (entity.campaignName) {
    fields.push({ label: t('locationGraph.entityBrowser.colCampaign'), value: entity.campaignName });
  }
  if (entity.campaignId) {
    fields.push({ label: 'Campaign ID', value: entity.campaignId });
  }
  if (entity.parentId) {
    fields.push({ label: 'Parent ID', value: entity.parentId });
  }
  return fields;
}
