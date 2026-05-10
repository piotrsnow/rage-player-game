import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { gameData } from '../../../services/gameDataService';
import { getDistance, getShoveCells, canCharge } from '../../../services/combatEngine';
import { SPELL_TREES } from '../../../data/rpgMagic';
import { resolveKnownSpellDisplay } from '../../../services/magicEngine';
import Tooltip from '../../ui/Tooltip';
import { typeIcons } from '../../character/inventory/constants';
import { apiClient } from '../../../services/apiClient';

const SPELL_TREE_COLORS = {
  ogien: {
    selected: 'bg-orange-500/20 border-orange-500/50 text-orange-400 shadow-lg shadow-orange-500/10',
    idle:     'bg-surface-container/40 border-outline-variant/15 text-orange-400/60 hover:bg-surface-container/70 hover:border-orange-500/30 hover:text-orange-400',
    detail:   { bg: 'bg-orange-500/5', border: 'border-orange-500/15', text: 'text-orange-400', btn: 'bg-orange-500/15 text-orange-400 border-orange-500/20 hover:bg-orange-500/25' },
  },
  blyskawice: {
    selected: 'bg-yellow-400/20 border-yellow-400/50 text-yellow-300 shadow-lg shadow-yellow-400/10',
    idle:     'bg-surface-container/40 border-outline-variant/15 text-yellow-300/60 hover:bg-surface-container/70 hover:border-yellow-400/30 hover:text-yellow-300',
    detail:   { bg: 'bg-yellow-400/5', border: 'border-yellow-400/15', text: 'text-yellow-300', btn: 'bg-yellow-400/15 text-yellow-300 border-yellow-400/20 hover:bg-yellow-400/25' },
  },
  ochrona: {
    selected: 'bg-sky-500/20 border-sky-500/50 text-sky-400 shadow-lg shadow-sky-500/10',
    idle:     'bg-surface-container/40 border-outline-variant/15 text-sky-400/60 hover:bg-surface-container/70 hover:border-sky-500/30 hover:text-sky-400',
    detail:   { bg: 'bg-sky-500/5', border: 'border-sky-500/15', text: 'text-sky-400', btn: 'bg-sky-500/15 text-sky-400 border-sky-500/20 hover:bg-sky-500/25' },
  },
  niewidzialnosc: {
    selected: 'bg-gray-400/20 border-gray-400/50 text-gray-300 shadow-lg shadow-gray-400/10',
    idle:     'bg-surface-container/40 border-outline-variant/15 text-gray-300/60 hover:bg-surface-container/70 hover:border-gray-400/30 hover:text-gray-300',
    detail:   { bg: 'bg-gray-400/5', border: 'border-gray-400/15', text: 'text-gray-300', btn: 'bg-gray-400/15 text-gray-300 border-gray-400/20 hover:bg-gray-400/25' },
  },
  lod: {
    selected: 'bg-cyan-400/20 border-cyan-400/50 text-cyan-300 shadow-lg shadow-cyan-400/10',
    idle:     'bg-surface-container/40 border-outline-variant/15 text-cyan-300/60 hover:bg-surface-container/70 hover:border-cyan-400/30 hover:text-cyan-300',
    detail:   { bg: 'bg-cyan-400/5', border: 'border-cyan-400/15', text: 'text-cyan-300', btn: 'bg-cyan-400/15 text-cyan-300 border-cyan-400/20 hover:bg-cyan-400/25' },
  },
  leczenie: {
    selected: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 shadow-lg shadow-emerald-500/10',
    idle:     'bg-surface-container/40 border-outline-variant/15 text-emerald-400/60 hover:bg-surface-container/70 hover:border-emerald-500/30 hover:text-emerald-400',
    detail:   { bg: 'bg-emerald-500/5', border: 'border-emerald-500/15', text: 'text-emerald-400', btn: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/25' },
  },
  przestrzen: {
    selected: 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400 shadow-lg shadow-indigo-500/10',
    idle:     'bg-surface-container/40 border-outline-variant/15 text-indigo-400/60 hover:bg-surface-container/70 hover:border-indigo-500/30 hover:text-indigo-400',
    detail:   { bg: 'bg-indigo-500/5', border: 'border-indigo-500/15', text: 'text-indigo-400', btn: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20 hover:bg-indigo-500/25' },
  },
  umysl: {
    selected: 'bg-pink-500/20 border-pink-500/50 text-pink-400 shadow-lg shadow-pink-500/10',
    idle:     'bg-surface-container/40 border-outline-variant/15 text-pink-400/60 hover:bg-surface-container/70 hover:border-pink-500/30 hover:text-pink-400',
    detail:   { bg: 'bg-pink-500/5', border: 'border-pink-500/15', text: 'text-pink-400', btn: 'bg-pink-500/15 text-pink-400 border-pink-500/20 hover:bg-pink-500/25' },
  },
  wiatr_percepcja: {
    selected: 'bg-teal-400/20 border-teal-400/50 text-teal-300 shadow-lg shadow-teal-400/10',
    idle:     'bg-surface-container/40 border-outline-variant/15 text-teal-300/60 hover:bg-surface-container/70 hover:border-teal-400/30 hover:text-teal-300',
    detail:   { bg: 'bg-teal-400/5', border: 'border-teal-400/15', text: 'text-teal-300', btn: 'bg-teal-400/15 text-teal-300 border-teal-400/20 hover:bg-teal-400/25' },
  },
};
const DEFAULT_SPELL_COLOR = {
  selected: 'bg-violet-500/20 border-violet-500/50 text-violet-400 shadow-lg shadow-violet-500/10',
  idle:     'bg-surface-container/40 border-outline-variant/15 text-violet-400/60 hover:bg-surface-container/70 hover:border-violet-500/30 hover:text-violet-400',
  detail:   { bg: 'bg-violet-500/5', border: 'border-violet-500/15', text: 'text-violet-400', btn: 'bg-violet-500/15 text-violet-400 border-violet-500/20 hover:bg-violet-500/25' },
};

const MANOEUVRE_ICONS = {
  attack: 'swords',
  rangedAttack: 'gps_fixed',
  dodge: 'shield',
  feint: 'swap_horiz',
  charge: 'directions_run',
  flee: 'exit_to_app',
  castSpell: 'auto_awesome',
  defend: 'security',
  shove: 'move_group',
};

const CUSTOM_ACTIONS_STORAGE_KEY = 'rpgon:combatCustomActions';
const SPELL_DESCRIPTIONS_STORAGE_KEY = 'rpgon:combatSpellDescriptions';
const ITEM_DESCRIPTIONS_STORAGE_KEY = 'rpgon:combatItemDescriptions';
const MAX_CUSTOM_ACTIONS = 15;

function loadStoredItems(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(s => typeof s === 'string' && s.trim()) : [];
  } catch { return []; }
}

function saveStoredItem(storageKey, text) {
  const trimmed = text.trim();
  if (!trimmed) return;
  const current = loadStoredItems(storageKey);
  const updated = [trimmed, ...current.filter(a => a !== trimmed)].slice(0, MAX_CUSTOM_ACTIONS);
  localStorage.setItem(storageKey, JSON.stringify(updated));
}

function deleteStoredItem(storageKey, text) {
  const trimmed = text.trim();
  if (!trimmed) return;
  const updated = loadStoredItems(storageKey).filter(a => a !== trimmed);
  localStorage.setItem(storageKey, JSON.stringify(updated));
}

function isCustomAttackManoeuvre(key) {
  return Boolean(key && gameData.manoeuvres[key]?.type === 'offensive' && !gameData.manoeuvres[key]?.modifiers?.shove);
}

function normalizePos(p) {
  if (p && typeof p === 'object' && 'x' in p) return p;
  if (typeof p === 'number') return { x: p, y: 4 };
  return { x: 0, y: 0 };
}

function ShoveCellPicker({ target, shoveCells, selectedCell, onSelect }) {
  const tp = normalizePos(target.position);

  const grid = [];
  for (let dy = -2; dy <= 2; dy++) {
    const row = [];
    for (let dx = -2; dx <= 2; dx++) {
      const cx = tp.x + dx;
      const cy = tp.y + dy;
      const isTarget = dx === 0 && dy === 0;
      const isValid = shoveCells.some(c => c.x === cx && c.y === cy);
      const isSelected = selectedCell && selectedCell.x === cx && selectedCell.y === cy;
      row.push({ x: cx, y: cy, isTarget, isValid, isSelected });
    }
    grid.push(row);
  }

  return (
    <div className="flex justify-center">
      <div className="grid grid-cols-5 gap-0.5">
        {grid.map((row) =>
          row.map((cell) => (
            <button
              key={`${cell.x}_${cell.y}`}
              disabled={!cell.isValid}
              onClick={() => cell.isValid && onSelect({ x: cell.x, y: cell.y })}
              className={`w-6 h-6 rounded-sm border flex items-center justify-center text-[9px] font-bold transition-colors ${
                cell.isTarget
                  ? 'bg-error/20 border-error/40 text-error cursor-default'
                  : cell.isSelected
                    ? 'bg-primary/30 border-primary/60 text-primary shadow-md'
                    : cell.isValid
                      ? 'bg-surface-container/50 border-primary/30 text-on-surface-variant hover:bg-primary/15 hover:border-primary/50 cursor-pointer'
                      : 'bg-surface-container/20 border-outline-variant/10 text-outline-variant/30 cursor-not-allowed'
              }`}
            >
              {cell.isTarget ? (
                <span className="material-symbols-outlined text-[10px]">person</span>
              ) : cell.isValid ? (
                <span className="material-symbols-outlined text-[10px]">arrow_forward</span>
              ) : null}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function SuggestionList({ items, onSelect, onDelete }) {
  if (!Array.isArray(items) || items.length === 0) return null;

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-outline-variant/10">
      {items.map((value, i) => (
        <div key={`${i}_${value}`} className="group flex items-center gap-1 px-2 py-1">
          <button
            onClick={() => onSelect?.(value)}
            className="flex-1 min-w-0 text-left text-xs text-on-surface hover:text-primary transition-colors truncate"
          >
            {value}
          </button>
          <button
            onClick={() => onDelete?.(value)}
            className="shrink-0 text-outline-variant hover:text-error transition-colors opacity-0 group-hover:opacity-100"
          >
            <span className="material-symbols-outlined text-sm">delete</span>
          </button>
        </div>
      ))}
    </div>
  );
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
  combatants,
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
  targetCell,
}) {
  const [selectedManoeuvre, setSelectedManoeuvre] = useState(null);
  const [customDescription, setCustomDescription] = useState('');
  const [regenerating, setRegenerating] = useState(false);
  const [selectedSpell, setSelectedSpell] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [bottomPanel, setBottomPanel] = useState(null); // 'inventory' | 'spells' | 'custom' | null
  const [aiDescription, setAiDescription] = useState('');
  const [selectedShoveCell, setSelectedShoveCell] = useState(null);
  const [savedCustomActions, setSavedCustomActions] = useState(() => loadStoredItems(CUSTOM_ACTIONS_STORAGE_KEY));
  const [savedSpellDescriptions, setSavedSpellDescriptions] = useState(() => loadStoredItems(SPELL_DESCRIPTIONS_STORAGE_KEY));
  const [savedItemDescriptions, setSavedItemDescriptions] = useState(() => loadStoredItems(ITEM_DESCRIPTIONS_STORAGE_KEY));
  const modalRef = useRef(null);

  const filteredManoeuvres = useMemo(
    () => categorizeManoeuvres(availableManoeuvres, targetType).filter(([key]) => key !== 'castSpell' && key !== 'feint'),
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
      const meta = resolveKnownSpellDisplay(name, character);
      const tree = meta.treeId ? SPELL_TREES[meta.treeId] : null;
      return {
        name,
        manaCost: meta.manaCost,
        treeId: meta.treeId,
        treeName: tree?.name || '',
        icon: meta.icon || tree?.icon || 'auto_awesome',
        canCast: mana.current >= meta.manaCost,
      };
    });
  }, [character?.spells?.known, character?.spells?.icons, character?.mana, myCombatant?.mana]);

  const inventoryItems = useMemo(() => {
    return (character?.inventory || []).filter((item) => item && item.name);
  }, [character?.inventory]);

  const dist = useMemo(() => {
    if (!target || !myCombatant || target.id === myCombatant.id) return null;
    return getDistance(myCombatant, target);
  }, [target, myCombatant]);

  const shoveCells = useMemo(() => {
    if (selectedManoeuvre !== 'shove' || !target || !myCombatant || target.id === myCombatant.id) return [];
    return getShoveCells(myCombatant, target, combatants || []);
  }, [selectedManoeuvre, target, myCombatant, combatants]);

  const isMeleeOutOfRange = useCallback((key) => {
    const man = gameData.manoeuvres[key];
    if (!man || man.range !== 'melee' || !dist) return false;
    if (man.modifiers?.shove) return dist > 1;
    return dist > gameData.MELEE_RANGE;
  }, [dist]);

  const chargeBlockReason = useMemo(() => {
    if (!myCombatant || !target || target.id === myCombatant.id) return null;
    const result = canCharge(myCombatant, target, combatants || []);
    return result.valid ? null : result.reason;
  }, [myCombatant, target, combatants]);

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
    if (selectedManoeuvre === 'castSpell' && trimmed) {
      saveStoredItem(SPELL_DESCRIPTIONS_STORAGE_KEY, trimmed);
      setSavedSpellDescriptions(loadStoredItems(SPELL_DESCRIPTIONS_STORAGE_KEY));
    }
    const extraOpts = {};
    if (selectedManoeuvre === 'castSpell' && selectedSpell) {
      extraOpts.spellName = selectedSpell;
    }
    if (selectedManoeuvre === 'shove' && selectedShoveCell) {
      extraOpts.pushTarget = selectedShoveCell;
    }
    onExecute(selectedManoeuvre, target?.id || null, trimmed, extraOpts);
    onClose();
  };

  const handleMoveHere = () => {
    if (targetCell) {
      onMoveToPosition(targetCell);
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
      saveStoredItem(ITEM_DESCRIPTIONS_STORAGE_KEY, trimmed);
      setSavedItemDescriptions(loadStoredItems(ITEM_DESCRIPTIONS_STORAGE_KEY));
    } else {
      actionText = `[COMBAT TURN - CUSTOM ACTION] ${trimmed}`;
      saveStoredItem(CUSTOM_ACTIONS_STORAGE_KEY, trimmed);
      setSavedCustomActions(loadStoredItems(CUSTOM_ACTIONS_STORAGE_KEY));
    }
    onAiAction(actionText);
  };

  const handleDeleteCustomAction = useCallback((text) => {
    deleteStoredItem(CUSTOM_ACTIONS_STORAGE_KEY, text);
    setSavedCustomActions(loadStoredItems(CUSTOM_ACTIONS_STORAGE_KEY));
  }, []);

  const handleDeleteSpellDescription = useCallback((text) => {
    deleteStoredItem(SPELL_DESCRIPTIONS_STORAGE_KEY, text);
    setSavedSpellDescriptions(loadStoredItems(SPELL_DESCRIPTIONS_STORAGE_KEY));
  }, []);

  const handleDeleteItemDescription = useCallback((text) => {
    deleteStoredItem(ITEM_DESCRIPTIONS_STORAGE_KEY, text);
    setSavedItemDescriptions(loadStoredItems(ITEM_DESCRIPTIONS_STORAGE_KEY));
  }, []);

  const handleSelectManoeuvre = (key) => {
    setSelectedItem(null);
    setSelectedManoeuvre(selectedManoeuvre === key ? null : key);
    setSelectedSpell(null);
    setSelectedShoveCell(null);
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

  const modalStyle = useMemo(() => {
    if (!anchorRect) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    const gap = 16;
    const pad = 12;
    let left = anchorRect.x + anchorRect.width / 2;

    if (left + 160 > window.innerWidth - pad) left = window.innerWidth - 172;
    if (left < pad + 160) left = pad + 160;

    const belowY = anchorRect.y + anchorRect.height + gap;
    const fitsBelow = belowY + 200 < window.innerHeight - pad;

    if (fitsBelow) {
      return { top: belowY, left, transform: 'translate(-50%, 0)' };
    }
    const aboveY = anchorRect.y - gap;
    return { top: aboveY, left, transform: 'translate(-50%, -100%)' };
  }, [anchorRect]);

  const canExecuteManoeuvre = selectedManoeuvre
    && (selectedManoeuvre !== 'castSpell' || selectedSpell)
    && (selectedManoeuvre !== 'shove' || selectedShoveCell);

  const selectedMan = selectedManoeuvre ? gameData.manoeuvres[selectedManoeuvre] : null;
  const customActionOpen = bottomPanel === 'custom' && !selectedItem && !selectedSpell && !selectedMan;

  const suggestionPanelConfig = useMemo(() => {
    if (isCustomAttackManoeuvre(selectedManoeuvre)) {
      return {
        title: t('combat.savedAttacksButton', 'Twoje ataki'),
        items: savedCustomAttacks || [],
        onSelect: setCustomDescription,
        onDelete: (value) => onRemoveCustomAttack?.(value),
      };
    }
    if (selectedManoeuvre === 'castSpell' && selectedSpell) {
      return {
        title: t('combat.savedSpellDescriptions', 'Twoje opisy zaklęć'),
        items: savedSpellDescriptions,
        onSelect: setCustomDescription,
        onDelete: handleDeleteSpellDescription,
      };
    }
    if (selectedItem) {
      return {
        title: t('combat.savedItemActions', 'Twoje akcje przedmiotami'),
        items: savedItemDescriptions,
        onSelect: setAiDescription,
        onDelete: handleDeleteItemDescription,
      };
    }
    if (customActionOpen) {
      return {
        title: t('combat.savedCustomActions', 'Ostatnie akcje'),
        items: savedCustomActions,
        onSelect: setAiDescription,
        onDelete: handleDeleteCustomAction,
      };
    }
    return null;
  }, [
    selectedManoeuvre,
    selectedSpell,
    selectedItem,
    customActionOpen,
    savedCustomAttacks,
    savedSpellDescriptions,
    savedItemDescriptions,
    savedCustomActions,
    onRemoveCustomAttack,
    handleDeleteSpellDescription,
    handleDeleteItemDescription,
    handleDeleteCustomAction,
    t,
  ]);

  return (
    <div
      ref={modalRef}
      className="combat-action-modal flex items-stretch gap-2"
      style={modalStyle}
    >
      <div
        className="bg-surface-container-high border border-outline-variant/25 rounded-lg shadow-2xl backdrop-blur-xl overflow-hidden max-h-[70vh] overflow-y-auto custom-scrollbar"
        style={{ width: 320 }}
      >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-outline-variant/15 sticky top-0 bg-surface-container-high z-10">
        <div className="flex items-center gap-2 min-w-0">
          {target && (
            <span className={`text-xs font-bold truncate ${
              target.type === 'enemy' ? 'text-error' : 'text-primary'
            }`}>
              {target.name}
            </span>
          )}
          {targetType === 'ground' && targetCell && (
            <span className="text-[10px] text-on-surface-variant">
              [{targetCell.x},{targetCell.y}]
            </span>
          )}
          {dist != null && (
            <span className="text-[10px] text-on-surface-variant px-1 py-px bg-surface-container rounded">
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

      {/* Ground: move here */}
      {targetType === 'ground' && targetCell && myCombatant && (
        <div className="p-2">
          <button
            onClick={handleMoveHere}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-md bg-primary/10 text-primary border border-primary/15 hover:bg-primary/20 transition-colors"
          >
            <span className="material-symbols-outlined text-base">directions_walk</span>
            {t('combat.moveHere', 'Move here')}
            <span className="ml-auto text-[10px] text-on-surface-variant font-normal">
              {(() => {
                const pos = myCombatant.position && typeof myCombatant.position === 'object'
                  ? myCombatant.position : { x: 0, y: 0 };
                return Math.max(Math.abs(pos.x - targetCell.x), Math.abs(pos.y - targetCell.y));
              })()}
            </span>
          </button>
        </div>
      )}

      {/* Manoeuvre icon grid */}
      {filteredManoeuvres.length > 0 && (
        <div className="px-2 pt-2 pb-1.5">
          <div className="grid grid-cols-5 gap-1.5">
            {filteredManoeuvres.map(([key, man]) => {
              const outOfRange = isMeleeOutOfRange(key);
              const chargeBlocked = key === 'charge' && chargeBlockReason;
              const disabled = outOfRange || !!chargeBlocked;
              const isSelected = selectedManoeuvre === key;

              const chargeHint = chargeBlocked === 'not_straight_line'
                ? t('combat.chargeNotStraight', 'Nie w linii prostej')
                : chargeBlocked === 'path_blocked'
                  ? t('combat.chargePathBlocked', 'Droga zablokowana')
                  : null;

              return (
                <Tooltip
                  key={key}
                  content={
                    <div className="max-w-[180px]">
                      <div className="font-bold text-xs">{t(`combat.manoeuvres.${key}`, man.name)}</div>
                      {outOfRange && <div className="text-amber-400 text-[10px] mt-0.5">{t('combat.outOfRangeShort', 'Poza zasięgiem')}</div>}
                      {chargeHint && <div className="text-amber-400 text-[10px] mt-0.5">{chargeHint}</div>}
                    </div>
                  }
                  placement="top"
                  variant="compact"
                  asChild
                >
                  <button
                    onClick={() => handleSelectManoeuvre(key)}
                    disabled={disabled}
                    className={`relative aspect-square flex items-center justify-center rounded-md border-2 transition-colors duration-150 ${
                      isSelected
                        ? 'bg-primary/20 border-primary/50 text-primary shadow-lg shadow-primary/10'
                        : disabled
                          ? 'bg-surface-container/20 border-outline-variant/10 text-outline-variant/40 cursor-not-allowed'
                          : 'bg-surface-container/40 border-outline-variant/15 text-on-surface-variant hover:bg-surface-container/70 hover:border-primary/30 hover:text-primary'
                    }`}
                  >
                    <span className="material-symbols-outlined text-xl">
                      {MANOEUVRE_ICONS[key] || 'help'}
                    </span>
                    {disabled && (
                      <span className="absolute -top-0.5 -right-0.5 w-3 h-3 flex items-center justify-center rounded-full bg-amber-500/90 text-white">
                        <span className="material-symbols-outlined text-[8px]">priority_high</span>
                      </span>
                    )}
                  </button>
                </Tooltip>
              );
            })}
            {/* Skip turn */}
            <Tooltip
              content={t('combat.manoeuvres.skipTurn', 'Pomiń turę')}
              placement="top"
              variant="compact"
              asChild
            >
              <button
                onClick={() => { onExecute('skipTurn', null, ''); onClose(); }}
                className="relative aspect-square flex items-center justify-center rounded-md border-2 transition-colors duration-150 bg-surface-container/40 border-outline-variant/15 text-on-surface-variant hover:bg-surface-container/70 hover:border-outline-variant/40 hover:text-on-surface"
              >
                <span className="material-symbols-outlined text-xl">hourglass_empty</span>
              </button>
            </Tooltip>
          </div>
        </div>
      )}

      {/* Extra actions: Inventory + Cast Spell + Custom (square icon row) */}
      {targetType !== 'ground' && (
        <div className="px-2 pb-1.5">
          <div className="border-t border-outline-variant/10 mb-1.5" />
          <div className="grid grid-cols-5 gap-1.5">
            {inventoryItems.length > 0 && (
              <Tooltip
                content={t('combat.inventory', 'Przedmioty')}
                variant="compact"
                placement="top"
                asChild
              >
                <button
                  onClick={() => toggleBottomPanel('inventory')}
                  className={`relative aspect-square flex items-center justify-center rounded-md border-2 transition-colors duration-150 ${
                    bottomPanel === 'inventory'
                      ? 'bg-tertiary/20 border-tertiary/50 text-tertiary shadow-lg shadow-tertiary/10'
                      : 'bg-surface-container/40 border-outline-variant/15 text-on-surface-variant hover:bg-surface-container/70 hover:border-tertiary/30 hover:text-tertiary'
                  }`}
                >
                  <span className="material-symbols-outlined text-xl">inventory_2</span>
                  <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-tertiary/90 text-white text-[8px] font-bold px-0.5">
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
                  className={`aspect-square flex items-center justify-center rounded-md border-2 transition-colors duration-150 ${
                    bottomPanel === 'spells'
                      ? 'bg-violet-500/20 border-violet-500/50 text-violet-400 shadow-lg shadow-violet-500/10'
                      : 'bg-surface-container/40 border-outline-variant/15 text-on-surface-variant hover:bg-surface-container/70 hover:border-violet-500/30 hover:text-violet-400'
                  }`}
                >
                  <span className="material-symbols-outlined text-xl">auto_awesome</span>
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
                className={`aspect-square flex items-center justify-center rounded-md border-2 transition-colors duration-150 ${
                  bottomPanel === 'custom'
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-400 shadow-lg shadow-amber-500/10'
                    : 'bg-surface-container/40 border-outline-variant/15 text-on-surface-variant hover:bg-surface-container/70 hover:border-amber-500/30 hover:text-amber-400'
                }`}
              >
                <span className="material-symbols-outlined text-xl">edit_note</span>
              </button>
            </Tooltip>
          </div>
        </div>
      )}

      {/* Spells grid panel (grid only — detail is in the unified section below) */}
      {bottomPanel === 'spells' && knownSpells.length > 0 && (
        <div className="px-2 pb-1.5 animate-fade-in">
          <div className="grid grid-cols-5 gap-1.5">
            {knownSpells.map((spell) => {
              const sc = SPELL_TREE_COLORS[spell.treeId] || DEFAULT_SPELL_COLOR;
              return (
                <Tooltip
                  key={spell.name}
                  content={
                    <div className="max-w-[180px]">
                      <div className="font-bold text-xs">{spell.name}</div>
                      <div className="text-[10px] text-on-surface-variant">{spell.manaCost}m · {spell.treeName}</div>
                      {!spell.canCast && <div className="text-amber-400 text-[10px] mt-0.5">Za mało many</div>}
                    </div>
                  }
                  variant="compact"
                  placement="top"
                  asChild
                >
                  <button
                    onClick={() => handleSelectSpell(spell.name)}
                    disabled={!spell.canCast}
                    className={`relative aspect-square flex items-center justify-center rounded-md border-2 transition-colors duration-150 ${
                      selectedSpell === spell.name
                        ? sc.selected
                        : !spell.canCast
                          ? 'bg-surface-container/20 border-outline-variant/10 text-outline-variant/40 cursor-not-allowed'
                          : sc.idle
                    }`}
                  >
                    <span className="material-symbols-outlined text-xl">{spell.icon}</span>
                  </button>
                </Tooltip>
              );
            })}
          </div>
        </div>
      )}

      {/* Inventory items grid panel (grid only — detail is in the unified section below) */}
      {bottomPanel === 'inventory' && inventoryItems.length > 0 && (
        <div className="px-2 pb-1.5 animate-fade-in">
          <div className="grid grid-cols-5 gap-1.5 max-h-32 overflow-y-auto custom-scrollbar">
            {inventoryItems.slice(0, 15).map((item) => {
              const isItemSelected = selectedItem?.id === item.id;
              return (
                <Tooltip
                  key={item.id}
                  content={
                    <div className="text-xs">
                      <div className="font-bold">{item.name}</div>
                      {item.quantity > 1 && <div className="text-on-surface-variant">x{item.quantity}</div>}
                      {item.type && <div className="text-on-surface-variant text-[10px]">{item.type}</div>}
                    </div>
                  }
                  variant="compact"
                  placement="top"
                  asChild
                >
                  <button
                    onClick={() => handleSelectItem(item)}
                    className={`relative aspect-square rounded-md border-2 overflow-hidden flex items-center justify-center transition-colors duration-150 ${
                      isItemSelected
                        ? 'bg-tertiary/15 border-tertiary/40 ring-1 ring-tertiary/30'
                        : 'bg-surface-container/30 border-outline-variant/10 hover:border-tertiary/20'
                    }`}
                  >
                    {item.imageUrl ? (
                      <img src={apiClient.resolveMediaUrl(item.imageUrl)} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <span
                        className="material-symbols-outlined text-base text-on-surface-variant/50"
                        style={{ fontVariationSettings: "'FILL' 1, 'wght' 300" }}
                      >
                        {typeIcons[item.type] || typeIcons.misc}
                      </span>
                    )}
                    {item.quantity > 1 && (
                      <span className="absolute bottom-0 right-0 text-[8px] font-bold bg-surface-container/80 text-on-surface-variant px-0.5 rounded-tl leading-tight">
                        x{item.quantity}
                      </span>
                    )}
                  </button>
                </Tooltip>
              );
            })}
          </div>
        </div>
      )}

      {/* Unified selection detail panel — always renders in the same spot */}
      {/* Manoeuvre detail */}
      {selectedManoeuvre && selectedManoeuvre !== 'castSpell' && selectedMan && (
        <div className="px-2 pb-2 space-y-1.5 animate-fade-in">
          <div className="flex items-center gap-2.5 px-2.5 py-2 bg-primary/5 border border-primary/15 rounded-md">
            <span className="material-symbols-outlined text-base text-primary">
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
          {/* Shove direction picker */}
          {selectedManoeuvre === 'shove' && target && (
            <div className="space-y-1">
              <div className="text-[10px] text-on-surface-variant font-medium px-0.5">
                {t('combat.shoveChooseDirection', 'Wybierz pole, na które popchnąć')}
              </div>
              {shoveCells.length === 0 ? (
                <div className="text-[10px] text-amber-400 px-0.5">
                  {t('combat.shoveNoValidCells', 'Brak dostępnych pól do pchnięcia')}
                </div>
              ) : (
                <ShoveCellPicker
                  target={target}
                  shoveCells={shoveCells}
                  selectedCell={selectedShoveCell}
                  onSelect={setSelectedShoveCell}
                />
              )}
            </div>
          )}
          {isCustomAttackManoeuvre(selectedManoeuvre) && (
            <div className="space-y-1">
              <label className="text-[10px] text-on-surface-variant font-medium px-0.5">
                {t('combat.customAttackLabel', 'Describe your attack')}
              </label>
              <textarea
                value={customDescription}
                onChange={(e) => setCustomDescription(e.target.value)}
                rows={2}
                placeholder={t('combat.customAttackPlaceholder', 'Describe how you strike to earn creativity bonus to the attack roll.')}
                className="w-full px-2 py-1.5 rounded-md border border-outline-variant/15 bg-surface-container/40 text-xs text-on-surface placeholder:text-outline-variant/60 focus:outline-none focus:border-primary/30 resize-none"
              />
            </div>
          )}
          {canExecuteManoeuvre && (
            <button
              onClick={handleExecute}
              className="w-full px-3 py-2 text-xs font-bold uppercase tracking-wider bg-error/15 text-error border border-error/20 rounded-md hover:bg-error/25 transition-colors"
            >
              {t('combat.execute', 'Execute')}
            </button>
          )}
        </div>
      )}
      {/* Spell detail */}
      {selectedManoeuvre === 'castSpell' && selectedSpell && (() => {
        const spellData = knownSpells.find((s) => s.name === selectedSpell);
        const sc = SPELL_TREE_COLORS[spellData?.treeId] || DEFAULT_SPELL_COLOR;
        return (
          <div className="px-2 pb-2 space-y-1.5 animate-fade-in">
            <div className={`flex items-center gap-2 px-2 py-1.5 ${sc.detail.bg} border ${sc.detail.border} rounded-md`}>
              <span className={`material-symbols-outlined text-sm ${sc.detail.text}`}>{spellData?.icon || 'auto_awesome'}</span>
              <div className="flex-1 min-w-0">
                <div className={`text-xs font-bold ${sc.detail.text}`}>{selectedSpell}</div>
                <div className="text-[10px] text-on-surface-variant leading-snug mt-0.5">
                  {spellData?.manaCost}m · {spellData?.treeName}
                </div>
              </div>
            </div>
            <textarea
              value={customDescription}
              onChange={(e) => setCustomDescription(e.target.value)}
              rows={2}
              placeholder={t('combat.spellDescriptionPlaceholder', 'Opisz jak rzucasz zaklęcie, by uzyskać bonus kreatywności...')}
              className="w-full px-2 py-1.5 rounded-md border border-outline-variant/15 bg-surface-container/40 text-xs text-on-surface placeholder:text-outline-variant/60 focus:outline-none focus:border-primary/30 resize-none"
            />
            <button
              onClick={handleExecute}
              className={`w-full px-3 py-2 text-xs font-bold uppercase tracking-wider border rounded-md transition-colors ${sc.detail.btn}`}
            >
              {t('combat.execute', 'Execute')}
            </button>
          </div>
        );
      })()}
      {/* Item detail */}
      {selectedItem && (
        <div className="px-2 pb-2 space-y-1.5 animate-fade-in">
          <div className="flex items-center gap-2 px-2 py-1.5 bg-tertiary/5 border border-tertiary/15 rounded-md">
            <span className="material-symbols-outlined text-sm text-tertiary">inventory_2</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-tertiary truncate">{selectedItem.name}</div>
              {selectedItem.type && (
                <div className="text-[10px] text-on-surface-variant leading-snug mt-0.5">{selectedItem.type}</div>
              )}
            </div>
          </div>
          <textarea
            autoFocus
            value={aiDescription}
            onChange={(e) => setAiDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.shiftKey) {
                e.preventDefault();
                handleAiSubmit();
              }
            }}
            rows={2}
            placeholder={t('combat.useItemPlaceholder', 'Opisz jak używasz tego przedmiotu w walce...')}
            className="w-full px-2 py-1.5 rounded-md border border-outline-variant/15 bg-surface-container/40 text-xs text-on-surface placeholder:text-outline-variant/60 focus:outline-none focus:border-tertiary/30 resize-none"
          />
          <span className="text-[10px] text-on-surface-variant/40">Shift+Enter — wyślij</span>
          <button
            onClick={handleAiSubmit}
            disabled={!aiDescription.trim()}
            className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition-colors ${
              aiDescription.trim()
                ? 'bg-tertiary/15 text-tertiary border border-tertiary/20 hover:bg-tertiary/25'
                : 'bg-surface-container/30 text-on-surface-variant/40 border border-outline-variant/10 cursor-not-allowed'
            }`}
          >
            <span className="material-symbols-outlined text-sm">bolt</span>
            Wykonaj
          </button>
        </div>
      )}
      {/* Custom action detail */}
      {customActionOpen && (
        <div className="px-2 pb-2 space-y-1.5 animate-fade-in">
          <div className="flex items-center gap-2 px-2 py-1.5 bg-amber-500/5 border border-amber-500/15 rounded-md">
            <span className="material-symbols-outlined text-sm text-amber-400">edit_note</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-amber-400">
                {t('combat.customAction', 'Własna akcja')}
              </div>
            </div>
          </div>
          <textarea
            autoFocus
            value={aiDescription}
            onChange={(e) => setAiDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.shiftKey) {
                e.preventDefault();
                handleAiSubmit();
              }
            }}
            rows={2}
            placeholder={t('combat.customActionPlaceholder', 'Opisz co robisz w tej turze...')}
            className="w-full px-2 py-1.5 rounded-md border border-outline-variant/15 bg-surface-container/40 text-xs text-on-surface placeholder:text-outline-variant/60 focus:outline-none focus:border-amber-500/30 resize-none"
          />
          <span className="text-[10px] text-on-surface-variant/40">Shift+Enter — wyślij</span>
          <button
            onClick={handleAiSubmit}
            disabled={!aiDescription.trim()}
            className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition-colors ${
              aiDescription.trim()
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20 hover:bg-amber-500/25'
                : 'bg-surface-container/30 text-on-surface-variant/40 border border-outline-variant/10 cursor-not-allowed'
            }`}
          >
            <span className="material-symbols-outlined text-sm">bolt</span>
            Wykonaj
          </button>
        </div>
      )}
    </div>
    {suggestionPanelConfig?.items?.length > 0 && (
      <div
        className="bg-surface-container-high border border-outline-variant/25 rounded-lg shadow-2xl backdrop-blur-xl overflow-hidden flex flex-col max-h-[70vh]"
        style={{ width: 220 }}
      >
        <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-on-surface-variant/80 border-b border-outline-variant/10">
          {suggestionPanelConfig.title}
        </div>
        <SuggestionList
          items={suggestionPanelConfig.items}
          onSelect={suggestionPanelConfig.onSelect}
          onDelete={suggestionPanelConfig.onDelete}
        />
      </div>
    )}
    </div>
  );
}
