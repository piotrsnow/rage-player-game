import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '../../services/apiClient';
import { useAI } from '../../hooks/useAI';
import StatsGrid from './StatsGrid';
import Inventory from './Inventory';
import ItemDetailBox from './inventory/ItemDetailBox';
import CrystalUseModal from './inventory/CrystalUseModal';
import UseItemModal from './inventory/UseItemModal';
import { getEquippableSlots, getEquippedSlot } from './inventory/constants';
import StatusBar from '../ui/StatusBar';
import ActiveEffectsRow from '../ui/ActiveEffectsRow';
import PortraitGenerator from './PortraitGenerator';
import CharacterHistoryPanel from './CharacterHistoryPanel';
import CustomSelect from '../ui/CustomSelect';
import { translateSkill, translateAttribute } from '../../utils/rpgTranslate';
import { SKILLS, DIFFICULTY_THRESHOLDS, SKILL_CAPS, xpForSkillLevel } from '../../data/rpgSystem';
import { SPELL_TREES } from '../../data/rpgMagic';
import { resolveKnownSpellDisplay } from '../../services/magicEngine';
import { gameData } from '../../services/gameDataService';
import SkillGainHistory from './SkillGainHistory';
import FavoriteScenesList from './FavoriteScenesList';
import BadgesSection from './BadgesSection';

const SKILL_ICONS = {
  'Walka wrecz': 'sports_martial_arts',
  'Walka bronia jednoręczna': 'sword_rose',
  'Walka bronia dwureczna': 'swords',
  'Strzelectwo': 'gps_fixed',
  'Uniki': 'swipe',
  'Walka dwiema brońmi': 'swords',
  'Zastraszanie': 'mood_bad',
  'Taktyka': 'strategy',
  'Atletyka': 'exercise',
  'Akrobatyka': 'sports_gymnastics',
  'Jezdziectwo': 'cavalier',
  'Prezenie sie': 'accessibility_new',
  'Wywazanie drzwi': 'door_front',
  'Perswazja': 'record_voice_over',
  'Blef': 'theater_comedy',
  'Handel': 'storefront',
  'Przywodztwo': 'military_tech',
  'Wystepy': 'mic',
  'Flirt': 'favorite',
  'Wiedza ogolna': 'menu_book',
  'Wiedza o potworach': 'pest_control',
  'Wiedza o naturze': 'forest',
  'Medycyna': 'healing',
  'Alchemia': 'science',
  'Rzemioslo': 'construction',
  'Nawigacja': 'explore_nearby',
  'Skradanie': 'visibility_off',
  'Otwieranie zamkow': 'lock_open',
  'Kradziez kieszonkowa': 'back_hand',
  'Pulapki i mechanizmy': 'engineering',
  'Spostrzegawczosc': 'visibility',
  'Przetrwanie': 'local_fire_department',
  'Tropienie': 'explore',
  'Odpornosc': 'health_and_safety',
  'Picie alkoholu': 'local_bar',
  'Upartosc': 'psychology_alt',
  'Plywanie': 'pool',
  'Fart': 'stars',
  'Hazard': 'casino',
  'Przeczucie': 'psychology',
  'Modlitwa': 'church',
};

const DIFFICULTY_LABELS = {
  easy: 'Łatwy',
  medium: 'Średni',
  hard: 'Trudny',
  veryHard: 'B. trudny',
  extreme: 'Ekstremalny',
};

const EXTRA_SPELL_SCHOOLS = {
  magia_zakazana: {
    id: 'magia_zakazana',
    name: 'Magia zakazana',
    icon: 'dangerous',
    description: 'Wymyślone zaklęcia, których nie da się sensownie przypisać do standardowych szkół magii.',
    spells: [],
  },
};

const SPELL_TREE_THEMES = {
  ogien: {
    panel: 'bg-red-500/5 border-red-400/25',
    text: 'text-red-300',
    badge: 'text-red-300',
    known: 'bg-red-500/10 border-red-400/30',
    icon: 'text-red-300',
  },
  blyskawice: {
    panel: 'bg-yellow-400/5 border-yellow-300/25',
    text: 'text-yellow-200',
    badge: 'text-yellow-200',
    known: 'bg-yellow-400/10 border-yellow-300/30',
    icon: 'text-yellow-200',
  },
  ochrona: {
    panel: 'bg-blue-500/5 border-blue-300/25',
    text: 'text-blue-200',
    badge: 'text-blue-200',
    known: 'bg-blue-500/10 border-blue-300/30',
    icon: 'text-blue-200',
  },
  niewidzialnosc: {
    panel: 'bg-violet-500/5 border-violet-300/25',
    text: 'text-violet-200',
    badge: 'text-violet-200',
    known: 'bg-violet-500/10 border-violet-300/30',
    icon: 'text-violet-200',
  },
  lod: {
    panel: 'bg-cyan-400/5 border-cyan-200/25',
    text: 'text-cyan-200',
    badge: 'text-cyan-200',
    known: 'bg-cyan-400/10 border-cyan-200/30',
    icon: 'text-cyan-200',
  },
  leczenie: {
    panel: 'bg-emerald-500/5 border-emerald-300/25',
    text: 'text-emerald-200',
    badge: 'text-emerald-200',
    known: 'bg-emerald-500/10 border-emerald-300/30',
    icon: 'text-emerald-200',
  },
  przestrzen: {
    panel: 'bg-fuchsia-500/5 border-fuchsia-300/25',
    text: 'text-fuchsia-200',
    badge: 'text-fuchsia-200',
    known: 'bg-fuchsia-500/10 border-fuchsia-300/30',
    icon: 'text-fuchsia-200',
  },
  umysl: {
    panel: 'bg-pink-500/5 border-pink-300/25',
    text: 'text-pink-200',
    badge: 'text-pink-200',
    known: 'bg-pink-500/10 border-pink-300/30',
    icon: 'text-pink-200',
  },
  wiatr_percepcja: {
    panel: 'bg-teal-500/5 border-teal-300/25',
    text: 'text-teal-200',
    badge: 'text-teal-200',
    known: 'bg-teal-500/10 border-teal-300/30',
    icon: 'text-teal-200',
  },
  magia_zakazana: {
    panel: 'bg-rose-950/30 border-rose-400/30',
    text: 'text-rose-200',
    badge: 'text-rose-200',
    known: 'bg-rose-950/40 border-rose-400/35',
    icon: 'text-rose-200',
  },
};

const DEFAULT_SPELL_TREE_THEME = {
  panel: 'bg-tertiary/5 border-tertiary/20',
  text: 'text-tertiary',
  badge: 'text-green-400',
  known: 'bg-primary/10 border-primary/25',
  icon: 'text-tertiary',
};

function normalizeCustomSpellSchool(school) {
  if (!school || school === 'ogolna') return 'magia_zakazana';
  return SPELL_TREES[school] ? school : 'magia_zakazana';
}

function getSkillAttribute(skillName) {
  const entry = SKILLS.find((s) => s.name === skillName);
  return entry?.attribute || null;
}

/** XP bar + labels for next skill level (matches AdvancementPanel math). */
function getSkillXpProgress(skillName, skillsMap) {
  const raw = skillsMap?.[skillName];
  const obj = typeof raw === 'object'
    ? raw
    : { level: typeof raw === 'number' ? raw : 0, xp: 0, cap: SKILL_CAPS.basic };
  const level = obj.level ?? 0;
  const xp = obj.xp ?? obj.progress ?? 0;
  const cap = Math.max(obj.cap ?? SKILL_CAPS.basic, SKILL_CAPS.basic);
  const atCap = level >= cap;
  const needed = atCap ? 0 : xpForSkillLevel(level + 1);
  const xpPct = needed > 0 ? Math.min(100, (xp / needed) * 100) : atCap ? 100 : 0;
  const remaining = needed > 0 ? Math.max(0, needed - xp) : 0;
  return { xp, needed, atCap, xpPct, remaining, cap };
}

function SkillDetailPanel({ skillName, level, character, t }) {
  const attrKey = getSkillAttribute(skillName);
  const attrValue = attrKey ? (character.attributes?.[attrKey] || 0) : 0;
  const attrLabel = attrKey ? translateAttribute(attrKey, t) : '—';
  const luck = character.attributes?.szczescie || 0;
  const translatedName = translateSkill(skillName, t);
  const prog = getSkillXpProgress(skillName, character.skills);

  return (
    <div className="bg-surface-container-low p-6 border border-outline-variant/10 rounded-sm animate-fade-in">
      <div className="flex items-start gap-4">
        <span className="material-symbols-outlined text-skill-rose text-3xl mt-0.5">
          {SKILL_ICONS[skillName] || 'star'}
        </span>
        <div className="flex-1 min-w-0">
          <h4 className="text-skill-rose font-headline text-xl leading-tight">{translatedName}</h4>
          {attrKey && (
            <p className="text-on-surface-variant/70 text-sm mt-1">
              Powiązana cecha: <span className="text-primary font-semibold">{attrLabel}</span>
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 p-4 bg-surface-container-high/60 rounded-sm border border-outline-variant/10">
        <p className="text-on-surface text-xs font-label uppercase tracking-wider mb-2.5">Rzut umiejętności</p>
        <p className="text-on-surface-variant text-base">
          <span className="text-tertiary font-headline text-lg">d50</span>
          {' + '}
          <span className="text-primary font-headline text-lg">{attrValue}</span>
          <span className="text-on-surface-variant/60 text-sm"> ({attrLabel})</span>
          {' + '}
          <span className="text-skill-rose font-headline text-lg">{level}</span>
          <span className="text-on-surface-variant/60 text-sm"> (umiejętność)</span>
          {' vs próg trudności'}
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          {Object.entries(DIFFICULTY_THRESHOLDS).map(([key, val]) => (
            <span key={key} className="text-xs px-2.5 py-1 rounded-sm bg-surface-container-highest/80 text-on-surface-variant border border-outline-variant/10">
              {DIFFICULTY_LABELS[key] || key}: <span className="text-tertiary font-headline">{val}</span>
            </span>
          ))}
        </div>
        {luck > 0 && (
          <p className="text-sm text-on-surface-variant/70 mt-3 italic">
            Fart: {luck}% szans na automatyczny sukces.
          </p>
        )}
      </div>

      {(prog.atCap || prog.needed > 0) && (
        <div className="mt-4 p-4 bg-surface-container-high/40 rounded-sm border border-outline-variant/10">
          <p className="text-on-surface text-xs font-label uppercase tracking-wider mb-2">
            {t('character.skillNextLevelProgress')}
          </p>
          {prog.atCap ? (
            <p className="text-sm text-tertiary font-headline">{t('advancement.maxed')}</p>
          ) : (
            <>
              <div className="w-full h-2 bg-surface-container-high/60 rounded-full overflow-hidden mb-2">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${prog.xpPct}%` }}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-on-surface-variant">
                <span className="tabular-nums">
                  {t('character.skillXpFraction', { xp: prog.xp, needed: prog.needed })}
                </span>
                <span className="tabular-nums text-outline">
                  {t('character.skillXpRemaining', { count: prog.remaining })}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SkillGainHistoryBox({ characterId, skillName, t }) {
  return (
    <div className="bg-surface-container-low p-6 border border-outline-variant/10 rounded-sm animate-fade-in">
      <h3 className="text-tertiary font-headline flex items-center gap-2 mb-4">
        <span className="material-symbols-outlined text-base">timeline</span>
        {t('advancement.skillHistory', 'Historia rozwoju')}
      </h3>
      <SkillGainHistory characterId={characterId} skillName={skillName} />
    </div>
  );
}

function SkillsGrid({ character, t }) {
  const [expanded, setExpanded] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState(null);
  const characterId = character.backendId || character.id;

  const learned = Object.entries(character.skills || {})
    .filter(([, v]) => {
      const level = typeof v === 'object' ? v.level : (v || 0);
      return level > 0;
    })
    .map(([name, v]) => ({
      name,
      level: typeof v === 'object' ? v.level : (v || 0),
    }))
    .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));

  if (learned.length === 0) return null;

  const handleSkillClick = (e, name) => {
    e.stopPropagation();
    setSelectedSkill((prev) => (prev === name ? null : name));
  };

  const selectedLevel = selectedSkill
    ? (learned.find((s) => s.name === selectedSkill) || {}).level || 0
    : 0;

  return (
    <>
      <div className="w-full text-left bg-surface-container-low border border-outline-variant/10 rounded-sm transition-all hover:border-primary/20">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-between px-5 pt-5 pb-3 cursor-pointer"
        >
          <h3 className="text-tertiary font-headline flex items-center gap-2">
            <span className="material-symbols-outlined text-base">school</span>
            {t('character.skills')}
          </h3>
          <span className={`material-symbols-outlined text-base text-on-surface-variant transition-transform ${expanded ? 'rotate-180' : ''}`}>
            expand_more
          </span>
        </button>
        <div className={`px-5 pb-5 grid gap-2.5 ${expanded ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-4 sm:grid-cols-6'}`}>
          {learned.map(({ name, level }) => {
            const icon = SKILL_ICONS[name] || 'star';
            const isSelected = selectedSkill === name;
            const prog = getSkillXpProgress(name, character.skills);
            return (
              <button
                key={name}
                type="button"
                onClick={(e) => handleSkillClick(e, name)}
                className={`bg-surface-container-high/60 backdrop-blur-md p-3 border-b-2 flex flex-col items-center text-center transition-all cursor-pointer hover:bg-surface-container-highest/80 ${
                  isSelected ? 'border-skill-rose bg-surface-container-highest/80' : 'border-primary/20'
                }`}
              >
                <span className="material-symbols-outlined text-skill-rose mb-1 text-3xl">{icon}</span>
                {expanded && (
                  <span className="text-on-surface-variant font-label text-[9px] uppercase tracking-[0.1em] mb-0.5 leading-tight">
                    {translateSkill(name, t)}
                  </span>
                )}
                <span className="text-tertiary font-headline text-2xl">{level}</span>
                <div className="w-full mt-1.5 space-y-0.5">
                  <div className="w-full h-1.5 bg-surface-container-high/60 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-[width] ${prog.atCap ? 'bg-tertiary' : 'bg-primary'}`}
                      style={{ width: `${prog.atCap ? 100 : prog.xpPct}%` }}
                    />
                  </div>
                  <span className="block text-[8px] text-outline tabular-nums leading-tight min-h-[1rem]">
                    {prog.atCap
                      ? t('advancement.maxed')
                      : prog.needed > 0
                        ? t('character.skillXpFractionShort', { xp: prog.xp, needed: prog.needed })
                        : '\u00a0'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selectedSkill && (
        <SkillDetailPanel
          skillName={selectedSkill}
          level={selectedLevel}
          character={character}
          t={t}
        />
      )}

      {selectedSkill && characterId && (
        <SkillGainHistoryBox
          characterId={characterId}
          skillName={selectedSkill}
          t={t}
        />
      )}
    </>
  );
}

const NEEDS_META = [
  { key: 'hunger', icon: 'restaurant' },
  { key: 'thirst', icon: 'water_drop' },
  { key: 'bladder', icon: 'wc' },
  { key: 'hygiene', icon: 'shower' },
  { key: 'rest', icon: 'bedtime' },
];

function SpellsGrid({
  spells,
  selectedSpellName,
  onSelectSpell,
  spellImages,
  currentMana,
  onRegenerateImage,
  regeneratingSpellName,
  viewMode,
  onViewModeChange,
  t,
}) {
  const [collapsedTrees, setCollapsedTrees] = useState({});
  const knownSpellByName = useMemo(
    () => new Map(spells.map((spell) => [spell.name, spell])),
    [spells],
  );
  const customSpellsBySchool = useMemo(() => {
    const groups = {};
    for (const spell of spells) {
      if (!spell.isCustom) continue;
      const schoolId = normalizeCustomSpellSchool(spell.school);
      if (!groups[schoolId]) groups[schoolId] = [];
      groups[schoolId].push(spell);
    }
    return groups;
  }, [spells]);
  const treeEntries = useMemo(() => {
    const entries = Object.entries(SPELL_TREES);
    for (const schoolId of Object.keys(customSpellsBySchool)) {
      if (!SPELL_TREES[schoolId]) entries.push([schoolId, EXTRA_SPELL_SCHOOLS[schoolId] || EXTRA_SPELL_SCHOOLS.magia_zakazana]);
    }
    return entries;
  }, [customSpellsBySchool]);
  const selectedSpell = selectedSpellName ? knownSpellByName.get(selectedSpellName) : null;
  const selectedSpellImageUrl = selectedSpell && spellImages?.[selectedSpell.name]
    ? apiClient.resolveMediaUrl(spellImages[selectedSpell.name])
    : null;
  const selectedSpellHasEnoughMana = selectedSpell ? currentMana >= selectedSpell.manaCost : false;
  const toggleTreeCollapsed = (treeId) => {
    setCollapsedTrees((prev) => ({ ...prev, [treeId]: !prev[treeId] }));
  };

  if (spells.length === 0) return null;

  return (
    <div className="bg-surface-container-low p-6 border border-tertiary/15 rounded-sm">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-tertiary font-headline flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">auto_awesome</span>
          {t('magic.spells', 'Zaklecia')}
        </h3>
        {viewMode === 'trees' ? (
          <button
            type="button"
            onClick={() => onViewModeChange('list')}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm border border-outline-variant/20 bg-surface-container-high/50 text-on-surface-variant hover:text-tertiary hover:border-tertiary/30 transition-colors"
            title={t('magic.listView', { defaultValue: 'Lista' })}
            aria-label={t('magic.listView', { defaultValue: 'Lista' })}
          >
            <span className="material-symbols-outlined text-sm">keyboard_double_arrow_right</span>
            <span className="text-[10px] font-label uppercase tracking-wider">
              {t('common.collapse', { defaultValue: 'Zwiń' })}
            </span>
          </button>
        ) : (
            <button
              type="button"
              onClick={() => onViewModeChange('trees')}
              className="inline-flex items-center justify-center w-8 h-8 rounded-sm border border-tertiary/20 bg-tertiary/10 text-tertiary hover:bg-tertiary/15 hover:border-tertiary/40 transition-colors"
              title={t('magic.treeView', { defaultValue: 'Drzewka' })}
              aria-label={t('magic.treeView', { defaultValue: 'Drzewka' })}
            >
              <span className="material-symbols-outlined text-lg">account_tree</span>
            </button>
        )}
      </div>

      {viewMode === 'list' ? (
        selectedSpell ? (
          <div
            className="relative min-h-[22rem] overflow-hidden rounded-sm border border-tertiary/20 bg-surface-container-high animate-slide-in-right cursor-pointer"
            style={selectedSpellImageUrl ? { backgroundImage: `url(${selectedSpellImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
            onClick={() => onSelectSpell(null)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectSpell(null); }}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-surface-dim via-surface-dim/85 to-surface-dim/35" />
            <div className="absolute inset-0 backdrop-blur-[1px]" />
            <div className="relative p-4 sm:p-5 min-h-[22rem] flex flex-col justify-between">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-label uppercase tracking-[0.18em] text-tertiary/80 mb-1">
                    {selectedSpell.isCustom
                      ? selectedSpell.treeName
                      : `${selectedSpell.treeName} · ${t('magic.level', { level: selectedSpell.level, defaultValue: `Poziom ${selectedSpell.level}` })}`}
                  </p>
                  <h4 className="font-headline text-2xl text-tertiary leading-tight drop-shadow">
                    {selectedSpell.name}
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectSpell(null)}
                  aria-label={t('common.back', { defaultValue: 'Wróć' })}
                  className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-sm bg-black/55 text-on-surface-variant hover:text-tertiary border border-outline-variant/25 transition-colors backdrop-blur-sm"
                >
                  <span className="material-symbols-outlined text-sm">arrow_back</span>
                  <span className="text-[10px] font-label uppercase tracking-wider">
                    {t('common.back', { defaultValue: 'Wróć' })}
                  </span>
                </button>
              </div>

              {!selectedSpellImageUrl && (
                <div className="flex-1 flex items-center justify-center py-8">
                  <span className="material-symbols-outlined text-7xl text-tertiary/35">{selectedSpell.icon}</span>
                </div>
              )}

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-sm bg-black/55 border border-outline-variant/20 px-3 py-2 backdrop-blur-sm">
                    <div className="text-[9px] font-label uppercase tracking-widest text-on-surface-variant/70">
                      {t('magic.manaCost', 'Koszt many')}
                    </div>
                    <div className={`font-headline text-lg ${selectedSpellHasEnoughMana ? 'text-tertiary' : 'text-error-light'}`}>
                      {selectedSpell.manaCost}
                    </div>
                  </div>
                  <div className="rounded-sm bg-black/55 border border-outline-variant/20 px-3 py-2 backdrop-blur-sm">
                    <div className="text-[9px] font-label uppercase tracking-widest text-on-surface-variant/70">
                      {t('magic.usesLabel', 'Uzycia')}
                    </div>
                    <div className="font-headline text-lg text-primary">{selectedSpell.uses}</div>
                  </div>
                </div>

                <div className="rounded-sm bg-black/60 border border-outline-variant/20 p-3 backdrop-blur-sm">
                  <p className="text-on-surface-variant text-sm leading-relaxed">
                    {selectedSpell.description || t('magic.customSpellDescription', { defaultValue: 'Zaklęcie z fabuły lub wymyślone — nie należy do standardowego drzewka w grze.' })}
                  </p>
                  {!selectedSpellHasEnoughMana && (
                    <p className="text-error-light/80 text-xs mt-3">
                      {t('magic.notEnoughMana', { defaultValue: 'Za malo many na rzucenie tego zaklecia.' })}
                    </p>
                  )}
                </div>

                {onRegenerateImage && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onRegenerateImage(selectedSpell.name); }}
                    disabled={regeneratingSpellName === selectedSpell.name}
                    className="flex items-center gap-1.5 text-xs font-label text-on-surface-variant/80 hover:text-tertiary transition-colors disabled:opacity-50"
                  >
                    <span className={`material-symbols-outlined text-sm ${regeneratingSpellName === selectedSpell.name ? 'animate-spin' : ''}`}>
                      {regeneratingSpellName === selectedSpell.name ? 'progress_activity' : 'refresh'}
                    </span>
                    {regeneratingSpellName === selectedSpell.name
                      ? t('magic.regeneratingImage', { defaultValue: 'Generowanie...' })
                      : t('magic.regenerateImage', { defaultValue: 'Regeneruj obraz' })}
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 animate-fade-in">
            {spells.map((spell) => {
              const imageUrl = spellImages?.[spell.name];
              return (
                <button
                  key={spell.name}
                  type="button"
                  onClick={() => onSelectSpell(spell.name)}
                  className="group bg-surface-container-high/60 backdrop-blur-md border-b-2 border-tertiary/20 flex flex-col items-center text-center transition-all hover:bg-surface-container-highest/80 hover:border-tertiary/50 overflow-hidden"
                >
                  {imageUrl ? (
                    <div className="w-full aspect-square relative">
                      <img
                        src={apiClient.resolveMediaUrl(imageUrl)}
                        alt={spell.name}
                        className="w-full h-full object-cover"
                        onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                      />
                      <div className="absolute inset-0 items-center justify-center hidden">
                        <span className="material-symbols-outlined text-tertiary text-3xl">{spell.icon}</span>
                      </div>
                      {spell.uses > 0 && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className="text-4xl font-black text-white/[0.12] group-hover:text-white/[0.28] transition-colors duration-200 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                            ×{spell.uses}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="w-full aspect-square flex items-center justify-center relative">
                      <span className="material-symbols-outlined text-tertiary text-3xl">{spell.icon}</span>
                      {spell.uses > 0 && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className="text-4xl font-black text-white/[0.12] group-hover:text-white/[0.28] transition-colors duration-200 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                            ×{spell.uses}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="p-2 w-full">
                    <span className="text-on-surface-variant font-label text-[11px] uppercase tracking-[0.1em] leading-tight block">
                      {spell.name}
                    </span>
                    <div className="flex items-center justify-center gap-2 mt-0.5">
                      <span className="text-xs text-outline font-bold">
                        {spell.manaCost} {t('magic.manaShort', 'many')}
                      </span>
<<<<<<< Updated upstream
=======
                      {spell.uses > 0 && (
                        <span className="text-xs text-primary/80 font-bold">
                          ×{spell.uses}
                        </span>
                      )}
>>>>>>> Stashed changes
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )
      ) : (
        <div className="space-y-3">
          {treeEntries.map(([treeId, tree]) => {
            const customTreeSpells = customSpellsBySchool[treeId] || [];
            const treeSpells = [
              ...tree.spells.map((spell) => ({ ...spell, treeName: tree.name, isCustom: false })),
              ...customTreeSpells,
            ];
            const knownCount = treeSpells.filter((spell) => knownSpellByName.has(spell.name)).length;
            const theme = SPELL_TREE_THEMES[treeId] || DEFAULT_SPELL_TREE_THEME;
            const isCollapsed = collapsedTrees[treeId] ?? knownCount === 0;

            return (
              <div
                key={treeId}
                className={`rounded-sm border p-3 ${theme.panel}`}
              >
                <button
                  type="button"
                  onClick={() => toggleTreeCollapsed(treeId)}
                  className={`w-full flex items-start justify-between gap-3 text-left ${isCollapsed ? '' : 'mb-2'}`}
                >
                  <div className="min-w-0">
                    <h4 className={`font-headline text-lg flex items-center gap-2.5 ${theme.text}`}>
                      <span className="material-symbols-outlined text-xl">{tree.icon}</span>
                      {tree.name}
                    </h4>
                    <p className="text-sm text-on-surface-variant/70 leading-snug mt-1.5">{tree.description}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-sm font-label uppercase tracking-wider ${theme.badge}`}>
                      {knownCount}/{treeSpells.length}
                    </span>
                    <span className={`material-symbols-outlined text-base text-on-surface-variant transition-transform ${isCollapsed ? '' : 'rotate-180'}`}>
                      expand_more
                    </span>
                  </div>
                </button>

                <div className={`grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out ${
                  isCollapsed ? 'grid-rows-[0fr] opacity-0 mt-0' : 'grid-rows-[1fr] opacity-100 mt-2'
                }`}>
                  <div className="overflow-hidden">
                    <div className="grid grid-cols-1 gap-1.5">
                      {treeSpells.map((treeSpell) => {
                        const knownSpell = knownSpellByName.get(treeSpell.name);
                        const isKnown = !!knownSpell;
                        const spell = knownSpell || { ...treeSpell, treeName: tree.name, uses: 0 };
                        const imageUrl = spellImages?.[spell.name];

                        return (
                          <div
                            key={spell.name}
                            className={`grid grid-cols-[4.5rem_1fr] gap-3 rounded-sm border p-2 transition-colors ${
                              isKnown
                                ? theme.known
                                : 'bg-surface-container-high/25 border-outline-variant/10 opacity-65'
                            }`}
                          >
                            {imageUrl ? (
                              <div className="aspect-square rounded-sm overflow-hidden bg-surface-container-high self-stretch">
                                <img
                                  src={apiClient.resolveMediaUrl(imageUrl)}
                                  alt={spell.name}
                                  className="w-full h-full object-cover"
                                  onError={(e) => { e.target.style.display = 'none'; }}
                                />
                              </div>
                            ) : (
                              <div className="aspect-square rounded-sm bg-surface-container-high flex items-center justify-center self-stretch">
                                <span className={`material-symbols-outlined text-3xl ${isKnown ? theme.icon : 'text-outline/60'}`}>
                                  {spell.icon || tree.icon}
                                </span>
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <span className={`font-label text-base uppercase tracking-wide leading-tight ${isKnown ? theme.text : 'text-on-surface-variant'}`}>
                                  {spell.name}
                                </span>
                                <span className={`material-symbols-outlined text-lg shrink-0 ${isKnown ? theme.badge : 'text-outline/50'}`}>
                                  {isKnown ? 'check_circle' : 'radio_button_unchecked'}
                                </span>
                              </div>
                              <div className="text-sm text-outline mt-1">
                                {spell.manaCost} {t('magic.manaShort', 'many')} · {t('magic.level', { level: spell.level, defaultValue: `Poziom ${spell.level}` })}
                                {isKnown && (
                                  <span className={`${theme.badge} ml-1`}>
                                    · {t('magic.uses', { count: spell.uses, defaultValue: `${spell.uses} uzyc` })}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-on-surface-variant/75 leading-snug mt-1.5">
                                {spell.description}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

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
  onItemAction,
  npcsInScene,
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
  const [selectedSpellName, setSelectedSpellName] = useState(null);
  const [spellViewMode, setSpellViewMode] = useState('list');
  const [crystalItemId, setCrystalItemId] = useState(null);
  const [useItemModalItem, setUseItemModalItem] = useState(null);
  const [regeneratingItemId, setRegeneratingItemId] = useState(null);
  const selectedItem = inventoryItems.find((i) => i.id === selectedItemId) || null;
  const knownSpells = useMemo(() => {
    const usageCounts = character.spells?.usageCounts || {};
    const customCatalogByName = new Map(gameData.customSpells.map((spell) => [spell.name, spell]));
    return (character.spells?.known || []).map((spellName) => {
      const base = resolveKnownSpellDisplay(spellName, character);
      const catalogEntry = base.isCustom ? customCatalogByName.get(spellName) : null;
      return {
        ...base,
        name: base.name,
        uses: usageCounts[spellName] || 0,
        manaCost: base.manaCost || catalogEntry?.manaCost || 2,
        level: base.level || catalogEntry?.level || null,
        school: base.school || catalogEntry?.school || null,
        treeName: base.isCustom
          ? (SPELL_TREES[base.school || catalogEntry?.school]?.name || t('magic.customSpellSchool', { defaultValue: 'Niestandardowe' }))
          : base.treeName,
        description: base.isCustom
          ? (base.description || catalogEntry?.description || '')
          : base.description,
      };
    });
  }, [character.spells?.known, character.spells?.usageCounts, character.spells?.icons, character.spells?.schools, character.spells?.details, t]);
  const incompleteCustomSpellNames = useMemo(
    () => knownSpells
      .filter((spell) => spell.isCustom && (!spell.school || !spell.level || !spell.description))
      .map((spell) => spell.name),
    [knownSpells],
  );
  const spellSchoolClassifyAttemptedRef = useRef(new Set());
  const { generateItemImageForInventoryItem, generateSpellImageForSpell } = useAI();
  const canRegenerateItemImage = !isMultiplayer && settings.itemImagesEnabled !== false;
  const canRegenerateSpellImage = !isMultiplayer && settings.itemImagesEnabled !== false;
  const [regeneratingSpellName, setRegeneratingSpellName] = useState(null);
  const [classifyingSpellSchools, setClassifyingSpellSchools] = useState(false);

  useEffect(() => {
    if (selectedItemId && !inventoryItems.some((i) => i.id === selectedItemId)) {
      setSelectedItemId(null);
    }
  }, [inventoryItems, selectedItemId]);

  useEffect(() => {
    if (selectedSpellName && !knownSpells.some((spell) => spell.name === selectedSpellName)) {
      setSelectedSpellName(null);
    }
  }, [knownSpells, selectedSpellName]);

  const classifyMissingSpellSchools = useCallback(async () => {
    if (!dispatch || isMultiplayer || incompleteCustomSpellNames.length === 0 || classifyingSpellSchools) return;

    const spellNames = incompleteCustomSpellNames.filter(
      (name) => !spellSchoolClassifyAttemptedRef.current.has(`${name}:meta_v2`),
    );
    if (spellNames.length === 0) return;

    for (const name of spellNames) {
      spellSchoolClassifyAttemptedRef.current.add(`${name}:meta_v2`);
    }

    setClassifyingSpellSchools(true);
    try {
      const { results, details } = await apiClient.post('/ai/classify-spell-school', { spellNames });
      if (results) {
        for (const [spellName, school] of Object.entries(results)) {
          const detail = details?.[spellName];
          dispatch({
            type: 'APPLY_STATE_CHANGES',
            payload: {
              learnSpell: spellName,
              learnSpellSchool: detail?.school || school,
              ...(detail?.description ? { learnSpellDescription: detail.description } : {}),
              ...(detail?.level ? { learnSpellLevel: detail.level } : {}),
              ...(detail?.manaCost ? { learnSpellManaCost: detail.manaCost } : {}),
            },
          });
        }
        if (autoSave) autoSave();
      }
    } catch {
      // Classification is a convenience; leave the spell uncategorized if the AI call fails.
    } finally {
      setClassifyingSpellSchools(false);
    }
  }, [autoSave, classifyingSpellSchools, dispatch, isMultiplayer, incompleteCustomSpellNames]);

  useEffect(() => {
    void classifyMissingSpellSchools();
  }, [classifyMissingSpellSchools]);

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
  const handleRegenerateItemImage = async (itemId) => {
    const target = inventoryItems.find((i) => i.id === itemId);
    if (!target || regeneratingItemId) return;
    setRegeneratingItemId(itemId);
    try {
      await generateItemImageForInventoryItem(target, { forceNew: true });
    } finally {
      setRegeneratingItemId(null);
    }
  };
  const handleRegenerateSpellImage = async (spellName) => {
    if (!spellName || regeneratingSpellName) return;
    setRegeneratingSpellName(spellName);
    try {
      await generateSpellImageForSpell(spellName, { forceNew: true });
    } finally {
      setRegeneratingSpellName(null);
    }
  };

  const spellPanel = (
    <SpellsGrid
      spells={knownSpells}
      selectedSpellName={selectedSpellName}
      onSelectSpell={setSelectedSpellName}
      spellImages={gameData.spellImages}
      currentMana={character.mana?.current || 0}
      onRegenerateImage={canRegenerateSpellImage ? handleRegenerateSpellImage : null}
      regeneratingSpellName={regeneratingSpellName}
      viewMode={spellViewMode}
      onViewModeChange={setSpellViewMode}
      t={t}
    />
  );

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-3 space-y-6 animate-fade-in">
          {!editingPortrait && (
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
              {canEditPortrait && (
                <button
                  onClick={() => setEditingPortrait(true)}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-label text-on-surface-variant hover:text-primary border border-outline-variant/15 hover:border-primary/30 rounded-sm transition-all hover:bg-surface-tint/10"
                >
                  <span className="material-symbols-outlined text-sm">photo_camera</span>
                  {t('character.updatePortrait')}
                </button>
              )}
            </div>
          )}

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
              {(character.activeEffects || []).length > 0 && (
                <div className="mt-2">
                  <ActiveEffectsRow effects={character.activeEffects} />
                </div>
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

        {spellViewMode === 'trees' && (
          <div className="lg:col-span-9 animate-expand-left overflow-hidden">
            {spellPanel}
          </div>
        )}

        <div className={`${spellViewMode === 'trees' ? 'lg:col-start-4 ' : ''}lg:col-span-5 space-y-6 animate-fade-in`}>
          <StatsGrid
            attributes={character.attributes}
            characterLevel={character.characterLevel}
            characterXp={character.characterXp}
            attributePoints={character.attributePoints}
            backstory={character.backstory}
          />

          <SkillsGrid character={character} t={t} />

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
                onUseItem={onItemAction ? (itemId) => setUseItemModalItem(inventoryItems.find((i) => i.id === itemId) || null) : undefined}
                onRegenerateImage={canRegenerateItemImage ? handleRegenerateItemImage : null}
                isRegenerating={regeneratingItemId === selectedItem.id}
              />
            </div>
          )}

        </div>

        <div className="lg:col-span-4 space-y-6 animate-fade-in">
          {spellViewMode !== 'trees' && spellPanel}

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
        </div>

      </div>

      {scenes && (
        <div className="mt-8 animate-fade-in">
          <CharacterHistoryPanel scenes={scenes} t={t} />
        </div>
      )}

      {(character?.backendId || character?.id) && (
        <div className="mt-8 animate-fade-in">
          <FavoriteScenesList characterId={character.backendId || character.id} />
        </div>
      )}

      {character?.skillBadges?.length > 0 && (
        <div className="mt-8 animate-fade-in">
          <BadgesSection
            badges={character.skillBadges}
            skillIcons={SKILL_ICONS}
            onRedeem={(index) => {
              const rewards = ['attribute', 'mana', 'wounds'];
              const reward = rewards[Math.floor(Math.random() * rewards.length)];
              dispatch({ type: 'REDEEM_SKILL_BADGE', payload: { index, reward } });
              if (autoSave) autoSave();
              return reward;
            }}
          />
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

      {useItemModalItem && (
        <UseItemModal
          item={useItemModalItem}
          character={character}
          npcs={npcsInScene || []}
          items={inventoryItems.filter((i) => i.id !== useItemModalItem.id)}
          onClose={() => setUseItemModalItem(null)}
          onSubmit={(actionText) => {
            setUseItemModalItem(null);
            setSelectedItemId(null);
            if (onItemAction) onItemAction(actionText);
          }}
        />
      )}

    </>
  );
}
