import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import CharacterPanel from './CharacterPanel';
import { getGenderLabel } from '../../utils/characterUtils';
import { apiClient } from '../../services/apiClient';
import { storage } from '../../services/storage';

function BrowsingView({ character, settings, onBack }) {
  const { t } = useTranslation();
  const [fullCharacter, setFullCharacter] = useState(character);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const charId = character.backendId || character.id;
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

  return (
    <div className="px-4 md:px-10 py-8">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 mb-8 text-sm text-on-surface-variant hover:text-primary transition-colors"
      >
        <span className="material-symbols-outlined text-base">arrow_back</span>
        {t('character.backToList')}
      </button>

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
          <span>{fullCharacter.characterXp || 0} {t('common.xp')}</span>
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

function LibraryCard({ ch, deleteConfirmId, onSelect, onRequestDelete, onConfirmDelete, onCancelDelete, onExport }) {
  const { t } = useTranslation();
  const charId = ch.backendId || ch.localId || ch.id;

  return (
    <div
      className="group relative p-4 rounded-sm border bg-surface-container-high/40 border-outline-variant/10 hover:border-primary/20 hover:bg-surface-container-high/60 transition-all cursor-pointer"
      onClick={() => onSelect(ch)}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-surface-container-lowest rounded-sm flex items-center justify-center shrink-0 overflow-hidden">
          {ch.portraitUrl ? (
            <img
              src={apiClient.resolveMediaUrl(ch.portraitUrl)}
              alt={ch.name}
              className="w-full h-full object-cover"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          ) : (
            <span className="material-symbols-outlined text-xl text-outline/40">person</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-headline text-sm truncate text-tertiary">{ch.name}</p>
          <p className="text-[10px] text-on-surface-variant truncate">
            {t(`species.${ch.species}`, { defaultValue: ch.species })}
          </p>
          <div className="flex items-center gap-2 mt-1 text-[9px] text-outline">
            <span>{ch.xp || 0} {t('characterPicker.xpLabel')}</span>
          </div>
        </div>
      </div>
      {deleteConfirmId === charId ? (
        <div className="absolute inset-0 bg-surface-container-highest/95 backdrop-blur-sm rounded-sm flex flex-col items-center justify-center gap-3 p-4 z-10" onClick={(e) => e.stopPropagation()}>
          <p className="text-xs text-on-surface-variant text-center">{t('character.deleteConfirm')}</p>
          <div className="flex gap-2">
            <button
              onClick={() => onConfirmDelete(charId)}
              className="px-3 py-1.5 bg-error/20 text-error text-[10px] font-bold uppercase tracking-widest rounded-sm border border-error/30 hover:bg-error/30 transition-colors"
            >
              {t('character.deleteCharacter')}
            </button>
            <button
              onClick={onCancelDelete}
              className="px-3 py-1.5 bg-surface-container-high/60 text-on-surface-variant text-[10px] font-bold uppercase tracking-widest rounded-sm border border-outline-variant/20 hover:text-primary transition-colors"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
          <button
            onClick={(e) => { e.stopPropagation(); onExport(ch); }}
            className="text-outline hover:text-primary transition-colors"
            title={t('character.export')}
          >
            <span className="material-symbols-outlined text-base">download</span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onRequestDelete(charId); }}
            className="text-outline hover:text-error transition-colors"
            title={t('character.deleteCharacter')}
          >
            <span className="material-symbols-outlined text-base">delete</span>
          </button>
        </div>
      )}
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

  const handleExport = async (ch) => {
    const charId = ch.backendId || ch.id;
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

  if (browsingCharacter) {
    return <BrowsingView character={browsingCharacter} settings={settings} onBack={onBackToList} />;
  }

  return (
    <div className="px-4 md:px-10 py-8">
      <div className="text-center mb-10 animate-fade-in">
        <span className="material-symbols-outlined text-5xl text-primary/30 mb-3">groups</span>
        <h2 className="font-headline text-2xl text-tertiary mb-2">{t('character.library')}</h2>
        <p className="text-on-surface-variant text-sm">{t('character.libraryDescription')}</p>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-8">
            {libraryChars.map((ch) => (
              <LibraryCard
                key={ch.backendId || ch.localId || ch.id}
                ch={ch}
                deleteConfirmId={deleteConfirmId}
                onSelect={onSelectCharacter}
                onRequestDelete={onRequestDelete}
                onConfirmDelete={onConfirmDelete}
                onCancelDelete={onCancelDelete}
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
  );
}
