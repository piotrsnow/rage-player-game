import { useTranslation } from 'react-i18next';

const NEED_ICONS = { hunger: 'restaurant', thirst: 'water_drop', bladder: 'wc', hygiene: 'shower', rest: 'hotel' };

export default function GMAssetsTab({ gameState }) {
  const { t } = useTranslation();
  const character = gameState?.character;
  const party = gameState?.party || [];
  const world = gameState?.world || {};
  const activeEffects = (world.activeEffects || []).filter((e) => e.active !== false);
  const magic = gameState?.magic || {};

  if (!character) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-outline">
        <span className="material-symbols-outlined text-3xl">inventory_2</span>
        <p className="text-[11px] font-label uppercase tracking-widest">{t('gmModal.emptyAssets')}</p>
      </div>
    );
  }

  const money = character.money || {};
  const inventory = character.inventory || [];
  const needs = character.needs || {};
  const criticalWounds = character.criticalWounds || [];

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-4 space-y-6">
      {/* Money */}
      <Section title={t('gmModal.money')} icon="payments">
        <div className="flex items-center gap-4">
          <MoneyBadge label="GC" value={money.gold || 0} color="text-yellow-400" />
          <MoneyBadge label="SS" value={money.silver || 0} color="text-gray-300" />
          <MoneyBadge label="CP" value={money.copper || 0} color="text-orange-400" />
        </div>
      </Section>

      {/* Character inventory */}
      <Section title={`${character.name} — ${t('gmModal.inventory')}`} icon="backpack" count={inventory.length}>
        {inventory.length === 0 ? (
          <p className="text-[10px] text-outline italic">{t('gmModal.emptyInventory')}</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {inventory.map((item, i) => (
              <ItemCard key={item.id || i} item={item} />
            ))}
          </div>
        )}
      </Section>

      {/* Companion inventories */}
      {party.map((comp) => {
        const compInv = comp.inventory || [];
        if (compInv.length === 0) return null;
        return (
          <Section key={comp.name} title={`${comp.name} — ${t('gmModal.inventory')}`} icon="backpack" count={compInv.length}>
            <div className="grid gap-2 sm:grid-cols-2">
              {compInv.map((item, i) => (
                <ItemCard key={item.id || i} item={item} />
              ))}
            </div>
          </Section>
        );
      })}

      {/* Needs */}
      {Object.keys(needs).length > 0 && (
        <Section title={t('gmModal.needs')} icon="self_improvement">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(needs).map(([key, value]) => (
              <NeedBar key={key} label={key} value={value} icon={NEED_ICONS[key]} t={t} />
            ))}
          </div>
        </Section>
      )}

      {/* Critical wounds */}
      {criticalWounds.length > 0 && (
        <Section title={t('gmModal.criticalWounds')} icon="personal_injury" count={criticalWounds.length}>
          <div className="space-y-2">
            {criticalWounds.map((wound, i) => (
              <div key={i} className="p-2 rounded-sm bg-error-container/10 border border-error/15 text-[11px]">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="material-symbols-outlined text-xs text-error">local_hospital</span>
                  <span className="font-bold text-error">{wound.location || wound.name || `Wound #${i + 1}`}</span>
                </div>
                {wound.description && <p className="text-on-surface-variant">{wound.description}</p>}
                {wound.effect && <p className="text-[10px] text-outline italic">{wound.effect}</p>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Active effects */}
      {activeEffects.length > 0 && (
        <Section title={t('gmModal.activeEffects')} icon="auto_fix_high" count={activeEffects.length}>
          <div className="space-y-2">
            {activeEffects.map((fx) => (
              <div key={fx.id} className="p-2 rounded-sm bg-surface-container/40 border border-outline-variant/10 text-[11px]">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="material-symbols-outlined text-xs text-tertiary">
                    {fx.type === 'trap' ? 'warning' : fx.type === 'spell' ? 'auto_awesome' : 'eco'}
                  </span>
                  <span className="text-[10px] font-label uppercase tracking-wider text-tertiary">{fx.type}</span>
                </div>
                <p className="text-on-surface-variant">{fx.description}</p>
                {fx.location && <span className="text-[10px] text-outline">{fx.location}</span>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Magic */}
      {(magic.storedWindPoints > 0 || magic.knownSpells?.length > 0 || magic.activeSpells?.length > 0) && (
        <Section title={t('gmModal.magic')} icon="auto_awesome">
          <div className="space-y-2">
            {magic.storedWindPoints > 0 && (
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-outline">{t('gmModal.windPoints')}:</span>
                <span className="font-bold text-primary">{magic.storedWindPoints}</span>
              </div>
            )}
            {magic.knownSpells?.length > 0 && (
              <div>
                <div className="text-[10px] text-outline mb-1">{t('gmModal.knownSpells')}:</div>
                <div className="flex flex-wrap gap-1">
                  {magic.knownSpells.map((spell, i) => (
                    <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-sm bg-primary/10 text-primary/80">
                      {typeof spell === 'string' ? spell : spell.name || 'Spell'}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {magic.activeSpells?.length > 0 && (
              <div>
                <div className="text-[10px] text-outline mb-1">{t('gmModal.activeSpells')}:</div>
                <div className="flex flex-wrap gap-1">
                  {magic.activeSpells.map((spell, i) => (
                    <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-sm bg-tertiary/10 text-tertiary/80">
                      {typeof spell === 'string' ? spell : spell.name || 'Spell'}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, icon, count, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="material-symbols-outlined text-sm text-primary">{icon}</span>
        <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">{title}</span>
        {count != null && <span className="text-[10px] text-outline">({count})</span>}
      </div>
      {children}
    </div>
  );
}

function ItemCard({ item }) {
  const name = typeof item === 'string' ? item : item.name || 'Item';
  const desc = typeof item === 'object' ? item.description : null;
  const quantity = typeof item === 'object' ? item.quantity : null;

  return (
    <div className="p-2 rounded-sm bg-surface-container/40 border border-outline-variant/10">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-xs text-on-surface-variant">inventory_2</span>
        <span className="text-[11px] font-medium text-on-surface truncate">{name}</span>
        {quantity != null && quantity > 1 && (
          <span className="text-[9px] text-outline shrink-0">x{quantity}</span>
        )}
      </div>
      {desc && <p className="text-[10px] text-outline mt-0.5 line-clamp-2">{desc}</p>}
    </div>
  );
}

function MoneyBadge({ label, value, color }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`text-lg font-bold tabular-nums ${color}`}>{value}</span>
      <span className="text-[10px] font-label uppercase tracking-wider text-outline">{label}</span>
    </div>
  );
}

function NeedBar({ label, value, icon, t }) {
  const pct = Math.max(0, Math.min(100, value));
  const color = pct > 60 ? 'bg-primary' : pct > 30 ? 'bg-yellow-500' : 'bg-error';

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          {icon && <span className="material-symbols-outlined text-xs text-outline">{icon}</span>}
          <span className="text-[10px] font-label uppercase tracking-wider text-on-surface-variant capitalize">{label}</span>
        </div>
        <span className="text-[10px] font-bold tabular-nums text-on-surface-variant">{pct}</span>
      </div>
      <div className="h-1.5 bg-surface-container rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all duration-300 rounded-full`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
