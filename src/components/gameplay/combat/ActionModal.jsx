import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { gameData } from '../../../services/gameDataService';
import { getDistance } from '../../../services/combatEngine';
import { findSpell, SPELL_TREES } from '../../../data/rpgMagic';
import Tooltip from '../../ui/Tooltip';
import { typeIcons } from '../../character/inventory/constants';
import { apiClient } from '../../../services/apiClient';

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
  character,
  onAiAction,
  t,
  targetYard,
}) {
  const [selectedManoeuvre, setSelectedManoeuvre] = useState(null);
  const [customDescription, setCustomDescription] = useState('');
  const [showSaved, setShowSaved] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [selectedSpell, setSelectedSpell] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [bottomPanel, setBottomPanel] = useState(null); // 'inventory' | 'spells' | 'custom' | null
  const [aiDescription, setAiDescription] = useState('');
  const modalRef = useRef(null);

  const filteredManoeuvres = useMemo(
    () => categorizeManoeuvres(availableManoeuvres, targetType).filter(([key]) => key !== 'castSpell'),
    [availableManoeuvres, targetType],
  );

  const hasCastSpell = useMemo(
    () => categorizeManoeuvres(availableManoeuvres, targetType).some(([key]) => key === 'castSpell'),
    [availableManoeuvres, targetType],
  );

  const knownSpells = useMemo(() => {
    const known = character?.spells?.known || [];
    const mana = character?.mana || myCombatant?.mana || { current: 0, max: 0 };
    return known.map((name) => {
      const found = findSpell(name);
      if (!found) return null;
      const tree = SPELL_TREES[found.treeId];
      return {
        name,
        manaCost: found.spell.manaCost,
        treeName: tree?.name || '',
        icon: found.spell.icon || 'auto_awesome',
        canCast: mana.current >= found.spell.manaCost,
      };
    }).filter(Boolean);
  }, [character?.spells?.known, character?.mana, myCombatant?.mana]);

  const inventoryItems = useMemo(() => {
    return (character?.inventory || []).filter((item) => item && item.name);
  }, [character?.inventory]);

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
    const extraOpts = {};
    if (selectedManoeuvre === 'castSpell' && selectedSpell) {
      extraOpts.spellName = selectedSpell;
    }
    onExecute(selectedManoeuvre, target?.id || null, trimmed, extraOpts);
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

  const handleAiSubmit = () => {
    const trimmed = aiDescription.trim();
    if (!trimmed || !onAiAction) return;
    let actionText;
    if (bottomPanel === 'inventory' && selectedItem) {
      actionText = `[COMBAT TURN - USE ITEM: ${selectedItem.name}] ${trimmed}`;
    } else {
      actionText = `[COMBAT TURN - CUSTOM ACTION] ${trimmed}`;
    }
    onAiAction(actionText);
  };

  const handleSelectManoeuvre = (key) => {
    setSelectedItem(null);
    setSelectedManoeuvre(selectedManoeuvre === key ? null : key);
    setSelectedSpell(null);
  };

  const toggleBottomPanel = (panel) => {
    setBottomPanel((prev) => prev === panel ? null : panel);
    if (panel !== 'spells') setSelectedSpell(null);
    if (panel !== 'inventory') setSelectedItem(null);
    if (panel === 'custom' || panel === 'inventory') setAiDescription('');
  };

  const handleSelectItem = (item) => {
    setSelectedManoeuvre(null);
    setSelectedSpell(null);
    setSelectedItem(item);
    setAiDescription('');
    setBottomPanel('inventory');
  };

  const handleSelectSpell = (spellName) => {
    setSelectedManoeuvre('castSpell');
    setSelectedSpell(selectedSpell === spellName ? null : spellName);
  };

  const handleCustomAction = () => {
    toggleBottomPanel('custom');
  };

  const modalStyle = useMemo(() => {
    if (!anchorRect) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    const gap = 30;
    const pad = 12;
    let left = anchorRect.x + anchorRect.width / 2;
    let top = anchorRect.y - gap;

    if (left + 190 > window.innerWidth - pad) left = window.innerWidth - 200;
    if (left < pad) left = pad;
    if (top < pad) top = anchorRect.y + anchorRect.height + gap;

    return { top, left, transform: 'translate(-50%, -100%)' };
  }, [anchorRect]);

  const canExecuteManoeuvre = selectedManoeuvre && (selectedManoeuvre !== 'castSpell' || selectedSpell);

  const selectedMan = selectedManoeuvre ? gameData.manoeuvres[selectedManoeuvre] : null;

  return (
    <div
      ref={modalRef}
      className="combat-action-modal bg-surface-container-high border border-outline-variant/25 rounded-xl shadow-2xl backdrop-blur-xl overflow-hidden max-h-[70vh] overflow-y-auto custom-scrollbar"
      style={{ ...modalStyle, minWidth: 280, maxWidth: 380 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-outline-variant/15 sticky top-0 bg-surface-container-high z-10">
        <div className="flex items-center gap-2.5 min-w-0">
          {target && (
            <span className={`text-[16px] font-bold truncate ${
              target.type === 'enemy' ? 'text-error' : 'text-primary'
            }`}>
              {target.name}
            </span>
          )}
          {targetType === 'ground' && targetYard != null && (
            <span className="text-sm text-on-surface-variant">
              {t('combat.position', 'Pos')} {targetYard}y
            </span>
          )}
          {dist != null && (
            <span className="text-[13px] text-on-surface-variant px-1.5 py-0.5 bg-surface-container rounded">
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
                className="text-outline-variant hover:text-primary transition-colors p-1 disabled:opacity-40"
              >
                <span className={`material-symbols-outlined text-[20px] ${regenerating ? 'animate-spin' : ''}`}>
                  refresh
                </span>
              </button>
            </Tooltip>
          )}
          <button
            onClick={onClose}
            className="text-outline-variant hover:text-on-surface transition-colors p-1"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
      </div>

      {/* Ground: move here */}
      {targetType === 'ground' && targetYard != null && myCombatant && (
        <div className="p-3">
          <button
            onClick={handleMoveHere}
            className="w-full flex items-center gap-3 px-4 py-3 text-base font-bold rounded-lg bg-primary/10 text-primary border border-primary/15 hover:bg-primary/20 transition-colors"
          >
            <span className="material-symbols-outlined text-[22px]">directions_walk</span>
            {t('combat.moveHere', 'Move here')}
            <span className="ml-auto text-[14px] text-on-surface-variant font-normal">
              {Math.abs((myCombatant.position ?? 0) - targetYard)}y
            </span>
          </button>
        </div>
      )}

      {/* Manoeuvre icon grid */}
      {filteredManoeuvres.length > 0 && (
        <div className="px-3 pt-3 pb-2">
          <div className="grid grid-cols-4 gap-2 justify-items-center">
            {filteredManoeuvres.map(([key, man]) => {
              const outOfRange = isMeleeOutOfRange(key);
              const isSelected = selectedManoeuvre === key;

              return (
                <Tooltip
                  key={key}
                  content={
                    <div className="max-w-[220px]">
                      <div className="font-bold text-sm">{t(`combat.manoeuvres.${key}`, man.name)}</div>
                      {outOfRange && <div className="text-amber-400 text-xs mt-0.5">{t('combat.outOfRangeShort', 'Poza zasięgiem')}</div>}
                    </div>
                  }
                  placement="top"
                  variant="compact"
                  asChild
                >
                  <button
                    onClick={() => handleSelectManoeuvre(key)}
                    disabled={outOfRange}
                    className={`relative w-14 h-14 flex items-center justify-center rounded-lg border-2 transition-all duration-150 ${
                      isSelected
                        ? 'bg-primary/20 border-primary/50 text-primary scale-105 shadow-lg shadow-primary/10'
                        : outOfRange
                          ? 'bg-surface-container/20 border-outline-variant/10 text-outline-variant/40 cursor-not-allowed'
                          : 'bg-surface-container/40 border-outline-variant/15 text-on-surface-variant hover:bg-surface-container/70 hover:border-primary/30 hover:text-primary hover:scale-105'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[24px]">
                      {MANOEUVRE_ICONS[key] || 'help'}
                    </span>
                    {outOfRange && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full bg-amber-500/90 text-white">
                        <span className="material-symbols-outlined text-[10px]">priority_high</span>
                      </span>
                    )}
                  </button>
                </Tooltip>
              );
            })}
          </div>
        </div>
      )}

      {/* Selection detail panel (manoeuvres from top grid, not castSpell) */}
      {selectedManoeuvre && selectedManoeuvre !== 'castSpell' && selectedMan && (
        <div className="px-3 pb-3 space-y-2.5 animate-fade-in">
          <div className="flex items-center gap-2.5 px-3 py-2 bg-primary/5 border border-primary/15 rounded-lg">
            <span className="material-symbols-outlined text-[20px] text-primary">
              {MANOEUVRE_ICONS[selectedManoeuvre] || 'help'}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-primary">
                {t(`combat.manoeuvres.${selectedManoeuvre}`, selectedMan.name)}
              </div>
              <div className="text-xs text-on-surface-variant leading-snug mt-0.5">
                {selectedMan.description}
              </div>
            </div>
          </div>

          {/* Custom attack description */}
          {isCustomAttackManoeuvre(selectedManoeuvre) && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <label className="text-xs text-on-surface-variant font-medium">
                  {t('combat.customAttackLabel', 'Describe your attack')}
                </label>
                {savedCustomAttacks?.length > 0 && (
                  <button
                    onClick={() => setShowSaved(!showSaved)}
                    className="text-xs text-primary hover:text-primary/80 flex items-center gap-0.5"
                  >
                    <span className="material-symbols-outlined text-[14px]">history</span>
                    {t('combat.savedAttacksButton', 'Twoje ataki')}
                  </button>
                )}
              </div>
              {showSaved && savedCustomAttacks?.length > 0 && (
                <div className="rounded-lg border border-outline-variant/15 bg-surface-container/30 max-h-32 overflow-y-auto custom-scrollbar divide-y divide-outline-variant/10">
                  {savedCustomAttacks.map((attack, i) => (
                    <div key={`${i}_${attack}`} className="flex items-center gap-1.5 px-3 py-1.5">
                      <button
                        onClick={() => { setCustomDescription(attack); setShowSaved(false); }}
                        className="flex-1 min-w-0 text-left text-sm text-on-surface hover:text-primary transition-colors truncate"
                      >
                        {attack}
                      </button>
                      <button
                        onClick={() => onRemoveCustomAttack?.(attack)}
                        className="shrink-0 text-outline-variant hover:text-error transition-colors"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
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
                className="w-full px-3 py-2 rounded-lg border border-outline-variant/15 bg-surface-container/40 text-sm text-on-surface placeholder:text-outline-variant/60 focus:outline-none focus:border-primary/30 resize-none"
              />
            </div>
          )}

          {/* Execute manoeuvre button */}
          {canExecuteManoeuvre && (
            <button
              onClick={handleExecute}
              className="w-full px-4 py-2.5 text-sm font-bold uppercase tracking-wider bg-error/15 text-error border border-error/20 rounded-lg hover:bg-error/25 transition-colors"
            >
              {t('combat.execute', 'Execute')}
            </button>
          )}
        </div>
      )}

      {/* Extra actions: Inventory + Cast Spell + Custom (square icon row) */}
      {targetType !== 'ground' && (
        <div className="px-3 pb-2">
          <div className="border-t border-outline-variant/10 mb-2.5" />
          <div className="flex items-center gap-2">
            {inventoryItems.length > 0 && (
              <Tooltip
                content={t('combat.inventory', 'Przedmioty')}
                variant="compact"
                placement="top"
                asChild
              >
                <button
                  onClick={() => toggleBottomPanel('inventory')}
                  className={`relative w-14 h-14 flex items-center justify-center rounded-lg border-2 transition-all duration-150 ${
                    bottomPanel === 'inventory'
                      ? 'bg-tertiary/20 border-tertiary/50 text-tertiary scale-105 shadow-lg shadow-tertiary/10'
                      : 'bg-surface-container/40 border-outline-variant/15 text-on-surface-variant hover:bg-surface-container/70 hover:border-tertiary/30 hover:text-tertiary hover:scale-105'
                  }`}
                >
                  <span className="material-symbols-outlined text-[24px]">inventory_2</span>
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-tertiary/90 text-white text-[10px] font-bold px-1">
                    {inventoryItems.length}
                  </span>
                </button>
              </Tooltip>
            )}
            {hasCastSpell && knownSpells.length > 0 && (
              <Tooltip
                content={t('combat.manoeuvres.castSpell', 'Rzuć zaklęcie')}
                variant="compact"
                placement="top"
                asChild
              >
                <button
                  onClick={() => toggleBottomPanel('spells')}
                  className={`w-14 h-14 flex items-center justify-center rounded-lg border-2 transition-all duration-150 ${
                    bottomPanel === 'spells'
                      ? 'bg-violet-500/20 border-violet-500/50 text-violet-400 scale-105 shadow-lg shadow-violet-500/10'
                      : 'bg-surface-container/40 border-outline-variant/15 text-on-surface-variant hover:bg-surface-container/70 hover:border-violet-500/30 hover:text-violet-400 hover:scale-105'
                  }`}
                >
                  <span className="material-symbols-outlined text-[24px]">auto_awesome</span>
                </button>
              </Tooltip>
            )}
            <Tooltip
              content={t('combat.customAction', 'Własna akcja')}
              variant="compact"
              placement="top"
              asChild
            >
              <button
                onClick={() => toggleBottomPanel('custom')}
                className={`w-14 h-14 flex items-center justify-center rounded-lg border-2 transition-all duration-150 ${
                  bottomPanel === 'custom'
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-400 scale-105 shadow-lg shadow-amber-500/10'
                    : 'bg-surface-container/40 border-outline-variant/15 text-on-surface-variant hover:bg-surface-container/70 hover:border-amber-500/30 hover:text-amber-400 hover:scale-105'
                }`}
              >
                <span className="material-symbols-outlined text-[24px]">edit_note</span>
              </button>
            </Tooltip>
          </div>
        </div>
      )}

      {/* Spells grid panel */}
      {bottomPanel === 'spells' && knownSpells.length > 0 && (
        <div className="px-3 pb-3 animate-fade-in space-y-2">
          <div className="grid grid-cols-4 gap-2 justify-items-center">
            {knownSpells.map((spell) => (
              <Tooltip
                key={spell.name}
                content={
                  <div className="max-w-[200px]">
                    <div className="font-bold text-sm">{spell.name}</div>
                    <div className="text-xs text-on-surface-variant">{spell.manaCost}m · {spell.treeName}</div>
                    {!spell.canCast && <div className="text-amber-400 text-xs mt-0.5">Za mało many</div>}
                  </div>
                }
                variant="compact"
                placement="top"
                asChild
              >
                <button
                  onClick={() => handleSelectSpell(spell.name)}
                  disabled={!spell.canCast}
                  className={`relative w-14 h-14 flex items-center justify-center rounded-lg border-2 transition-all duration-150 ${
                    selectedSpell === spell.name
                      ? 'bg-violet-500/20 border-violet-500/50 text-violet-400 scale-105 shadow-lg shadow-violet-500/10'
                      : !spell.canCast
                        ? 'bg-surface-container/20 border-outline-variant/10 text-outline-variant/40 cursor-not-allowed'
                        : 'bg-surface-container/40 border-outline-variant/15 text-on-surface-variant hover:bg-surface-container/70 hover:border-violet-500/30 hover:text-violet-400 hover:scale-105'
                  }`}
                >
                  <span className="material-symbols-outlined text-[24px]">{spell.icon}</span>
                </button>
              </Tooltip>
            ))}
          </div>
          {/* Selected spell detail */}
          {selectedSpell && (
            <div className="animate-fade-in space-y-2">
              <div className="flex items-center gap-2.5 px-3 py-2 bg-violet-500/5 border border-violet-500/15 rounded-lg">
                <span className="material-symbols-outlined text-[20px] text-violet-400">auto_awesome</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-violet-400">{selectedSpell}</div>
                  <div className="text-xs text-on-surface-variant">
                    {knownSpells.find((s) => s.name === selectedSpell)?.manaCost}m · {knownSpells.find((s) => s.name === selectedSpell)?.treeName}
                  </div>
                </div>
              </div>
              <button
                onClick={handleExecute}
                className="w-full px-4 py-2.5 text-sm font-bold uppercase tracking-wider bg-violet-500/15 text-violet-400 border border-violet-500/20 rounded-lg hover:bg-violet-500/25 transition-colors"
              >
                {t('combat.execute', 'Execute')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Inventory items grid panel */}
      {bottomPanel === 'inventory' && inventoryItems.length > 0 && (
        <div className="px-3 pb-3 animate-fade-in space-y-2">
          <div className="grid grid-cols-5 gap-1.5 max-h-40 overflow-y-auto custom-scrollbar">
            {inventoryItems.slice(0, 15).map((item) => {
              const isItemSelected = selectedItem?.id === item.id;
              return (
                <Tooltip
                  key={item.id}
                  content={
                    <div className="text-sm">
                      <div className="font-bold">{item.name}</div>
                      {item.quantity > 1 && <div className="text-on-surface-variant">x{item.quantity}</div>}
                      {item.type && <div className="text-on-surface-variant text-xs">{item.type}</div>}
                    </div>
                  }
                  variant="compact"
                  placement="top"
                  asChild
                >
                  <button
                    onClick={() => handleSelectItem(item)}
                    className={`relative aspect-square rounded-lg border-2 overflow-hidden flex items-center justify-center transition-all duration-150 ${
                      isItemSelected
                        ? 'bg-tertiary/15 border-tertiary/40 ring-1 ring-tertiary/30 scale-105'
                        : 'bg-surface-container/30 border-outline-variant/10 hover:border-tertiary/20 hover:scale-105'
                    }`}
                  >
                    {item.imageUrl ? (
                      <img src={apiClient.resolveMediaUrl(item.imageUrl)} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <span
                        className="material-symbols-outlined text-xl text-on-surface-variant/50"
                        style={{ fontVariationSettings: "'FILL' 1, 'wght' 300" }}
                      >
                        {typeIcons[item.type] || typeIcons.misc}
                      </span>
                    )}
                    {item.quantity > 1 && (
                      <span className="absolute bottom-0 right-0 text-[9px] font-bold bg-surface-container/80 text-on-surface-variant px-0.5 rounded-tl leading-tight">
                        x{item.quantity}
                      </span>
                    )}
                  </button>
                </Tooltip>
              );
            })}
          </div>
          {/* Selected item detail + AI description */}
          {selectedItem && (
            <div className="animate-fade-in space-y-2">
              <div className="flex items-center gap-2 px-3 py-2 bg-tertiary/5 border border-tertiary/15 rounded-lg">
                <span className="material-symbols-outlined text-[18px] text-tertiary">inventory_2</span>
                <span className="text-sm font-medium text-tertiary truncate">{selectedItem.name}</span>
              </div>
              <textarea
                autoFocus
                value={aiDescription}
                onChange={(e) => setAiDescription(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    handleAiSubmit();
                  }
                }}
                rows={2}
                placeholder={t('combat.useItemPlaceholder', 'Opisz jak używasz tego przedmiotu w walce...')}
                className="w-full px-3 py-2 rounded-lg border border-outline-variant/15 bg-surface-container/40 text-sm text-on-surface placeholder:text-outline-variant/60 focus:outline-none focus:border-tertiary/30 resize-none"
              />
              <Tooltip
                content={t('combat.executeAiAction', 'Wykonaj (AI)')}
                variant="compact"
                placement="right"
                asChild
              >
                <button
                  onClick={handleAiSubmit}
                  disabled={!aiDescription.trim()}
                  className={`w-14 h-14 flex items-center justify-center rounded-lg border-2 transition-all duration-150 ${
                    aiDescription.trim()
                      ? 'bg-tertiary/20 border-tertiary/50 text-tertiary hover:scale-105 hover:shadow-lg hover:shadow-tertiary/10'
                      : 'bg-surface-container/30 border-outline-variant/10 text-on-surface-variant/40 cursor-not-allowed'
                  }`}
                >
                  <span className="material-symbols-outlined text-[24px]">bolt</span>
                </button>
              </Tooltip>
            </div>
          )}
        </div>
      )}

      {/* Custom action panel */}
      {bottomPanel === 'custom' && (
        <div className="px-3 pb-3 space-y-2 animate-fade-in">
          <textarea
            autoFocus
            value={aiDescription}
            onChange={(e) => setAiDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleAiSubmit();
              }
            }}
            rows={2}
            placeholder={t('combat.customActionPlaceholder', 'Opisz co robisz w tej turze...')}
            className="w-full px-3 py-2 rounded-lg border border-outline-variant/15 bg-surface-container/40 text-sm text-on-surface placeholder:text-outline-variant/60 focus:outline-none focus:border-amber-500/30 resize-none"
          />
          <Tooltip
            content={t('combat.executeAiAction', 'Wykonaj (AI)')}
            variant="compact"
            placement="right"
            asChild
          >
            <button
              onClick={handleAiSubmit}
              disabled={!aiDescription.trim()}
              className={`w-14 h-14 flex items-center justify-center rounded-lg border-2 transition-all duration-150 ${
                aiDescription.trim()
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-400 hover:scale-105 hover:shadow-lg hover:shadow-amber-500/10'
                  : 'bg-surface-container/30 border-outline-variant/10 text-on-surface-variant/40 cursor-not-allowed'
              }`}
            >
              <span className="material-symbols-outlined text-[24px]">bolt</span>
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
