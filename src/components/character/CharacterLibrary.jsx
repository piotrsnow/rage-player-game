import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import CharacterPanel from './CharacterPanel';
import { getGenderLabel } from '../../utils/characterUtils';
import { apiClient } from '../../services/apiClient';
import { storage } from '../../services/storage';

function getCharacterXp(character) {
  return character?.characterXp ?? character?.xp ?? 0;
}

function DeleteCharacterConfirmModal({
  open,
  characterName,
  onCancel,
  onConfirm,
  deleting,
  t,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !deleting) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, deleting, onCancel]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="character-delete-confirm-title"
    >
      <div
        role="presentation"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={deleting ? undefined : onCancel}
      />
      <div className="relative z-10 w-full max-w-md bg-surface-container-highest/95 backdrop-blur-2xl border border-outline-variant/15 rounded-sm shadow-2xl animate-fade-in p-6">
        <div className="flex items-start gap-3 mb-4">
          <span className="material-symbols-outlined text-error shrink-0 mt-0.5">warning</span>
          <h2 id="character-delete-confirm-title" className="font-headline text-lg text-on-surface leading-snug">
            {t('character.deleteConfirmTitle')}
          </h2>
        </div>
        <p className="text-sm text-on-surface-variant mb-6">
          {t('character.deleteConfirm', { name: characterName || '—' })}
        </p>
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="px-4 py-2.5 rounded-sm text-xs font-label uppercase tracking-widest border border-outline-variant/20 text-on-surface-variant hover:text-primary hover:border-primary/25 transition-colors disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="px-4 py-2.5 rounded-sm text-xs font-label uppercase tracking-widest bg-error/20 text-error border border-error/35 hover:bg-error/30 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {deleting && (
              <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
            )}
            {t('character.deleteCharacter')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function BrowsingView({ character, settings, onBack, onRequestDelete }) {
  const { t } = useTranslation();
  const [fullCharacter, setFullCharacter] = useState(character);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const charId = character.backendId || character.localId || character.id;
    if (!charId || !apiClient.isConnected()) {
      setFullCharacter(character);
      return;
    }
    let cancelled = false;
    setLoading(true);
    storage.loadCharacter(charId).then((full) => {
      if (cancelled) return;
      setFullCharacter(full || character);
    }).catch(() => {
      if (!cancelled) setFullCharacter(character);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [character]);

  const browseCharId = character.backendId || character.localId || character.id;

  return (
    <div className="px-4 md:px-10 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-primary transition-colors"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          {t('character.backToList')}
        </button>
        {browseCharId && onRequestDelete && (
          <button
            type="button"
            onClick={() => onRequestDelete(browseCharId)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-[10px] font-label uppercase tracking-widest border border-error/25 text-error hover:bg-error/10 transition-colors"
          >
            <span className="material-symbols-outlined text-sm">delete</span>
            {t('character.deleteCharacter')}
          </button>
        )}
      </div>

      <div className="mb-2">
        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary/10 text-primary text-[10px] font-label uppercase tracking-widest rounded-sm border border-primary/20">
          <span className="material-symbols-outlined text-xs">visibility</span>
          {t('character.readOnly')}
        </span>
      </div>

      <div className="mb-12 relative animate-fade-in">
        <h1 className="text-4xl md:text-5xl font-headline text-tertiary mb-2 drop-shadow-[0_2px_4px_rgba(197,154,255,0.1)]">
          {fullCharacter.name}
        </h1>
        <div className="flex items-center gap-4 text-on-surface-variant font-label text-sm uppercase tracking-[0.2em] flex-wrap">
          <span>{t(`species.${fullCharacter.species}`, { defaultValue: fullCharacter.species })}</span>
          <span className="w-1 h-1 bg-primary rounded-full" />
          <span>{t('character.gender')}: {getGenderLabel(fullCharacter.gender, t)}</span>
          <span className="w-1 h-1 bg-primary rounded-full" />
          <span>{t('character.age')}: {fullCharacter.age ?? 23}</span>
          <span className="w-1 h-1 bg-primary rounded-full" />
          <span>{getCharacterXp(fullCharacter)} {t('common.xp')}</span>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <span className="material-symbols-outlined text-3xl text-primary/40 animate-spin">progress_activity</span>
        </div>
      ) : (
        <CharacterPanel
          character={fullCharacter}
          settings={settings}
          t={t}
          characterVoiceMap={{}}
          showAdvancement={false}
          setShowAdvancement={() => {}}
          dispatch={null}
          isMultiplayer={false}
        />
      )}
    </div>
  );
}

function LibraryCard({ ch, onSelect, onRequestDelete, onExport }) {
  const { t } = useTranslation();
  const charId = ch.backendId || ch.localId || ch.id;

  return (
    <div
      className="group relative min-h-[8.5rem] p-5 rounded-sm border bg-surface-container-high/40 border-outline-variant/10 hover:border-primary/25 hover:bg-surface-container-high/70 transition-all cursor-pointer"
      onClick={() => onSelect(ch)}
    >
      <div className="flex items-start gap-4">
        <div className="w-16 h-16 bg-surface-container-lowest rounded-sm flex items-center justify-center shrink-0 overflow-hidden border border-outline-variant/10">
          {ch.portraitUrl ? (
            <img
              src={apiClient.resolveMediaUrl(ch.portraitUrl)}
              alt={ch.name}
              className="w-full h-full object-cover"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          ) : (
            <span className="material-symbols-outlined text-3xl text-outline/40">person</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-headline text-lg leading-tight truncate text-tertiary pr-14">{ch.name}</p>
          <p className="text-xs text-on-surface-variant truncate mt-1">
            {t(`species.${ch.species}`, { defaultValue: ch.species })}
          </p>
          <div className="flex items-center gap-2 mt-3 text-[11px] text-outline font-label uppercase tracking-wider">
            <span>{getCharacterXp(ch)} {t('characterPicker.xpLabel')}</span>
          </div>
        </div>
      </div>
      <div className="absolute top-2 right-2 flex gap-1 max-sm:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onExport(ch); }}
          className="text-outline hover:text-primary transition-colors"
          title={t('character.export')}
        >
          <span className="material-symbols-outlined text-base">download</span>
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRequestDelete(charId); }}
          className="text-outline hover:text-error transition-colors"
          title={t('character.deleteCharacter')}
        >
          <span className="material-symbols-outlined text-base">delete</span>
        </button>
      </div>
    </div>
  );
}

export default function CharacterLibrary({
  libraryChars,
  libraryLoaded,
  browsingCharacter,
  deleteConfirmId,
  settings,
  onSelectCharacter,
  onBackToList,
  onConfirmDelete,
  onRequestDelete,
  onCancelDelete,
  onLeaveToLobby,
  onCharacterImported,
}) {
  const { t } = useTranslation();
  const importRef = useRef(null);
  const [importStatus, setImportStatus] = useState(null);
  const [deleteInProgress, setDeleteInProgress] = useState(false);

  const pendingDeleteCharacter = useMemo(() => {
    if (!deleteConfirmId) return null;
    if (browsingCharacter) {
      const bid = browsingCharacter.backendId || browsingCharacter.localId || browsingCharacter.id;
      if (bid === deleteConfirmId) return browsingCharacter;
    }
    return libraryChars.find((c) => (c.backendId || c.localId || c.id) === deleteConfirmId) || null;
  }, [deleteConfirmId, browsingCharacter, libraryChars]);

  const handleConfirmDeleteClick = useCallback(async () => {
    if (!deleteConfirmId) return;
    setDeleteInProgress(true);
    try {
      await onConfirmDelete(deleteConfirmId);
    } finally {
      setDeleteInProgress(false);
    }
  }, [deleteConfirmId, onConfirmDelete]);

  const handleExport = async (ch) => {
    const charId = ch.backendId || ch.localId || ch.id;
    let full = ch;
    if (charId && apiClient.isConnected()) {
      try { full = await storage.loadCharacter(charId) || ch; } catch { /* use summary */ }
    }
    storage.exportCharacter(full);
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const saved = await storage.importCharacterFromFile(file);
      setImportStatus('ok');
      if (onCharacterImported) onCharacterImported(saved);
    } catch (err) {
      console.warn('[CharacterLibrary] import failed:', err.message);
      setImportStatus('error');
    }
    setTimeout(() => setImportStatus(null), 3000);
  };

  const deleteModal = (
    <DeleteCharacterConfirmModal
      open={Boolean(deleteConfirmId)}
      characterName={pendingDeleteCharacter?.name}
      onCancel={onCancelDelete}
      onConfirm={handleConfirmDeleteClick}
      deleting={deleteInProgress}
      t={t}
    />
  );

  if (browsingCharacter) {
    return (
      <>
        <BrowsingView
          character={browsingCharacter}
          settings={settings}
          onBack={onBackToList}
          onRequestDelete={onRequestDelete}
        />
        {deleteModal}
      </>
    );
  }

  return (
    <>
    <div className="px-4 md:px-10 py-8">
      <div className="mb-6 animate-fade-in rounded-sm border border-outline-variant/10 bg-surface-container-low/50 px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-2xl text-primary/45 mt-0.5">groups</span>
          <div>
            <h2 className="font-headline text-2xl text-tertiary">{t('character.library')}</h2>
            <p className="text-on-surface-variant text-sm mt-1">{t('character.libraryDescription')}</p>
          </div>
        </div>
      </div>

      {!libraryLoaded ? (
        <div className="flex justify-center py-12">
          <span className="material-symbols-outlined text-3xl text-primary/40 animate-spin">progress_activity</span>
        </div>
      ) : libraryChars.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 animate-fade-in">
          <span className="material-symbols-outlined text-6xl text-outline/20 mb-4">person_off</span>
          <p className="text-on-surface-variant text-sm mb-8">{t('character.noSavedCharacters')}</p>
          <div className="flex items-center gap-4 flex-wrap justify-center">
            <button
              onClick={() => importRef.current?.click()}
              className="px-8 py-3 bg-surface-container-high/40 text-on-surface-variant font-bold text-xs uppercase tracking-widest rounded-sm border border-outline-variant/15 hover:text-primary hover:border-primary/20 transition-all"
            >
              {t('character.import')}
            </button>
            <button
              onClick={onLeaveToLobby}
              className="px-8 py-3 bg-surface-tint text-on-primary font-bold text-xs uppercase tracking-widest rounded-sm"
            >
              {t('character.goToLobby')}
            </button>
          </div>
          {importStatus && (
            <p className={`text-center text-xs mt-3 ${importStatus === 'ok' ? 'text-primary' : 'text-error'}`}>
              {importStatus === 'ok' ? t('character.importSuccess') : t('character.importError')}
            </p>
          )}
          <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />
        </div>
      ) : (
        <div className="animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
            {libraryChars.map((ch) => (
              <LibraryCard
                key={ch.backendId || ch.localId || ch.id}
                ch={ch}
                onSelect={onSelectCharacter}
                onRequestDelete={onRequestDelete}
                onExport={handleExport}
              />
            ))}
          </div>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <button
              onClick={() => importRef.current?.click()}
              className="inline-flex items-center gap-2 px-6 py-2.5 text-on-surface-variant text-xs font-label uppercase tracking-widest hover:text-primary transition-colors"
            >
              <span className="material-symbols-outlined text-sm">upload</span>
              {t('character.import')}
            </button>
            <button
              onClick={onLeaveToLobby}
              className="inline-flex items-center gap-2 px-6 py-2.5 text-on-surface-variant text-xs font-label uppercase tracking-widest hover:text-primary transition-colors"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              {t('character.goToLobby')}
            </button>
          </div>
          {importStatus && (
            <p className={`text-center text-xs mt-3 ${importStatus === 'ok' ? 'text-primary' : 'text-error'}`}>
              {importStatus === 'ok' ? t('character.importSuccess') : t('character.importError')}
            </p>
          )}
          <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />
        </div>
      )}
    </div>
    {deleteModal}
    </>
  );
}
