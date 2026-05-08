import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { gameData } from '../../../services/gameDataService';
import { getDistance } from '../../../services/combatEngine';
import Tooltip from '../../ui/Tooltip';

const MANOEUVRE_ICONS = {
  attack: 'swords',
  rangedAttack: 'gps_fixed',
  dodge: 'shield',
  feint: 'swap_horiz',
  charge: 'directions_run',
  flee: 'exit_to_app',
  castSpell: 'auto_awesome',
  defend: 'security',
};

function isCustomAttackManoeuvre(key) {
  return Boolean(key && gameData.manoeuvres[key]?.type === 'offensive');
}

function categorizeManoeuvres(allManoeuvres, targetType) {
  if (targetType === 'enemy') {
    return allManoeuvres.filter(([, m]) =>
      m.type === 'offensive' || m.type === 'magic'
    );
  }
  if (targetType === 'self') {
    return allManoeuvres.filter(([, m]) =>
      m.type === 'defensive' || m.type === 'magic'
    );
  }
  if (targetType === 'ally') {
    return allManoeuvres.filter(([, m]) => m.type === 'magic');
  }
  if (targetType === 'ground') {
    return allManoeuvres.filter(([, m]) =>
      m.modifiers.flee || m.type === 'movement'
    );
  }
  return allManoeuvres;
}

export default function ActionModal({
  anchorRect,
  target,
  targetType,
  myCombatant,
  availableManoeuvres,
  savedCustomAttacks,
  onExecute,
  onMoveToPosition,
  onClose,
  onPersistCustomAttack,
  onRemoveCustomAttack,
  onRegenerateSprite,
  t,
  targetYard,
}) {
  const [selectedManoeuvre, setSelectedManoeuvre] = useState(null);
  const [customDescription, setCustomDescription] = useState('');
  const [showSaved, setShowSaved] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const modalRef = useRef(null);

  const filteredManoeuvres = useMemo(
    () => categorizeManoeuvres(availableManoeuvres, targetType),
    [availableManoeuvres, targetType],
  );

  const dist = useMemo(() => {
    if (!target || !myCombatant || target.id === myCombatant.id) return null;
    return getDistance(myCombatant, target);
  }, [target, myCombatant]);

  const isMeleeOutOfRange = useCallback((key) => {
    const man = gameData.manoeuvres[key];
    if (!man || man.range !== 'melee' || !dist) return false;
    return dist > gameData.MELEE_RANGE;
  }, [dist]);

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        onClose();
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener('pointerdown', handleClickOutside);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', handleClickOutside);
    };
  }, [onClose]);

  const handleExecute = () => {
    if (!selectedManoeuvre) return;
    const trimmed = customDescription.trim();
    if (isCustomAttackManoeuvre(selectedManoeuvre) && trimmed) {
      onPersistCustomAttack?.(trimmed);
    }
    onExecute(selectedManoeuvre, target?.id || null, trimmed);
    onClose();
  };

  const handleMoveHere = () => {
    if (targetYard != null) {
      onMoveToPosition(targetYard);
      onClose();
    }
  };

  const handleRegenerateSprite = async () => {
    if (!target || !onRegenerateSprite || regenerating) return;
    setRegenerating(true);
    try {
      await onRegenerateSprite(target);
    } finally {
      setRegenerating(false);
    }
  };

  const modalStyle = useMemo(() => {
    if (!anchorRect) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    const pad = 12;
    let left = anchorRect.x + anchorRect.width / 2;
    let top = anchorRect.y - pad;

    if (left + 160 > window.innerWidth - pad) left = window.innerWidth - 170;
    if (left < pad) left = pad;
    if (top < pad) top = anchorRect.y + anchorRect.height + pad;

    return { top, left, transform: 'translate(-50%, -100%)' };
  }, [anchorRect]);

  return (
    <div
      ref={modalRef}
      className="combat-action-modal bg-surface-container-high border border-outline-variant/25 rounded-md shadow-2xl backdrop-blur-xl overflow-hidden"
      style={modalStyle}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-outline-variant/15">
        <div className="flex items-center gap-2 min-w-0">
          {target && (
            <span className={`text-[12px] font-bold truncate ${
              target.type === 'enemy' ? 'text-error' : 'text-primary'
            }`}>
              {target.name}
            </span>
          )}
          {targetType === 'ground' && targetYard != null && (
            <span className="text-[11px] text-on-surface-variant">
              {t('combat.position', 'Pos')} {targetYard}y
            </span>
          )}
          {dist != null && (
            <span className="text-[10px] text-on-surface-variant px-1.5 py-0.5 bg-surface-container rounded-sm">
              {dist}y
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {target && onRegenerateSprite && (
            <Tooltip
              content={t('combat.regenerateSprite', 'Nowy sprite')}
              variant="compact"
              placement="bottom"
              asChild
            >
              <button
                onClick={handleRegenerateSprite}
                disabled={regenerating}
                className="text-outline-variant hover:text-primary transition-colors p-0.5 disabled:opacity-40"
              >
                <span className={`material-symbols-outlined text-sm ${regenerating ? 'animate-spin' : ''}`}>
                  refresh
                </span>
              </button>
            </Tooltip>
          )}
          <button
            onClick={onClose}
            className="text-outline-variant hover:text-on-surface transition-colors p-0.5"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      </div>

      {/* Ground: move + flee */}
      {targetType === 'ground' && (
        <div className="p-2 space-y-1">
          {targetYard != null && myCombatant && (
            <button
              onClick={handleMoveHere}
              className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-bold rounded-sm bg-primary/10 text-primary border border-primary/15 hover:bg-primary/20 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">directions_walk</span>
              {t('combat.moveHere', 'Move here')}
              <span className="ml-auto text-[10px] text-on-surface-variant font-normal">
                {Math.abs((myCombatant.position ?? 0) - targetYard)}y
              </span>
            </button>
          )}
        </div>
      )}

      {/* Manoeuvres */}
      {filteredManoeuvres.length > 0 && (
        <div className="p-2 space-y-1">
          {filteredManoeuvres.map(([key, man]) => {
            const outOfRange = isMeleeOutOfRange(key);
            const isSelected = selectedManoeuvre === key;

            return (
              <Tooltip
                key={key}
                content={
                  <div className="text-[11px] max-w-[200px]">
                    <div className="font-bold">{t(`combat.manoeuvres.${key}`, man.name)}</div>
                    <div className="text-on-surface-variant mt-0.5">{man.description}</div>
                    {man.range && <div className="text-on-surface-variant mt-0.5">{t('combat.range', 'Range')}: {man.range}</div>}
                    {outOfRange && <div className="text-amber-400 mt-0.5">{t('combat.outOfRange', 'Target too far for melee. Move closer or use Charge.')}</div>}
                  </div>
                }
                placement="left"
                variant="default"
                asChild
              >
                <button
                  onClick={() => setSelectedManoeuvre(isSelected ? null : key)}
                  disabled={outOfRange}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-[11px] font-bold rounded-sm border transition-all ${
                    isSelected
                      ? 'bg-primary/15 text-primary border-primary/30'
                      : outOfRange
                        ? 'bg-surface-container/20 text-outline-variant border-outline-variant/5 opacity-40 cursor-not-allowed'
                        : 'bg-surface-container/40 text-on-surface-variant border-outline-variant/10 hover:border-primary/20 hover:bg-surface-container/60'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">{MANOEUVRE_ICONS[key] || 'help'}</span>
                  {t(`combat.manoeuvres.${key}`, man.name)}
                  {outOfRange && (
                    <span className="material-symbols-outlined text-[11px] ml-auto text-amber-500">warning</span>
                  )}
                </button>
              </Tooltip>
            );
          })}
        </div>
      )}

      {/* Custom attack description */}
      {selectedManoeuvre && isCustomAttackManoeuvre(selectedManoeuvre) && (
        <div className="px-2 pb-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] text-on-surface-variant">
              {t('combat.customAttackLabel', 'Describe your attack')}
            </label>
            {savedCustomAttacks?.length > 0 && (
              <button
                onClick={() => setShowSaved(!showSaved)}
                className="text-[9px] text-primary hover:text-primary/80 flex items-center gap-0.5"
              >
                <span className="material-symbols-outlined text-[11px]">history</span>
                {t('combat.savedAttacksButton', 'Twoje ataki')}
              </button>
            )}
          </div>
          {showSaved && savedCustomAttacks?.length > 0 && (
            <div className="rounded-sm border border-outline-variant/15 bg-surface-container/30 max-h-32 overflow-y-auto custom-scrollbar divide-y divide-outline-variant/10">
              {savedCustomAttacks.map((attack, i) => (
                <div key={`${i}_${attack}`} className="flex items-center gap-1 px-2 py-1.5">
                  <button
                    onClick={() => { setCustomDescription(attack); setShowSaved(false); }}
                    className="flex-1 min-w-0 text-left text-[11px] text-on-surface hover:text-primary transition-colors truncate"
                  >
                    {attack}
                  </button>
                  <button
                    onClick={() => onRemoveCustomAttack?.(attack)}
                    className="shrink-0 text-outline-variant hover:text-error transition-colors"
                  >
                    <span className="material-symbols-outlined text-[14px]">delete</span>
                  </button>
                </div>
              ))}
            </div>
          )}
          <textarea
            value={customDescription}
            onChange={(e) => setCustomDescription(e.target.value)}
            rows={2}
            placeholder={t('combat.customAttackPlaceholder', 'Describe how you strike to earn creativity bonus to the attack roll.')}
            className="w-full px-2 py-1.5 rounded-sm border border-outline-variant/15 bg-surface-container/40 text-[11px] text-on-surface placeholder:text-outline-variant/60 focus:outline-none focus:border-primary/30 resize-none"
          />
        </div>
      )}

      {/* Execute button */}
      {selectedManoeuvre && (
        <div className="px-2 pb-2">
          <button
            onClick={handleExecute}
            className="w-full px-3 py-2 text-[11px] font-bold uppercase tracking-widest bg-error/15 text-error border border-error/20 rounded-sm hover:bg-error/25 transition-colors"
          >
            {t('combat.execute', 'Execute')}
          </button>
        </div>
      )}
    </div>
  );
}
