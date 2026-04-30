import { useTranslation } from 'react-i18next';
import { gameData } from '../../../services/gameDataService';
import EquipmentSlot from './EquipmentSlot';

export default function EquipmentSlotsBar({ equipped, items, onEquipItem, onUnequipItem }) {
  const { t } = useTranslation();

  const mainHandItem = equipped?.mainHand ? items.find((i) => i.id === equipped.mainHand) : null;
  const mainIsTwoHanded = mainHandItem?.baseType ? gameData.isTwoHanded(mainHandItem.baseType) : false;

  return (
    <div className="mb-4">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="material-symbols-outlined text-sm text-on-surface-variant/50">person</span>
        <span className="text-[10px] font-label text-on-surface-variant/50 uppercase tracking-widest">
          {t('inventory.equipment', 'Equipment')}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <EquipmentSlot
          slotKey="mainHand"
          equipped={equipped}
          items={items}
          onEquipItem={onEquipItem}
          onUnequipItem={onUnequipItem}
        />
        <EquipmentSlot
          slotKey="offHand"
          equipped={equipped}
          items={items}
          onEquipItem={onEquipItem}
          onUnequipItem={onUnequipItem}
          disabled={mainIsTwoHanded}
          disabledReason={t('inventory.twoHandedBlocked', 'Two-handed weapon equipped')}
        />
        <EquipmentSlot
          slotKey="armour"
          equipped={equipped}
          items={items}
          onEquipItem={onEquipItem}
          onUnequipItem={onUnequipItem}
        />
      </div>
    </div>
  );
}
