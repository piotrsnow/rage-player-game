import { useEffect, useMemo, useState } from 'react';
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
import { resolveKnownSpellDisplay } from '../../services/magicEngine';
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
  'Atletyka': 'exercise',
  'Akrobatyka': 'sports_gymnastics',
  'Jezdziectwo': 'cavalier',
  'Perswazja': 'record_voice_over',
  'Blef': 'theater_comedy',
  'Handel': 'storefront',
  'Przywodztwo': 'military_tech',
  'Wystepy': 'mic',
  'Wiedza ogolna': 'menu_book',
  'Wiedza o potworach': 'pest_control',
  'Wiedza o naturze': 'forest',
  'Medycyna': 'healing',
  'Alchemia': 'science',
  'Rzemioslo': 'construction',
  'Skradanie': 'visibility_off',
  'Otwieranie zamkow': 'lock_open',
  'Kradziez kieszonkowa': 'back_hand',
  'Pulapki i mechanizmy': 'engineering',
  'Spostrzegawczosc': 'visibility',
  'Przetrwanie': 'local_fire_department',
  'Tropienie': 'explore',
  'Odpornosc': 'health_and_safety',
  'Fart': 'stars',
  'Hazard': 'casino',
  'Przeczucie': 'psychology',
};

const DIFFICULTY_LABELS = {
  easy: 'Łatwy',
  medium: 'Średni',
  hard: 'Trudny',
  veryHard: 'B. trudny',
  extreme: 'Ekstremalny',
};

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
  const cap = obj.cap ?? SKILL_CAPS.basic;
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

function SpellDetailPanel({ spell, uses, currentMana, t, onClose }) {
  const hasEnoughMana = currentMana >= spell.manaCost;

  return (
    <div className="bg-surface-container-low p-6 border border-tertiary/15 rounded-sm animate-fade-in">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-4 min-w-0">
          <span className="material-symbols-outlined text-tertiary text-3xl mt-0.5">
            {spell.icon}
          </span>
          <div className="min-w-0">
            <h4 className="text-tertiary font-headline text-xl leading-tight">{spell.name}</h4>
            <p className="text-on-surface-variant/70 text-sm mt-1">
              {spell.isCustom
                ? spell.treeName
                : (
                    <>
                      {spell.treeName} · {t('magic.level', { level: spell.level, defaultValue: `Poziom ${spell.level}` })}
                    </>
                  )}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="text-on-surface-variant hover:text-tertiary transition-colors"
        >
          <span className="material-symbols-outlined text-base">close</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-sm bg-surface-container-high/60 border border-outline-variant/10 px-3 py-2">
          <div className="text-[9px] font-label uppercase tracking-widest text-on-surface-variant/70">
            {t('magic.manaCost', 'Koszt many')}
          </div>
          <div className={`font-headline text-lg ${hasEnoughMana ? 'text-tertiary' : 'text-error-light'}`}>
            {spell.manaCost}
          </div>
        </div>
        <div className="rounded-sm bg-surface-container-high/60 border border-outline-variant/10 px-3 py-2">
          <div className="text-[9px] font-label uppercase tracking-widest text-on-surface-variant/70">
            {t('magic.usesLabel', 'Uzycia')}
          </div>
          <div className="font-headline text-lg text-primary">{uses}</div>
        </div>
      </div>

      <p className="text-on-surface-variant text-sm leading-relaxed">{spell.description}</p>
      {!hasEnoughMana && (
        <p className="text-error-light/80 text-xs mt-3">
          {t('magic.notEnoughMana', { defaultValue: 'Za malo many na rzucenie tego zaklecia.' })}
        </p>
      )}
    </div>
  );
}

function SpellsGrid({ spells, selectedSpellName, onSelectSpell, t }) {
  if (spells.length === 0) return null;

  return (
    <div className="bg-surface-container-low p-6 border border-tertiary/15 rounded-sm">
      <h3 className="text-tertiary font-headline mb-4 flex items-center gap-2">
        <span className="material-symbols-outlined text-sm">auto_awesome</span>
        {t('magic.spells', 'Zaklecia')}
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {spells.map((spell) => {
          const isSelected = selectedSpellName === spell.name;
          return (
            <button
              key={spell.name}
              type="button"
              onClick={() => onSelectSpell(isSelected ? null : spell.name)}
              className={`bg-surface-container-high/60 backdrop-blur-md p-3 border-b-2 flex flex-col items-center text-center transition-all hover:bg-surface-container-highest/80 ${
                isSelected ? 'border-tertiary bg-tertiary/10' : 'border-tertiary/20'
              }`}
            >
              <span className="material-symbols-outlined text-tertiary mb-1 text-3xl">{spell.icon}</span>
              <span className="text-on-surface-variant font-label text-[9px] uppercase tracking-[0.1em] leading-tight">
                {spell.name}
              </span>
              <span className="text-[10px] text-outline mt-1">
                {spell.manaCost} {t('magic.manaShort', 'many')}
              </span>
            </button>
          );
        })}
      </div>
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
  const [crystalItemId, setCrystalItemId] = useState(null);
  const [useItemModalItem, setUseItemModalItem] = useState(null);
  const [regeneratingItemId, setRegeneratingItemId] = useState(null);
  const selectedItem = inventoryItems.find((i) => i.id === selectedItemId) || null;
  const knownSpells = useMemo(() => {
    const usageCounts = character.spells?.usageCounts || {};
    return (character.spells?.known || []).map((spellName) => {
      const base = resolveKnownSpellDisplay(spellName, character);
      return {
        ...base,
        name: base.name,
        uses: usageCounts[spellName] || 0,
        treeName: base.isCustom
          ? t('magic.customSpellSchool', { defaultValue: 'Niestandardowe' })
          : base.treeName,
        description: base.isCustom
          ? t('magic.customSpellDescription', { defaultValue: 'Zaklęcie z fabuły lub wymyślone — nie należy do standardowego drzewka w grze.' })
          : base.description,
      };
    });
  }, [character.spells?.known, character.spells?.usageCounts, character.spells?.icons, t]);
  const selectedSpell = selectedSpellName
    ? knownSpells.find((spell) => spell.name === selectedSpellName) || null
    : null;

  const { generateItemImageForInventoryItem } = useAI();
  const canRegenerateItemImage = !isMultiplayer && settings.itemImagesEnabled !== false;

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

        <div className="lg:col-span-5 space-y-6 animate-fade-in">
          <StatsGrid
            attributes={character.attributes}
            characterLevel={character.characterLevel}
            characterXp={character.characterXp}
            attributePoints={character.attributePoints}
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

          <SpellsGrid
            spells={knownSpells}
            selectedSpellName={selectedSpellName}
            onSelectSpell={setSelectedSpellName}
            t={t}
          />

          {selectedSpell && (
            <SpellDetailPanel
              spell={selectedSpell}
              uses={selectedSpell.uses}
              currentMana={character.mana?.current || 0}
              t={t}
              onClose={() => setSelectedSpellName(null)}
            />
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
