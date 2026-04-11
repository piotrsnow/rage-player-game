import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/apiClient';
import { storage } from '../../services/storage';
import { ATTRIBUTE_KEYS } from '../../data/rpgSystem';
import PortraitGenerator from '../character/PortraitGenerator';

export default function CharacterPicker({
  charMode,
  onCharModeChange,
  createdCharacter,
  selectedCharacter,
  onSelectedCharacterChange,
  savedCharacters,
  onShowCharModal,
  editingSelectedPortrait,
  onEditingSelectedPortraitChange,
  persistSelectedCharacter,
  genre,
}) {
  const { t } = useTranslation();

  return (
    <section>
      <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-4">
        {t('characterPicker.title')}
      </label>

      <div className="flex gap-3 mb-6">
        <button
          onClick={() => {
            onCharModeChange('new');
            onSelectedCharacterChange(null);
            onEditingSelectedPortraitChange(false);
          }}
          className={`flex-1 px-4 py-4 rounded-sm border transition-all duration-300 text-left ${
            charMode === 'new'
              ? 'bg-surface-tint text-on-primary border-primary shadow-[0_0_20px_rgba(197,154,255,0.3)]'
              : 'bg-surface-container-high/40 text-on-surface-variant border-outline-variant/15 hover:bg-surface-container-high hover:text-tertiary hover:border-primary/20'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-lg">person_add</span>
            <span className="font-bold text-sm">{t('characterPicker.createNew')}</span>
          </div>
          <p className="text-[10px] opacity-70">{t('characterPicker.createNewDesc')}</p>
        </button>
        <button
          onClick={() => {
            onCharModeChange('existing');
            onEditingSelectedPortraitChange(false);
          }}
          className={`flex-1 px-4 py-4 rounded-sm border transition-all duration-300 text-left ${
            charMode === 'existing'
              ? 'bg-surface-tint text-on-primary border-primary shadow-[0_0_20px_rgba(197,154,255,0.3)]'
              : 'bg-surface-container-high/40 text-on-surface-variant border-outline-variant/15 hover:bg-surface-container-high hover:text-tertiary hover:border-primary/20'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-lg">group</span>
            <span className="font-bold text-sm">{t('characterPicker.useExisting')}</span>
          </div>
          <p className="text-[10px] opacity-70">{t('characterPicker.useExistingDesc')}</p>
        </button>
      </div>

      {charMode === 'new' && (
        <div className="animate-fade-in">
          {createdCharacter ? (
            <div className="p-4 bg-surface-container-high/30 border border-primary/20 rounded-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">check_circle</span>
                  <span className="text-xs font-bold text-primary uppercase tracking-wider">{t('charCreator.characterReady')}</span>
                </div>
                <button
                  onClick={onShowCharModal}
                  className="flex items-center gap-1 text-xs text-tertiary hover:text-primary transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">edit</span>
                  {t('charCreator.editCharacter')}
                </button>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-14 h-[72px] bg-surface-container-lowest rounded-sm flex items-center justify-center overflow-hidden shrink-0 border border-outline-variant/10">
                  {createdCharacter.portraitUrl ? (
                    <img src={apiClient.resolveMediaUrl(createdCharacter.portraitUrl)} alt={createdCharacter.name} className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
                  ) : (
                    <span className="material-symbols-outlined text-2xl text-primary/60">person</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-headline text-lg text-tertiary">{createdCharacter.name}</p>
                  <p className="text-xs text-on-surface-variant">
                    {t(`species.${createdCharacter.species}`)}
                  </p>
                  <div className="flex flex-wrap gap-3 mt-2">
                    {ATTRIBUTE_KEYS.slice(0, 5).map((key) => (
                      <span key={key} className="text-[10px] text-on-surface-variant">
                        {t(`rpgAttributeShort.${key}`)}: <strong className="text-tertiary">{(createdCharacter.attributes || createdCharacter.characteristics)?.[key]}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={onShowCharModal}
              className="w-full p-6 border border-dashed border-outline-variant/30 rounded-sm hover:border-primary/40 hover:bg-surface-tint/5 transition-all group"
            >
              <div className="flex flex-col items-center gap-2">
                <span className="material-symbols-outlined text-3xl text-outline group-hover:text-primary transition-colors">person_add</span>
                <span className="text-sm font-label text-on-surface-variant group-hover:text-primary transition-colors">
                  {t('charCreator.createCharacter')}
                </span>
              </div>
            </button>
          )}
        </div>
      )}

      {charMode === 'existing' && (
        <div className="animate-fade-in">
          {savedCharacters.length === 0 ? (
            <p className="text-on-surface-variant text-sm text-center py-6 border border-outline-variant/10 rounded-sm bg-surface-container-high/20">
              {t('characterPicker.noCharacters')}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {savedCharacters.map((ch) => {
                const career = ch.careerData || ch.career || {};
                const charId = ch.backendId || ch.localId || ch.id;
                const isSelected = selectedCharacter && (selectedCharacter.backendId || selectedCharacter.localId || selectedCharacter.id) === charId;
                return (
                  <div
                    key={charId}
                    className={`p-4 rounded-sm border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-primary/10 border-primary/30 shadow-[0_0_15px_rgba(197,154,255,0.2)]'
                        : 'bg-surface-container-high/40 border-outline-variant/10 hover:border-primary/20 hover:bg-surface-container-high/60'
                    }`}
                    onClick={async () => {
                      if (isSelected) {
                        onSelectedCharacterChange(null);
                        onEditingSelectedPortraitChange(false);
                      } else {
                        const id = ch.backendId || ch.localId || ch.id;
                        let fullChar;
                        try {
                          fullChar = await storage.loadCharacter(id);
                        } catch {
                          fullChar = null;
                        }
                        const base = fullChar || ch;
                        const normalized = {
                          ...base,
                          career: base.career || base.careerData || career,
                          backendId: base.backendId || ch.backendId || ch.id,
                          localId: base.localId || ch.localId || ch.id,
                        };
                        onSelectedCharacterChange(normalized);
                        onEditingSelectedPortraitChange(false);
                      }
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-16 bg-surface-container-lowest rounded-sm flex items-center justify-center overflow-hidden shrink-0 border border-outline-variant/10">
                        {ch.portraitUrl ? (
                          <img src={apiClient.resolveMediaUrl(ch.portraitUrl)} alt={ch.name} className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
                        ) : (
                          <span className="material-symbols-outlined text-xl text-outline/40">person</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`font-headline text-sm truncate ${isSelected ? 'text-primary' : 'text-tertiary'}`}>
                          {ch.name}
                        </p>
                        <p className="text-[10px] text-on-surface-variant truncate">
                          {t(`species.${ch.species}`, { defaultValue: ch.species })}
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-[9px] text-outline">
                          <span>{ch.xp || 0} {t('characterPicker.xpLabel')}</span>
                        </div>
                      </div>
                      {isSelected && (
                        <span className="material-symbols-outlined text-primary text-lg shrink-0">check_circle</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {selectedCharacter && (
            <div className="mt-4 p-4 bg-surface-container-high/30 border border-primary/20 rounded-sm">
              <div className="flex items-center justify-between mb-3 gap-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">check_circle</span>
                  <span className="text-xs font-bold text-primary uppercase tracking-wider">
                    {t('characterPicker.selectedCharacter')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onEditingSelectedPortraitChange(!editingSelectedPortrait)}
                  className="flex items-center gap-1 text-xs text-tertiary hover:text-primary transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">photo_camera</span>
                  {t('character.updatePortrait')}
                </button>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-16 h-[85px] bg-surface-container-lowest rounded-sm flex items-center justify-center overflow-hidden shrink-0 border border-outline-variant/10">
                  {selectedCharacter.portraitUrl ? (
                    <img src={apiClient.resolveMediaUrl(selectedCharacter.portraitUrl)} alt={selectedCharacter.name} className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
                  ) : (
                    <span className="material-symbols-outlined text-3xl text-primary/60">person</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-headline text-lg text-tertiary">{selectedCharacter.name}</p>
                  <p className="text-xs text-on-surface-variant">
                    {t(`species.${selectedCharacter.species}`, { defaultValue: selectedCharacter.species })}
                  </p>
                  <div className="flex flex-wrap gap-3 mt-2">
                    {ATTRIBUTE_KEYS.slice(0, 5).map((key) => (
                      <span key={key} className="text-[10px] text-on-surface-variant">
                        {t(`rpgAttributeShort.${key}`)}: <strong className="text-tertiary">{(selectedCharacter.attributes || selectedCharacter.characteristics)?.[key]}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {editingSelectedPortrait && (
                <div className="mt-4 pt-4 border-t border-outline-variant/10">
                  <PortraitGenerator
                    species={selectedCharacter.species}
                    gender={selectedCharacter.gender}
                    careerName={selectedCharacter.career?.name}
                    genre={genre}
                    initialPortrait={selectedCharacter.portraitUrl}
                    onPortraitReady={async (url) => {
                      try {
                        await persistSelectedCharacter({ portraitUrl: url || '' });
                        onEditingSelectedPortraitChange(false);
                      } catch {
                        // Keep the editor open so the user can retry.
                      }
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
