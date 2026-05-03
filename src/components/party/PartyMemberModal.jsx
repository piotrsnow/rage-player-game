import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import ModalShell from '../admin/adminLivingWorld/shared/ModalShell';
import { apiClient } from '../../services/apiClient';
import { speciesIcon } from '../../utils/speciesIcons';
import { translateSkill } from '../../utils/rpgTranslate';
import { ATTRIBUTE_KEYS } from '../../data/rpgSystem';

const BEHAVIORS = ['aggressive', 'defensive', 'supportive', 'passive'];
const STANCES = ['attack', 'defend', 'support'];

function memberId(m) {
  if (!m) return '';
  return m.id ?? m.odId ?? m.name ?? '';
}

export default function PartyMemberModal({ member, onClose, onManageCompanion, dispatch }) {
  const { t } = useTranslation();

  const topSkills = useMemo(() => {
    if (!member?.skills || typeof member.skills !== 'object') return [];
    return Object.entries(member.skills)
      .map(([name, v]) => [name, typeof v === 'object' ? v.level : (v || 0)])
      .filter(([, level]) => level > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [member]);

  const equipmentSummary = useMemo(() => {
    const inv = member?.inventory;
    if (!Array.isArray(inv) || inv.length === 0) return t('party.noEquipment', 'Brak wyposażenia');
    const equipped = inv.filter((i) => i.equipped || i.slot);
    const slice = (equipped.length ? equipped : inv).slice(0, 6);
    return slice.map((i) => (typeof i === 'string' ? i : i.name)).filter(Boolean).join(', ');
  }, [member, t]);

  if (!member) return null;

  const isCompanion = member.type === 'companion';
  const portraitUrl = member.portraitUrl ? apiClient.resolveMediaUrl(member.portraitUrl) : null;
  const speciesLabel = t(`species.${member.species}`, { defaultValue: member.species || '' });

  const handleDismiss = () => {
    if (!isCompanion || typeof dispatch !== 'function') return;
    const id = memberId(member);
    const confirmed = window.confirm(
      t('party.dismissConfirm', 'Czy na pewno chcesz pożegnać {{name}}?', { name: member.name }),
    );
    if (!confirmed) return;
    dispatch({ type: 'DISMISS_PARTY_COMPANION', payload: { id } });
    onClose?.();
  };

  const setCompanionField = (field, value) => {
    if (!isCompanion) return;
    const id = memberId(member);
    if (typeof onManageCompanion === 'function') {
      onManageCompanion(id, { [field]: value });
    }
  };

  return (
    <ModalShell onClose={onClose} title={member.name}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-1">
          <div className="aspect-[3/4] rounded-sm overflow-hidden border border-outline-variant/25 bg-surface-container relative">
            {portraitUrl ? (
              <img
                src={portraitUrl}
                alt={member.name}
                className="absolute inset-0 w-full h-full object-cover"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            ) : (
              <div className={`absolute inset-0 flex items-center justify-center ${isCompanion ? 'text-tertiary' : 'text-primary'}`}>
                <span className="material-symbols-outlined text-6xl">{speciesIcon(member.species)}</span>
              </div>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-on-surface-variant">{speciesLabel}</span>
            <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-sm border ${
              isCompanion
                ? 'text-tertiary border-tertiary/30 bg-tertiary/10'
                : 'text-primary border-primary/30 bg-primary/10'
            }`}>
              {isCompanion ? t('party.typeCompanion', 'Towarzysz') : t('party.typePlayer', 'Gracz')}
            </span>
          </div>
          <div className="mt-2">
            <div className="flex items-center gap-2 text-[11px] text-on-surface-variant">
              <span className="material-symbols-outlined text-error text-base">favorite</span>
              <span className="tabular-nums">
                {member.wounds ?? 0}/{member.maxWounds ?? 0}
              </span>
              <span>{t('common.wounds', 'Życie')}</span>
            </div>
            {member.mana?.max > 0 && (
              <div className="flex items-center gap-2 text-[11px] text-on-surface-variant mt-1">
                <span className="material-symbols-outlined text-blue-300 text-base">auto_awesome</span>
                <span className="tabular-nums">{member.mana.current ?? 0}/{member.mana.max ?? 0}</span>
                <span>Mana</span>
              </div>
            )}
          </div>
        </div>

        <div className="sm:col-span-2 space-y-3">
          <div>
            <div className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">
              {t('party.attributes', 'Atrybuty')}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1">
              {ATTRIBUTE_KEYS.map((key) => (
                <div
                  key={key}
                  className="text-center px-1 py-1.5 rounded-sm bg-surface-container/50 border border-outline-variant/10"
                >
                  <div className="text-[9px] text-on-surface-variant">{t(`rpgAttributeShort.${key}`)}</div>
                  <div className="text-[12px] font-bold text-on-surface tabular-nums">
                    {member.attributes?.[key] ?? '—'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {topSkills.length > 0 && (
            <div>
              <div className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">
                {t('party.skills', 'Umiejętności')}
              </div>
              <div className="flex flex-wrap gap-1">
                {topSkills.map(([name, val]) => (
                  <span
                    key={name}
                    className="text-[10px] px-1.5 py-0.5 rounded-sm bg-surface-container/60 border border-outline-variant/10 text-on-surface-variant"
                  >
                    <span className="text-on-surface font-bold tabular-nums">{val}</span>{' '}
                    {translateSkill(name, t)}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">
              {t('party.equipment', 'Ekwipunek')}
            </div>
            <p className="text-[11px] text-on-surface leading-snug">{equipmentSummary}</p>
          </div>

          {isCompanion && (
            <div className="pt-3 border-t border-outline-variant/10 space-y-3">
              <div>
                <div className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">
                  {t('party.behavior', 'Zachowanie')}
                </div>
                <div className="flex flex-wrap gap-1">
                  {BEHAVIORS.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setCompanionField('companionBehavior', b)}
                      className={`px-2 py-1 rounded-sm border text-[10px] font-bold uppercase tracking-wider transition-colors ${
                        (member.companionBehavior || 'defensive') === b
                          ? 'bg-tertiary/20 text-tertiary border-tertiary/30'
                          : 'bg-surface-container/40 text-on-surface-variant border-outline-variant/10 hover:border-tertiary/20'
                      }`}
                    >
                      {t(`party.behavior.${b}`, b)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">
                  {t('party.combatStance', 'W walce')}
                </div>
                <div className="flex flex-wrap gap-1">
                  {STANCES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setCompanionField('combatStance', s)}
                      className={`px-2 py-1 rounded-sm border text-[10px] font-bold uppercase tracking-wider transition-colors ${
                        (member.combatStance || 'attack') === s
                          ? 'bg-primary/15 text-primary border-primary/30'
                          : 'bg-surface-container/40 text-on-surface-variant border-outline-variant/10 hover:border-primary/20'
                      }`}
                    >
                      {t(`party.stance.${s}`, s)}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={handleDismiss}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-error border border-error/30 hover:bg-error/10 rounded-sm transition-colors"
              >
                <span className="material-symbols-outlined text-base">person_remove</span>
                {t('party.dismiss', 'Pożegnaj towarzysza')}
              </button>
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
