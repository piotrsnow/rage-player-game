import { useTranslation } from 'react-i18next';
import { NODE_COLORS } from '../../../services/gmDataTransformer';
import { FACTION_DEFINITIONS, getReputationTierData } from '../../../data/wfrpFactions';

export default function GMEntityDetail({ node, edges, allNodes, onClose, onSelectNode }) {
  const { t } = useTranslation();
  if (!node) return null;

  const colors = NODE_COLORS[node.type] || NODE_COLORS.npc;

  const connections = edges.map((e) => {
    const otherId = e.source === node.id ? e.target : e.source;
    const otherNode = allNodes.find((n) => n.id === otherId);
    return { ...e, otherNode, direction: e.source === node.id ? 'outgoing' : 'incoming' };
  }).filter((c) => c.otherNode);

  return (
    <div className="w-72 border-l border-outline-variant/10 bg-surface-container-low/60 flex flex-col shrink-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/10">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: colors.fill }}
          />
          <span className="text-xs font-bold text-on-surface truncate">{node.name}</span>
        </div>
        <button
          onClick={onClose}
          className="material-symbols-outlined text-sm text-outline hover:text-on-surface transition-colors shrink-0"
        >
          close
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
        <div className="text-[10px] font-label uppercase tracking-widest text-outline">
          {t(`gmModal.nodeTypes.${node.type}`)}
        </div>

        {node.type === 'npc' || node.type === 'pc' ? (
          <NpcDetail data={node.data} isPC={node.type === 'pc'} t={t} />
        ) : node.type === 'location' ? (
          <LocationDetail data={node.data} t={t} />
        ) : node.type === 'faction' ? (
          <FactionDetail data={node.data} t={t} />
        ) : node.type === 'quest' ? (
          <QuestDetail data={node.data} t={t} />
        ) : null}

        {/* Connections */}
        {connections.length > 0 && (
          <div>
            <div className="text-[10px] font-label uppercase tracking-widest text-outline mb-2">
              {t('gmModal.connections')} ({connections.length})
            </div>
            <div className="space-y-1">
              {connections.map((conn, i) => {
                const otherColors = NODE_COLORS[conn.otherNode.type] || NODE_COLORS.npc;
                return (
                  <button
                    key={i}
                    onClick={() => onSelectNode(conn.otherNode.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-surface-container/60 transition-colors text-left"
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: otherColors.fill }}
                    />
                    <span className="text-[11px] text-on-surface truncate flex-1">
                      {conn.otherNode.name}
                    </span>
                    <span className="text-[9px] text-outline shrink-0">{conn.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NpcDetail({ data, isPC, t }) {
  if (!data) return null;
  return (
    <div className="space-y-2 text-[11px] text-on-surface-variant">
      {isPC && data.species && <Field label={t('gmModal.detail.species')} value={data.species} />}
      {isPC && data.career && (
        <Field label={t('gmModal.detail.career')} value={`${data.career.name} (${t('gmModal.detail.tier')} ${data.career.tier})`} />
      )}
      {data.role && <Field label={t('gmModal.detail.role')} value={data.role} />}
      {data.personality && <Field label={t('gmModal.detail.personality')} value={data.personality} />}
      {data.attitude && (
        <div className="flex items-center gap-2">
          <span className="text-outline">{t('gmModal.detail.attitude')}:</span>
          <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-sm ${
            data.attitude === 'friendly' ? 'bg-primary/15 text-primary' :
            data.attitude === 'hostile' ? 'bg-error/15 text-error' :
            'bg-outline/10 text-outline'
          }`}>{data.attitude}</span>
        </div>
      )}
      {data.disposition != null && data.disposition !== 0 && (
        <div className="flex items-center gap-2">
          <span className="text-outline">{t('gmModal.detail.disposition')}:</span>
          <span className={`font-bold ${data.disposition > 0 ? 'text-primary' : 'text-error'}`}>
            {data.disposition > 0 ? '+' : ''}{data.disposition}
          </span>
        </div>
      )}
      {data.gender && <Field label={t('gmModal.detail.gender')} value={data.gender} />}
      {data.lastLocation && <Field label={t('gmModal.detail.location')} value={data.lastLocation} />}
      {data.alive === false && (
        <div className="text-error font-bold uppercase text-[10px]">{t('gmModal.detail.dead')}</div>
      )}
      {data.notes && <div className="text-outline italic pt-1 border-t border-outline-variant/10">{data.notes}</div>}
      {data.isCompanion && (
        <div className="text-primary font-bold uppercase text-[10px]">{t('gmModal.detail.companion')}</div>
      )}
      {isPC && data.wounds != null && (
        <Field label={t('gmModal.detail.wounds')} value={`${data.wounds} / ${data.maxWounds}`} />
      )}
    </div>
  );
}

function LocationDetail({ data, t }) {
  if (!data) return null;
  return (
    <div className="space-y-2 text-[11px] text-on-surface-variant">
      {data.description && <p>{data.description}</p>}
      {data.isCurrent && (
        <div className="text-primary font-bold uppercase text-[10px]">{t('gmModal.detail.currentLocation')}</div>
      )}
      {data.modifications?.length > 0 && (
        <div>
          <div className="text-[10px] text-outline mb-1">{t('gmModal.detail.modifications')}:</div>
          {data.modifications.map((mod, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[10px] text-outline">
              <span className="material-symbols-outlined text-[10px] mt-0.5">
                {mod.type === 'trap' ? 'warning' : mod.type === 'destruction' ? 'dangerous' : mod.type === 'discovery' ? 'search' : 'change_circle'}
              </span>
              <span>[{mod.type}] {mod.description}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FactionDetail({ data, t }) {
  if (!data) return null;
  const def = FACTION_DEFINITIONS[data.factionId];
  const tierData = getReputationTierData(data.reputation || 0);
  const pct = ((data.reputation + 100) / 200) * 100;

  return (
    <div className="space-y-2 text-[11px] text-on-surface-variant">
      {def?.description && <p>{def.description}</p>}
      <div className="flex items-center justify-between">
        <span className="text-outline">{t('gmModal.detail.reputation')}:</span>
        <span className={`font-bold ${data.reputation > 0 ? 'text-primary' : data.reputation < 0 ? 'text-error' : 'text-outline'}`}>
          {data.reputation > 0 ? '+' : ''}{data.reputation}
        </span>
      </div>
      <div className="h-1.5 bg-surface-container rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300 rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-[10px] font-bold uppercase">{tierData.label}</div>
      {def?.effects[tierData.tier] && (
        <p className="text-[10px] text-outline italic">{def.effects[tierData.tier]}</p>
      )}
    </div>
  );
}

function QuestDetail({ data, t }) {
  if (!data) return null;
  return (
    <div className="space-y-2 text-[11px] text-on-surface-variant">
      {data.description && <p>{data.description}</p>}
      {data.status && (
        <div className={`text-[10px] font-bold uppercase ${data.status === 'active' ? 'text-primary' : 'text-outline'}`}>
          {data.status}
        </div>
      )}
      {data.type && <Field label={t('gmModal.detail.questType')} value={data.type} />}
      {data.objectives?.length > 0 && (
        <div>
          <div className="text-[10px] text-outline mb-1">{t('gmModal.detail.objectives')}:</div>
          {data.objectives.map((obj) => (
            <div key={obj.id} className="flex items-start gap-2 text-[10px]">
              <span className={`material-symbols-outlined text-xs mt-0.5 ${obj.completed ? 'text-primary' : 'text-outline'}`}>
                {obj.completed ? 'check_circle' : 'radio_button_unchecked'}
              </span>
              <span className={obj.completed ? 'line-through text-outline' : ''}>{obj.description}</span>
            </div>
          ))}
        </div>
      )}
      {data.completionCondition && <Field label={t('gmModal.detail.completion')} value={data.completionCondition} />}
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <span className="text-outline">{label}:</span>{' '}
      <span className="text-on-surface-variant">{value}</span>
    </div>
  );
}
