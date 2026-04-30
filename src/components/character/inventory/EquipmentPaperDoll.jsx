import { useTranslation } from 'react-i18next';
import { gameData } from '../../../services/gameDataService';
import EquipmentSlot from './EquipmentSlot';
import { DECORATIVE_SLOT_CONFIG } from './constants';

function CharacterSilhouette() {
  const bodyPaths = (
    <>
      <circle cx="40" cy="20" r="11" />
      <path d="M 25 34 Q 40 30 55 34 L 60 70 Q 60 88 55 100 L 50 105 L 30 105 L 25 100 Q 20 88 20 70 Z" />
      <path d="M 22 36 Q 16 45 13 65 Q 11 85 14 108 L 20 110 Q 22 95 24 80 Q 25 65 25 45 Z" />
      <path d="M 58 36 Q 64 45 67 65 Q 69 85 66 108 L 60 110 Q 58 95 56 80 Q 55 65 55 45 Z" />
      <path d="M 30 105 L 28 160 L 34 190 L 40 190 L 40 110 Z" />
      <path d="M 50 105 L 52 160 L 46 190 L 40 190 L 40 110 Z" />
    </>
  );

  return (
    <div className="w-full h-full flex items-center justify-center p-1 select-none pointer-events-none">
      <svg
        viewBox="0 0 80 200"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
        aria-hidden
      >
        <defs>
          <linearGradient id="paperDollBody" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#0c0a14" stopOpacity="0.98" />
            <stop offset="55%" stopColor="#050408" stopOpacity="0.98" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id="paperDollRim" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b6bcc" stopOpacity="0.55" />
            <stop offset="45%" stopColor="#3b2a5c" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="paperDollFog" cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="#3d2a5c" stopOpacity="0.22" />
            <stop offset="70%" stopColor="#0a0612" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>
        </defs>

        <ellipse cx="40" cy="100" rx="38" ry="78" fill="url(#paperDollFog)" />
        <ellipse cx="40" cy="193" rx="19" ry="3" fill="#000000" opacity="0.6" />

        <g fill="url(#paperDollBody)" stroke="#000000" strokeWidth="0.6" strokeOpacity="0.9">
          {bodyPaths}
        </g>

        <g fill="url(#paperDollRim)" style={{ mixBlendMode: 'screen' }}>
          {bodyPaths}
        </g>
      </svg>
    </div>
  );
}

export default function EquipmentPaperDoll({ equipped, items, onEquipItem, onUnequipItem }) {
  const { t } = useTranslation();

  const mainHandItem = equipped?.mainHand ? items.find((i) => i.id === equipped.mainHand) : null;
  const mainIsTwoHanded = mainHandItem?.baseType ? gameData.isTwoHanded(mainHandItem.baseType) : false;

  const decor = (key) => (
    <EquipmentSlot
      slotKey={key}
      config={DECORATIVE_SLOT_CONFIG[key]}
      comingSoon
      compact
    />
  );

  return (
    <div className="mb-4">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="material-symbols-outlined text-sm text-on-surface-variant/50">person</span>
        <span className="text-[10px] font-label text-on-surface-variant/50 uppercase tracking-widest">
          {t('inventory.equipment', 'Equipment')}
        </span>
      </div>

      <div
        className="grid gap-1.5"
        style={{
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.3fr) minmax(0, 1fr)',
          gridTemplateRows: 'repeat(7, minmax(0, auto))',
        }}
      >
        <div className="col-start-1 row-start-1">{decor('head')}</div>
        <div className="col-start-3 row-start-1">{decor('neck')}</div>

        <div
          className="col-start-2 row-start-1 row-span-6 relative flex items-center justify-center bg-gradient-to-b from-black/55 via-black/40 to-black/60 border border-outline-variant/10 rounded-sm overflow-hidden shadow-[inset_0_0_24px_rgba(0,0,0,0.6)]"
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse at 50% 45%, rgba(88,62,141,0.18), transparent 65%)',
            }}
          />
          <CharacterSilhouette />
        </div>

        <div className="col-start-1 row-start-2">{decor('shoulders')}</div>
        <div className="col-start-3 row-start-2">{decor('amulet')}</div>

        <div className="col-start-1 row-start-3">
          <EquipmentSlot
            slotKey="armour"
            equipped={equipped}
            items={items}
            onEquipItem={onEquipItem}
            onUnequipItem={onUnequipItem}
            compact
          />
        </div>
        <div className="col-start-3 row-start-3">{decor('gloves')}</div>

        <div className="col-start-1 row-start-4">{decor('cloak')}</div>
        <div className="col-start-3 row-start-4">{decor('belt')}</div>

        <div className="col-start-1 row-start-5">{decor('ring1')}</div>
        <div className="col-start-3 row-start-5">{decor('ring2')}</div>

        <div className="col-start-1 row-start-6">{decor('legs')}</div>
        <div className="col-start-3 row-start-6">{decor('quiver')}</div>

        <div className="col-start-1 row-start-7">
          <EquipmentSlot
            slotKey="mainHand"
            equipped={equipped}
            items={items}
            onEquipItem={onEquipItem}
            onUnequipItem={onUnequipItem}
            compact
          />
        </div>
        <div className="col-start-2 row-start-7">{decor('boots')}</div>
        <div className="col-start-3 row-start-7">
          <EquipmentSlot
            slotKey="offHand"
            equipped={equipped}
            items={items}
            onEquipItem={onEquipItem}
            onUnequipItem={onUnequipItem}
            disabled={mainIsTwoHanded}
            disabledReason={t('inventory.twoHandedBlocked', 'Two-handed weapon equipped')}
            compact
          />
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center gap-1.5 w-full mb-2">
          <div className="flex-1 h-px bg-outline-variant/15" />
          <span className="text-[9px] font-label text-on-surface-variant/50 uppercase tracking-widest">
            {t('inventory.talismans', 'Talismans')}
          </span>
          <div className="flex-1 h-px bg-outline-variant/15" />
        </div>
        <div className="grid grid-cols-2 gap-1.5 max-w-[50%] mx-auto">
          {decor('talisman1')}
          {decor('talisman2')}
        </div>
      </div>
    </div>
  );
}
