import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { gameData } from '../../../services/gameDataService';
import { getDistance, getShoveCells, canCharge, getPushTargetCells, computeAttackPreview } from '../../../services/combatEngine';
import { isPushable } from '../../../../shared/domain/battlefieldTiles.js';
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

const ACTION_THEMES = {
  attack: {
    selected: 'bg-red-500/20 border-red-400/50 text-red-400 shadow-lg shadow-red-500/10',
    idle:     'text-red-400/60 hover:text-red-400 hover:border-red-500/30',
    detail:   'bg-red-500/8 border-red-500/20',
    text:     'text-red-400',
    btn:      'bg-red-500/15 text-red-400 border-red-500/25 hover:bg-red-500/25',
    focus:    'focus:border-red-500/40',
    glow:     '239,68,68',
  },
  rangedAttack: {
    selected: 'bg-rose-500/20 border-rose-400/50 text-rose-400 shadow-lg shadow-rose-500/10',
    idle:     'text-rose-400/60 hover:text-rose-400 hover:border-rose-500/30',
    detail:   'bg-rose-500/8 border-rose-500/20',
    text:     'text-rose-400',
    btn:      'bg-rose-500/15 text-rose-400 border-rose-500/25 hover:bg-rose-500/25',
    focus:    'focus:border-rose-500/40',
    glow:     '244,63,94',
  },
  dodge: {
    selected: 'bg-emerald-500/20 border-emerald-400/50 text-emerald-400 shadow-lg shadow-emerald-500/10',
    idle:     'text-emerald-400/60 hover:text-emerald-400 hover:border-emerald-500/30',
    detail:   'bg-emerald-500/8 border-emerald-500/20',
    text:     'text-emerald-400',
    btn:      'bg-emerald-500/15 text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/25',
    focus:    'focus:border-emerald-500/40',
    glow:     '52,211,153',
  },
  charge: {
    selected: 'bg-amber-500/20 border-amber-400/50 text-amber-400 shadow-lg shadow-amber-500/10',
    idle:     'text-amber-400/60 hover:text-amber-400 hover:border-amber-500/30',
    detail:   'bg-amber-500/8 border-amber-500/20',
    text:     'text-amber-400',
    btn:      'bg-amber-500/15 text-amber-400 border-amber-500/25 hover:bg-amber-500/25',
    focus:    'focus:border-amber-500/40',
    glow:     '245,158,11',
  },
  flee: {
    selected: 'bg-slate-400/20 border-slate-400/50 text-slate-300 shadow-lg shadow-slate-400/10',
    idle:     'text-slate-400/60 hover:text-slate-300 hover:border-slate-400/30',
    detail:   'bg-slate-500/8 border-slate-500/20',
    text:     'text-slate-300',
    btn:      'bg-slate-500/15 text-slate-300 border-slate-500/25 hover:bg-slate-500/25',
    focus:    'focus:border-slate-500/40',
    glow:     '148,163,184',
  },
  defend: {
    selected: 'bg-sky-500/20 border-sky-400/50 text-sky-400 shadow-lg shadow-sky-500/10',
    idle:     'text-sky-400/60 hover:text-sky-400 hover:border-sky-500/30',
    detail:   'bg-sky-500/8 border-sky-500/20',
    text:     'text-sky-400',
    btn:      'bg-sky-500/15 text-sky-400 border-sky-500/25 hover:bg-sky-500/25',
    focus:    'focus:border-sky-500/40',
    glow:     '56,189,248',
  },
  shove: {
    selected: 'bg-orange-500/20 border-orange-400/50 text-orange-400 shadow-lg shadow-orange-500/10',
    idle:     'text-orange-400/60 hover:text-orange-400 hover:border-orange-500/30',
    detail:   'bg-orange-500/8 border-orange-500/20',
    text:     'text-orange-400',
    btn:      'bg-orange-500/15 text-orange-400 border-orange-500/25 hover:bg-orange-500/25',
    focus:    'focus:border-orange-500/40',
    glow:     '251,146,60',
  },
  skipTurn: {
    selected: 'bg-gray-400/20 border-gray-400/50 text-gray-300 shadow-lg shadow-gray-400/10',
    idle:     'text-gray-400/60 hover:text-gray-300 hover:border-gray-400/30',
    detail:   'bg-gray-500/8 border-gray-500/20',
    text:     'text-gray-300',
    btn:      'bg-gray-500/15 text-gray-300 border-gray-500/25 hover:bg-gray-500/25',
    focus:    'focus:border-gray-500/40',
    glow:     '156,163,175',
  },
  inventory: {
    selected: 'bg-teal-500/20 border-teal-400/50 text-teal-400 shadow-lg shadow-teal-500/10',
    idle:     'text-teal-400/60 hover:text-teal-400 hover:border-teal-500/30',
    detail:   'bg-teal-500/8 border-teal-500/20',
    text:     'text-teal-400',
    btn:      'bg-teal-500/15 text-teal-400 border-teal-500/25 hover:bg-teal-500/25',
    focus:    'focus:border-teal-500/40',
    glow:     '45,212,191',
  },
  custom: {
    selected: 'bg-amber-500/20 border-amber-400/50 text-amber-400 shadow-lg shadow-amber-500/10',
    idle:     'text-amber-400/60 hover:text-amber-400 hover:border-amber-500/30',
    detail:   'bg-amber-500/8 border-amber-500/20',
    text:     'text-amber-400',
    btn:      'bg-amber-500/15 text-amber-400 border-amber-500/25 hover:bg-amber-500/25',
    focus:    'focus:border-amber-500/40',
    glow:     '245,158,11',
  },
  castSpell: {
    selected: 'bg-violet-500/20 border-violet-400/50 text-violet-400 shadow-lg shadow-violet-500/10',
    idle:     'text-violet-400/60 hover:text-violet-400 hover:border-violet-500/30',
    detail:   'bg-violet-500/8 border-violet-500/20',
    text:     'text-violet-400',
    btn:      'bg-violet-500/15 text-violet-400 border-violet-500/25 hover:bg-violet-500/25',
    focus:    'focus:border-violet-500/40',
    glow:     '167,139,250',
  },
};
const DEFAULT_ACTION_THEME = ACTION_THEMES.attack;

const ATTR_I18N = {
  sila: 'rpgAttributes.sila',
  inteligencja: 'rpgAttributes.inteligencja',
  zrecznosc: 'rpgAttributes.zrecznosc',
  wytrzymalosc: 'rpgAttributes.wytrzymalosc',
  szczescie: 'rpgAttributes.szczescie',
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

function SuggestionList({ items, onSelect, onDelete, accentRgb = '197,154,255' }) {
  if (!Array.isArray(items) || items.length === 0) return null;

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-[rgba(197,154,255,0.08)]">
      {items.map((value, i) => (
        <div key={`${i}_${value}`} className="group flex items-center gap-1 px-2.5 py-1.5">
          <button
            onClick={() => onSelect?.(value)}
            className="flex-1 min-w-0 text-left text-xs text-[rgba(220,200,255,0.8)] transition-colors truncate"
            style={{ '--accent': `rgb(${accentRgb})` }}
            onMouseEnter={(e) => { e.currentTarget.style.color = `rgb(${accentRgb})`; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = ''; }}
          >
            {value}
          </button>
          <button
            onClick={() => onDelete?.(value)}
            className="shrink-0 text-[rgba(197,154,255,0.3)] hover:text-error transition-colors opacity-0 group-hover:opacity-100"
          >
            <span className="material-symbols-outlined text-sm">delete</span>
          </button>
        </div>
      ))}
    </div>
  );
}

function PreviewValueRow({ label, value, color = 'text-on-surface/80' }) {
  const sign = value > 0 ? '+' : '';
  return (
    <div className="flex justify-between gap-3 text-xs">
      <span className="text-on-surface-variant/75 truncate">{label}</span>
      <span className={`${color} shrink-0 tabular-nums`}>{sign}{value}</span>
    </div>
  );
}

function getBonusLabel(label, t) {
  if (ATTR_I18N[label]) return t(ATTR_I18N[label]);
  return t(`combat.preRoll.mod_${label}`, label);
}

function RollPreviewBreakdown({ preview, t }) {
  if (!preview) return null;
  const { actor, threshold, bonuses, minRoll, sureHit, weaponName } = preview;
  const minRollClass = minRoll <= 10
    ? 'text-emerald-300'
    : minRoll <= 25
      ? 'text-amber-300'
      : 'text-rose-300';

  return (
    <div className="space-y-2 rounded-md border border-outline-variant/15 bg-surface-container-low/55 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/80">
          {t('combat.preRoll.testPreview', 'Test k50')}
        </div>
        {weaponName && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant/70 truncate">
            {weaponName}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="space-y-1 rounded border border-emerald-400/15 bg-emerald-500/[0.04] p-2">
          <div className="text-[10px] uppercase tracking-wider text-emerald-400/85 font-semibold">
            {t('combat.preRoll.yourBonuses', 'Twoje bonusy')}
          </div>
          {bonuses.modifiers.map((m, i) => (
            <PreviewValueRow
              key={`${m.label}_${i}`}
              label={getBonusLabel(m.label, t)}
              value={m.value}
              color={m.color || 'text-on-surface/80'}
            />
          ))}
          <div className="border-t border-outline-variant/15 pt-1 flex justify-between text-xs font-semibold">
            <span className="text-on-surface/75">{t('combat.preRoll.totalBonus', 'Razem')}</span>
            <span className="text-emerald-300 tabular-nums">+{bonuses.total}</span>
          </div>
        </div>

        <div className="space-y-1 rounded border border-rose-400/15 bg-rose-500/[0.04] p-2">
          <div className="text-[10px] uppercase tracking-wider text-rose-400/85 font-semibold">
            {t('combat.preRoll.threshold', 'Próg trudności')}
          </div>
          <PreviewValueRow
            label={t('combat.preRoll.baseThreshold', 'Bazowy')}
            value={threshold.base}
            color="text-on-surface/80"
          />
          {threshold.modifiers.map((m, i) => (
            <PreviewValueRow
              key={`${m.label}_${i}`}
              label={m.label}
              value={m.value}
              color="text-rose-300"
            />
          ))}
          <div className="border-t border-outline-variant/15 pt-1 flex justify-between text-xs font-semibold">
            <span className="text-on-surface/75">{t('combat.preRoll.finalThreshold', 'Wymagany')}</span>
            <span className="text-rose-300 tabular-nums">{threshold.final}</span>
          </div>
        </div>
      </div>

      <div className="rounded border border-outline-variant/15 bg-surface-container/35 px-3 py-2 text-center">
        {sureHit ? (
          <div className="text-sm font-bold text-amber-300">
            {t('combat.preRoll.sureHit', 'Automatyczne trafienie!')}
          </div>
        ) : (
          <>
            <div className="text-[10px] uppercase tracking-wider text-on-surface-variant/65">
              {t('combat.preRoll.minRollLabel', 'Minimalna wartość na k50')}
            </div>
            <div className={`text-3xl font-bold tabular-nums ${minRollClass}`}>
              {minRoll}
            </div>
          </>
        )}
        {actor.luckChance > 0 && (
          <div className="text-[10px] text-yellow-300/80 mt-0.5">
            {t('combat.preRoll.luckChance', 'Szczęście: {{pct}}% auto-sukces', { pct: actor.luckChance })}
          </div>
        )}
      </div>
    </div>
  );
}

function BackToActionsButton({ onClick, t, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 inline-flex items-center gap-1 rounded-sm border border-outline-variant/20 px-2 py-1 text-[10px] font-label uppercase tracking-widest text-on-surface-variant hover:border-primary/35 hover:text-primary transition-colors ${className}`}
    >
      <span className="material-symbols-outlined text-sm">arrow_back</span>
      {t('combat.backToActions', 'Wróć')}
    </button>
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
  combat,
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

  const pushableTileInfo = useMemo(() => {
    if (targetType !== 'ground' || !targetCell || !combat?.battlefield || !combat?.pushesLeft) return null;
    const tileId = combat.battlefield[targetCell.x]?.[targetCell.y];
    if (!tileId || !isPushable(tileId)) return null;
    const remaining = combat.pushesLeft[`${targetCell.x}:${targetCell.y}`];
    if (!remaining || remaining <= 0) return null;
    return { tileId, remaining };
  }, [targetType, targetCell, combat?.battlefield, combat?.pushesLeft]);

  const pushTargetCells = useMemo(() => {
    if (!pushableTileInfo || !myCombatant || !combat) return [];
    const actorPos = normalizePos(myCombatant.position);
    return getPushTargetCells(combat, actorPos, targetCell.x, targetCell.y);
  }, [pushableTileInfo, myCombatant, combat, targetCell]);

  const handlePush = useCallback((pushTo) => {
    if (!targetCell || !pushTo) return;
    onExecute('pushObstacle', null, '', { pushTarget: targetCell, pushTo });
    onClose();
  }, [targetCell, onExecute, onClose]);

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

  const handleBackToActions = () => {
    setSelectedManoeuvre(null);
    setSelectedSpell(null);
    setSelectedItem(null);
    setSelectedShoveCell(null);
    setBottomPanel(null);
  };

  const selectedMan = selectedManoeuvre ? gameData.manoeuvres[selectedManoeuvre] : null;
  const selectedPreview = useMemo(() => {
    if (!combat || !myCombatant?.id || !selectedManoeuvre) return null;
    if (selectedManoeuvre === 'castSpell' && !selectedSpell) return null;
    return computeAttackPreview(combat, myCombatant.id, selectedManoeuvre, target?.id || null, {
      customDescription,
      spellName: selectedSpell,
      pushTarget: selectedShoveCell,
    });
  }, [combat, myCombatant?.id, selectedManoeuvre, target?.id, customDescription, selectedSpell, selectedShoveCell]);

  const modalWidth = selectedPreview ? 520 : 360;

  const modalStyle = useMemo(() => {
    if (!anchorRect) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    const gap = 16;
    const pad = 12;
    const halfWidth = Math.min(modalWidth, window.innerWidth - pad * 2) / 2;
    let left = anchorRect.x + anchorRect.width / 2;

    if (left + halfWidth > window.innerWidth - pad) left = window.innerWidth - pad - halfWidth;
    if (left < pad + halfWidth) left = pad + halfWidth;

    const belowY = anchorRect.y + anchorRect.height + gap;
    const fitsBelow = belowY + 360 < window.innerHeight - pad;

    if (fitsBelow) {
      return { top: belowY, left, transform: 'translate(-50%, 0)' };
    }
    const aboveY = anchorRect.y - gap;
    return { top: aboveY, left, transform: 'translate(-50%, -100%)' };
  }, [anchorRect, modalWidth]);

  const canExecuteManoeuvre = selectedManoeuvre
    && (selectedManoeuvre !== 'castSpell' || selectedSpell)
    && (selectedManoeuvre !== 'shove' || selectedShoveCell);

  const customActionOpen = bottomPanel === 'custom' && !selectedItem && !selectedSpell && !selectedMan;
  const selectedActionOpen = Boolean(
    (selectedManoeuvre && (selectedManoeuvre !== 'castSpell' || selectedSpell))
      || selectedItem
      || customActionOpen
  );

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

  const activeTheme = useMemo(() => {
    if (selectedItem) return ACTION_THEMES.inventory;
    if (customActionOpen) return ACTION_THEMES.custom;
    if (selectedManoeuvre === 'castSpell' && selectedSpell) return ACTION_THEMES.castSpell;
    if (selectedManoeuvre) return ACTION_THEMES[selectedManoeuvre] || DEFAULT_ACTION_THEME;
    return null;
  }, [selectedManoeuvre, selectedSpell, selectedItem, customActionOpen]);

  const panelGlowStyle = useMemo(() => {
    const rgb = activeTheme?.glow || '197,154,255';
    return {
      boxShadow: `0 0 20px rgba(${rgb},0.12), 0 0 4px rgba(${rgb},0.18), 0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)`,
      borderColor: `rgba(${rgb},0.3)`,
    };
  }, [activeTheme]);

  return (
    <div
      ref={modalRef}
      className="combat-action-modal flex items-stretch gap-2"
      style={modalStyle}
    >
      <div
        className="action-holo-panel max-h-[70vh] overflow-y-auto custom-scrollbar"
        style={{ width: `min(${modalWidth}px, calc(100vw - 24px))`, ...panelGlowStyle }}
      >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[rgba(197,154,255,0.12)] sticky top-0 bg-[rgba(16,14,20,0.95)] backdrop-blur-md z-10 rounded-t-[14px]">
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

      {/* Ground: move here (+ beer duel belchtaj) */}
      {targetType === 'ground' && targetCell && myCombatant && (
        <div className="p-2 space-y-2">
          <button
            onClick={handleMoveHere}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/20 hover:bg-sky-500/20 transition-colors"
          >
            <span className="material-symbols-outlined text-base">directions_walk</span>
            {t('combat.moveHere', 'Move here')}
            <span className="ml-auto text-[10px] text-on-surface-variant font-normal">
              {(() => {
                const pos = myCombatant.position && typeof myCombatant.position === 'object'
                  ? myCombatant.position : { x: 0, y: 0 };
                return Math.abs(pos.x - targetCell.x) + Math.abs(pos.y - targetCell.y);
              })()}
            </span>
          </button>

          {/* Push pushable obstacle */}
          {pushableTileInfo && pushTargetCells.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePush(pushTargetCells[0])}
                  className="flex-1 flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/15 hover:bg-amber-500/20 transition-colors"
                >
                  <span className="material-symbols-outlined text-base">open_with</span>
                  {t('combat.pushObstacle', 'Pchnij')}
                  <span className="ml-auto text-[10px] text-on-surface-variant font-normal">
                    {t('combat.pushesRemaining', '{{count}} pchn.', { count: pushableTileInfo.remaining })}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manoeuvre icon grid */}
      {!selectedActionOpen && filteredManoeuvres.length > 0 && (
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
                    className={`relative aspect-square flex items-center justify-center rounded-md border-2 transition-all duration-150 ${
                      isSelected
                        ? (ACTION_THEMES[key]?.selected || DEFAULT_ACTION_THEME.selected)
                        : disabled
                          ? 'bg-surface-container/20 border-outline-variant/10 text-outline-variant/40 cursor-not-allowed'
                          : `bg-[rgba(16,14,20,0.45)] border-[rgba(197,154,255,0.12)] ${ACTION_THEMES[key]?.idle || DEFAULT_ACTION_THEME.idle} hover:bg-[rgba(26,18,40,0.6)]`
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
                className={`relative aspect-square flex items-center justify-center rounded-md border-2 transition-all duration-150 bg-[rgba(16,14,20,0.45)] border-[rgba(197,154,255,0.12)] ${ACTION_THEMES.skipTurn.idle} hover:bg-[rgba(26,18,40,0.6)]`}
              >
                <span className="material-symbols-outlined text-xl">hourglass_empty</span>
              </button>
            </Tooltip>
          </div>
        </div>
      )}

      {/* Extra actions: Inventory + Cast Spell + Custom (square icon row) */}
      {!selectedActionOpen && targetType !== 'ground' && (
        <div className="px-2 pb-1.5">
          <div className="border-t border-[rgba(197,154,255,0.08)] mb-1.5" />
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
                  className={`relative aspect-square flex items-center justify-center rounded-md border-2 transition-all duration-150 ${
                    bottomPanel === 'inventory'
                      ? ACTION_THEMES.inventory.selected
                      : `bg-[rgba(16,14,20,0.45)] border-[rgba(197,154,255,0.12)] ${ACTION_THEMES.inventory.idle} hover:bg-[rgba(26,18,40,0.6)]`
                  }`}
                >
                  <span className="material-symbols-outlined text-xl">inventory_2</span>
                  <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-teal-500/90 text-white text-[8px] font-bold px-0.5">
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
                  className={`aspect-square flex items-center justify-center rounded-md border-2 transition-all duration-150 ${
                    bottomPanel === 'spells'
                      ? ACTION_THEMES.castSpell.selected
                      : `bg-[rgba(16,14,20,0.45)] border-[rgba(197,154,255,0.12)] ${ACTION_THEMES.castSpell.idle} hover:bg-[rgba(26,18,40,0.6)]`
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
                className={`aspect-square flex items-center justify-center rounded-md border-2 transition-all duration-150 ${
                  bottomPanel === 'custom'
                    ? ACTION_THEMES.custom.selected
                    : `bg-[rgba(16,14,20,0.45)] border-[rgba(197,154,255,0.12)] ${ACTION_THEMES.custom.idle} hover:bg-[rgba(26,18,40,0.6)]`
                }`}
              >
                <span className="material-symbols-outlined text-xl">edit_note</span>
              </button>
            </Tooltip>
          </div>
        </div>
      )}

      {/* Spells grid panel (grid only — detail is in the unified section below) */}
      {!selectedActionOpen && bottomPanel === 'spells' && knownSpells.length > 0 && (
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
                    className={`relative aspect-square flex items-center justify-center rounded-md border-2 transition-all duration-150 ${
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
      {!selectedActionOpen && bottomPanel === 'inventory' && inventoryItems.length > 0 && (
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
                    className={`relative aspect-square rounded-md border-2 overflow-hidden flex items-center justify-center transition-all duration-150 ${
                      isItemSelected
                        ? 'bg-teal-500/15 border-teal-400/40 ring-1 ring-teal-400/30'
                        : 'bg-[rgba(16,14,20,0.45)] border-[rgba(197,154,255,0.1)] hover:border-teal-500/20'
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
      {selectedManoeuvre && selectedManoeuvre !== 'castSpell' && selectedMan && (() => {
        const th = ACTION_THEMES[selectedManoeuvre] || DEFAULT_ACTION_THEME;
        return (
        <div className="px-2 pb-2 space-y-1.5 animate-fade-in">
          <div className={`px-3 py-2.5 ${th.detail} border rounded-md`}>
            <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className={`font-headline text-xl tracking-wide leading-tight ${th.text}`}>
                {t(`combat.manoeuvres.${selectedManoeuvre}`, selectedMan.name)}
              </div>
              <div className="text-xs text-[rgba(220,200,255,0.6)] leading-snug mt-0.5">
                {selectedMan.description}
              </div>
            </div>
              <BackToActionsButton onClick={handleBackToActions} t={t} />
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
          <RollPreviewBreakdown preview={selectedPreview} t={t} />
          {isCustomAttackManoeuvre(selectedManoeuvre) && (
            <div className="space-y-1">
              <label className={`text-sm font-headline tracking-wide px-0.5 ${th.text}`}>
                {t('combat.customAttackLabel', 'Describe your attack')}
              </label>
              <textarea
                value={customDescription}
                onChange={(e) => setCustomDescription(e.target.value)}
                rows={2}
                placeholder={t('combat.customAttackPlaceholder', 'Describe how you strike to earn creativity bonus to the attack roll.')}
                className={`w-full px-2 py-1.5 rounded-md border border-[rgba(197,154,255,0.12)] bg-[rgba(16,14,20,0.5)] text-xs text-on-surface placeholder:text-[rgba(197,154,255,0.35)] focus:outline-none ${th.focus} resize-none`}
              />
            </div>
          )}
          {canExecuteManoeuvre && (
            <button
              onClick={handleExecute}
              className={`w-full px-3 py-2 text-xs font-bold uppercase tracking-wider border rounded-md transition-colors ${th.btn}`}
            >
              {selectedPreview
                ? t('combat.preRoll.rollButton', 'Rzuć kośćmi!')
                : t('combat.execute', 'Execute')}
            </button>
          )}
        </div>
        );
      })()}
      {/* Spell detail */}
      {selectedManoeuvre === 'castSpell' && selectedSpell && (() => {
        const spellData = knownSpells.find((s) => s.name === selectedSpell);
        const sc = SPELL_TREE_COLORS[spellData?.treeId] || DEFAULT_SPELL_COLOR;
        return (
          <div className="px-2 pb-2 space-y-1.5 animate-fade-in">
            <div className={`px-3 py-2.5 ${sc.detail.bg} border ${sc.detail.border} rounded-md`}>
              <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className={`font-headline text-xl tracking-wide leading-tight ${sc.detail.text}`}>{selectedSpell}</div>
                <div className="text-[10px] text-[rgba(220,200,255,0.6)] leading-snug mt-0.5">
                  {spellData?.manaCost}m · {spellData?.treeName}
                </div>
              </div>
                <BackToActionsButton onClick={handleBackToActions} t={t} />
              </div>
            </div>
            <RollPreviewBreakdown preview={selectedPreview} t={t} />
            <textarea
              value={customDescription}
              onChange={(e) => setCustomDescription(e.target.value)}
              rows={2}
              placeholder={t('combat.spellDescriptionPlaceholder', 'Opisz jak rzucasz zaklęcie, by uzyskać bonus kreatywności...')}
              className="w-full px-2 py-1.5 rounded-md border border-[rgba(197,154,255,0.12)] bg-[rgba(16,14,20,0.5)] text-xs text-on-surface placeholder:text-[rgba(197,154,255,0.35)] focus:outline-none focus:border-violet-500/40 resize-none"
            />
            <button
              onClick={handleExecute}
              className={`w-full px-3 py-2 text-xs font-bold uppercase tracking-wider border rounded-md transition-colors ${sc.detail.btn}`}
            >
              {selectedPreview
                ? t('combat.preRoll.rollButton', 'Rzuć kośćmi!')
                : t('combat.execute', 'Execute')}
            </button>
          </div>
        );
      })()}
      {/* Item detail */}
      {selectedItem && (() => {
        const ith = ACTION_THEMES.inventory;
        return (
        <div className="px-2 pb-2 space-y-1.5 animate-fade-in">
          <div className={`px-3 py-2.5 ${ith.detail} border rounded-md`}>
            <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className={`font-headline text-xl tracking-wide leading-tight truncate ${ith.text}`}>{selectedItem.name}</div>
              {selectedItem.type && (
                <div className="text-[10px] text-[rgba(220,200,255,0.6)] leading-snug mt-0.5">{selectedItem.type}</div>
              )}
            </div>
              <BackToActionsButton onClick={handleBackToActions} t={t} />
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
            className={`w-full px-2 py-1.5 rounded-md border border-[rgba(197,154,255,0.12)] bg-[rgba(16,14,20,0.5)] text-xs text-on-surface placeholder:text-[rgba(197,154,255,0.35)] focus:outline-none ${ith.focus} resize-none`}
          />
          <button
            onClick={handleAiSubmit}
            disabled={!aiDescription.trim()}
            className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wider border rounded-md transition-colors ${
              aiDescription.trim()
                ? ith.btn
                : 'bg-surface-container/30 text-on-surface-variant/40 border-outline-variant/10 cursor-not-allowed'
            }`}
          >
            <span className="material-symbols-outlined text-sm">bolt</span>
            Wykonaj
          </button>
          <span className="text-[10px] text-[rgba(197,154,255,0.3)]">Shift+Enter — wyślij</span>
        </div>
        );
      })()}
      {/* Custom action detail */}
      {customActionOpen && (() => {
        const cth = ACTION_THEMES.custom;
        return (
        <div className="px-2 pb-2 space-y-1.5 animate-fade-in">
          <div className={`px-3 py-2.5 ${cth.detail} border rounded-md`}>
            <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className={`font-headline text-xl tracking-wide leading-tight ${cth.text}`}>
                {t('combat.customAction', 'Własna akcja')}
              </div>
            </div>
              <BackToActionsButton onClick={handleBackToActions} t={t} />
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
            className={`w-full px-2 py-1.5 rounded-md border border-[rgba(197,154,255,0.12)] bg-[rgba(16,14,20,0.5)] text-xs text-on-surface placeholder:text-[rgba(197,154,255,0.35)] focus:outline-none ${cth.focus} resize-none`}
          />
          <button
            onClick={handleAiSubmit}
            disabled={!aiDescription.trim()}
            className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wider border rounded-md transition-colors ${
              aiDescription.trim()
                ? cth.btn
                : 'bg-surface-container/30 text-on-surface-variant/40 border-outline-variant/10 cursor-not-allowed'
            }`}
          >
            <span className="material-symbols-outlined text-sm">bolt</span>
            Wykonaj
          </button>
          <span className="text-[10px] text-[rgba(197,154,255,0.3)]">Shift+Enter — wyślij</span>
        </div>
        );
      })()}
    </div>
    {suggestionPanelConfig?.items?.length > 0 && (() => {
      const suggestRgb = activeTheme?.glow || '197,154,255';
      return (
      <div
        className="action-holo-panel overflow-hidden flex flex-col max-h-[70vh]"
        style={{
          width: 220,
          boxShadow: `0 0 16px rgba(${suggestRgb},0.10), 0 0 3px rgba(${suggestRgb},0.14), 0 6px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.03)`,
          borderColor: `rgba(${suggestRgb},0.25)`,
        }}
      >
        <div
          className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest border-b border-[rgba(197,154,255,0.1)]"
          style={{ color: `rgba(${suggestRgb},0.7)` }}
        >
          {suggestionPanelConfig.title}
        </div>
        <SuggestionList
          items={suggestionPanelConfig.items}
          onSelect={suggestionPanelConfig.onSelect}
          onDelete={suggestionPanelConfig.onDelete}
          accentRgb={suggestRgb}
        />
      </div>
      );
    })()}
    </div>
  );
}
