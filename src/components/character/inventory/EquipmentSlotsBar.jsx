import { useTranslation } from 'react-i18next';
import { gameData } from '../../../services/gameDataService';
import EquipmentSlot from './EquipmentSlot';
import { SLOT_CONFIG } from './constants';

export default function EquipmentSlotsBar({ equipped, items, onEquipItem, onUnequipItem }) {
  const { t } = useTranslation();

  const mainHandItem = equipped?.mainHand ? items.find((i) => i.id === equipped.mainHand) : null;
  const mainIsTwoHanded = mainHandItem?.baseType ? gameData.isTwoHanded(mainHandItem.baseType) : false;

  const columns = [
    { slotKey: 'mainHand', disabled: false, disabledReason: null },
    {
      slotKey: 'offHand',
      disabled: mainIsTwoHanded,
      disabledReason: t('inventory.twoHandedBlocked', 'Two-handed weapon equipped'),
    },
    { slotKey: 'armour', disabled: false, disabledReason: null },
  ];

  return (
    <div className="mb-5">
      <div className="flex items-center gap-1.5 mb-3">
        <span className="material-symbols-outlined text-sm text-on-surface-variant/50">person</span>
        <span className="text-[10px] font-label text-on-surface-variant/50 uppercase tracking-widest">
          {t('inventory.equipment', 'Equipment')}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {columns.map(({ slotKey, disabled, disabledReason }) => {
          const cfg = SLOT_CONFIG[slotKey];
          return (
            <div key={slotKey} className="flex min-w-0 flex-col gap-2">
              <span className="text-center font-headline text-[11px] font-semibold tracking-wide text-on-surface-variant sm:text-xs">
                {t(cfg.label, cfg.fallback)}
              </span>
              <EquipmentSlot
                slotKey={slotKey}
                equipped={equipped}
                items={items}
                onEquipItem={onEquipItem}
                onUnequipItem={onUnequipItem}
                disabled={disabled}
                disabledReason={disabledReason}
                compact
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
