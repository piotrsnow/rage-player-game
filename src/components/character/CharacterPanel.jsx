import { useEffect, useState } from 'react';
import { apiClient } from '../../services/apiClient';
import StatsGrid from './StatsGrid';
import Inventory from './Inventory';
import ItemDetailBox from './inventory/ItemDetailBox';
import CrystalUseModal from './inventory/CrystalUseModal';
import { getEquippableSlots, getEquippedSlot } from './inventory/constants';
import StatusBar from '../ui/StatusBar';
import PortraitGenerator from './PortraitGenerator';
import CharacterHistoryPanel from './CharacterHistoryPanel';
import CustomSelect from '../ui/CustomSelect';
import Tooltip from '../ui/Tooltip';
import { translateSkill } from '../../utils/rpgTranslate';

function getTooltipKey(name) {
  return name?.replace(/\s*\(.*\)/, '') || '';
}

const NEEDS_META = [
  { key: 'hunger', icon: 'restaurant' },
  { key: 'thirst', icon: 'water_drop' },
  { key: 'bladder', icon: 'wc' },
  { key: 'hygiene', icon: 'shower' },
  { key: 'rest', icon: 'bedtime' },
];

export default function CharacterPanel({
  character,
  settings,
  t,
  characterVoiceMap,
  onVoiceChange,
  maleVoices,
  femaleVoices,
  showAdvancement,
  setShowAdvancement,
  dispatch,
  autoSave,
  isMultiplayer,
  onPortraitChange,
  campaign,
  scenes,
}) {
  const allVoices = [
    ...((maleVoices || []).map((v) => ({ ...v, gender: 'male' }))),
    ...((femaleVoices || []).map((v) => ({ ...v, gender: 'female' }))),
  ];
  const [editingPortrait, setEditingPortrait] = useState(false);
  const canEditPortrait = !!onPortraitChange && !isMultiplayer;

  const inventoryItems = character.inventory || [];
  const equipped = character.equipped || {};
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [crystalItemId, setCrystalItemId] = useState(null);
  const selectedItem = inventoryItems.find((i) => i.id === selectedItemId) || null;

  useEffect(() => {
    if (selectedItemId && !inventoryItems.some((i) => i.id === selectedItemId)) {
      setSelectedItemId(null);
    }
  }, [inventoryItems, selectedItemId]);

  const handleEquipItem = (itemId, slot) => {
    dispatch({ type: 'EQUIP_ITEM', payload: { itemId, slot } });
    if (autoSave) autoSave();
  };
  const handleUnequipItem = (slot) => {
    dispatch({ type: 'UNEQUIP_ITEM', payload: { slot } });
    if (autoSave) autoSave();
  };
  const handleUseManaCrystal = (itemId, choice) => {
    dispatch({ type: 'USE_MANA_CRYSTAL', payload: { itemId, choice } });
    if (autoSave) autoSave();
  };

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-3 space-y-6 animate-fade-in">
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-tr from-primary-dim to-primary opacity-20 blur-xl group-hover:opacity-30 transition duration-500" />
            <div className="relative bg-surface-container-high border border-outline-variant/15 p-1 rounded-sm overflow-hidden">
              {character.portraitUrl ? (
                <img
                  src={apiClient.resolveMediaUrl(character.portraitUrl)}
                  alt={character.name}
                  className="w-full aspect-[3/4] object-cover"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              ) : (
                <div className="w-full aspect-[3/4] bg-gradient-to-br from-surface-container to-surface-container-lowest flex items-center justify-center">
                  <span className="material-symbols-outlined text-8xl text-outline/20">person</span>
                </div>
              )}
              {canEditPortrait && (
                <button
                  onClick={() => setEditingPortrait(true)}
                  className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-all duration-300 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-3xl text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300 drop-shadow-lg">
                    photo_camera
                  </span>
                </button>
              )}
              {!character.portraitUrl && (
                <div className="absolute bottom-0 left-0 w-full p-4 bg-gradient-to-t from-surface-dim to-transparent">
                  <p className="text-tertiary font-headline text-lg">{t('character.inspiration')}</p>
                  <div className="flex gap-1 mt-1">
                    <span className="w-4 h-4 bg-primary rounded-full shadow-[0_0_6px_rgba(197,154,255,0.6)]" />
                    <span className="w-4 h-4 bg-surface-container rounded-full border border-outline-variant/30" />
                  </div>
                </div>
              )}
            </div>
            {canEditPortrait && !editingPortrait && (
              <button
                onClick={() => setEditingPortrait(true)}
                className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-label text-on-surface-variant hover:text-primary border border-outline-variant/15 hover:border-primary/30 rounded-sm transition-all hover:bg-surface-tint/10"
              >
                <span className="material-symbols-outlined text-sm">photo_camera</span>
                {t('character.updatePortrait')}
              </button>
            )}
          </div>

          {editingPortrait && (
            <div className="bg-surface-container-low p-4 border border-primary/20 rounded-sm animate-fade-in">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-tertiary font-headline text-sm flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">photo_camera</span>
                  {t('character.updatePortrait')}
                </h3>
                <button
                  onClick={() => setEditingPortrait(false)}
                  className="text-on-surface-variant hover:text-primary transition-colors"
                >
                  <span className="material-symbols-outlined text-base">close</span>
                </button>
              </div>
              <PortraitGenerator
                species={character.species}
                age={character.age}
                gender={character.gender}
                genre={campaign?.genre}
                initialPortrait={character.portraitUrl}
                onPortraitReady={(url) => {
                  onPortraitChange(url);
                  if (url !== null) setEditingPortrait(false);
                }}
              />
            </div>
          )}

          <div className="bg-surface-container-low p-6 border border-outline-variant/10 rounded-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-tertiary font-headline flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">auto_fix_high</span>
                {t('character.vitals')}
              </h3>
              <button
                onClick={() => setShowAdvancement(true)}
                className="flex items-center gap-1 text-[10px] text-primary-dim hover:text-primary transition-colors"
              >
                <span className="material-symbols-outlined text-sm">upgrade</span>
                {t('advancement.title')}
              </button>
            </div>
            <div className="space-y-4">
              <StatusBar label={t('character.wounds')} current={character.wounds} max={character.maxWounds} color="error" />
              {character.status === 'dead' && (
                <div className="px-3 py-2 bg-error/15 border border-error/30 rounded-sm text-center">
                  <span className="text-error text-xs font-bold uppercase tracking-widest">{t('character.dead', 'DEAD')}</span>
                </div>
              )}
              {character.mana && (
                <StatusBar label="Mana" current={character.mana.current} max={character.mana.max} color="blue" />
              )}
            </div>
          </div>

          {settings.needsSystemEnabled && character.needs && (
            <div className="bg-surface-container-low p-6 border border-outline-variant/10 rounded-sm">
              <h3 className="text-tertiary font-headline mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">self_care</span>
                {t('needs.title')}
              </h3>
              <div className="space-y-4">
                {NEEDS_META.map(({ key }) => (
                  <StatusBar
                    key={key}
                    label={t(`needs.${key}`)}
                    current={Math.round(character.needs[key] ?? 100)}
                    max={100}
                    color="dynamic"
                  />
                ))}
              </div>
            </div>
          )}

          {allVoices.length > 0 && onVoiceChange && (
            <div className="bg-surface-container-low p-6 border border-outline-variant/10 rounded-sm">
              <h3 className="text-tertiary font-headline mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">record_voice_over</span>
                {t('character.voice')}
              </h3>
              <CustomSelect
                value={characterVoiceMap?.[character.name]?.voiceId || ''}
                onChange={(nextVoiceId) => {
                  const voice = allVoices.find((v) => v.voiceId === nextVoiceId);
                  onVoiceChange(character.name, nextVoiceId || null, voice?.gender || null);
                }}
                options={[
                  { value: '', label: t('character.noVoice') },
                  ...allVoices.map((v) => ({ value: v.voiceId, label: `${v.voiceName} (${v.gender})` })),
                ]}
                className="w-full"
              />
            </div>
          )}
        </div>

        <div className="lg:col-span-5 space-y-6 animate-fade-in">
          <StatsGrid
            attributes={character.attributes}
            mana={character.mana}
            characterLevel={character.characterLevel}
            characterXp={character.characterXp}
            attributePoints={character.attributePoints}
          />

          {character.skills && Object.keys(character.skills).length > 0 && (
            <div className="bg-surface-container-low p-6 border border-outline-variant/10 rounded-sm">
              <h3 className="text-tertiary font-headline mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">school</span>
                {t('character.skills')}
              </h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {Object.entries(character.skills)
                  .filter(([, v]) => {
                    const level = typeof v === 'object' ? v.level : (v || 0);
                    return level > 0;
                  })
                  .map(([name, v]) => {
                    const level = typeof v === 'object' ? v.level : (v || 0);
                    return (
                      <Tooltip key={name} content={t(`tooltips.skills.${getTooltipKey(name)}`, { defaultValue: '' })}>
                        <div className="flex justify-between text-on-surface-variant w-full">
                          <span>{translateSkill(name, t)}</span>
                          <span className="text-primary-dim font-bold">{level}</span>
                        </div>
                      </Tooltip>
                    );
                  })}
              </div>
            </div>
          )}

          {selectedItem && (
            <div className="bg-surface-container-low p-6 border border-outline-variant/10 rounded-sm relative">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-tertiary font-headline flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">inventory_2</span>
                  {t('inventory.itemDetails', { defaultValue: 'Szczegóły przedmiotu' })}
                </h3>
                <button
                  onClick={() => setSelectedItemId(null)}
                  aria-label={t('common.close')}
                  className="text-on-surface-variant hover:text-primary transition-colors"
                >
                  <span className="material-symbols-outlined text-base">close</span>
                </button>
              </div>
              <ItemDetailBox
                item={selectedItem}
                items={inventoryItems}
                equipped={equipped}
                equippedSlot={getEquippedSlot(selectedItem, equipped)}
                equippableSlots={getEquippableSlots(selectedItem)}
                onEquipItem={handleEquipItem}
                onUnequipItem={handleUnequipItem}
                onUseManaCrystal={(itemId) => setCrystalItemId(itemId)}
              />
            </div>
          )}

          {character.spells?.known?.length > 0 && (
            <div className="bg-surface-container-low p-6 border border-tertiary/15 rounded-sm">
              <h3 className="text-tertiary font-headline mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">auto_awesome</span>
                {t('magic.spells', 'Zaklecia')}
              </h3>
              <div className="flex flex-wrap gap-2">
                {character.spells.known.map((spell) => (
                  <span key={spell} className="px-3 py-1 bg-tertiary/10 text-tertiary text-xs rounded-sm border border-tertiary/20">
                    {spell}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-4 space-y-6 animate-fade-in">
          <Inventory
            items={inventoryItems}
            money={character.money}
            equipped={equipped}
            materialBag={character.materialBag}
            onEquipItem={handleEquipItem}
            onUnequipItem={handleUnequipItem}
            selectedItemId={selectedItemId}
            onSelectItem={setSelectedItemId}
          />

          <div className="bg-surface-container-low p-6 rounded-sm border border-outline-variant/10 relative">
            <div className="absolute top-0 right-0 p-4">
              <span className="material-symbols-outlined text-primary-dim text-sm opacity-50">
                psychology
              </span>
            </div>
            <h3 className="text-tertiary font-headline mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">auto_stories</span>
              {t('character.origins')}
            </h3>
            <div className="text-on-surface-variant font-body leading-relaxed text-sm">
              {character.backstory || (
                <p className="italic text-outline">
                  {t('character.originsEmpty')}
                </p>
              )}
            </div>
          </div>
        </div>

      </div>

      {scenes && (
        <div className="mt-8 animate-fade-in">
          <CharacterHistoryPanel scenes={scenes} t={t} />
        </div>
      )}

      {crystalItemId && (
        <CrystalUseModal
          character={character}
          onClose={() => setCrystalItemId(null)}
          onChoose={(choice) => {
            handleUseManaCrystal(crystalItemId, choice);
            setCrystalItemId(null);
            setSelectedItemId(null);
          }}
        />
      )}

    </>
  );
}
