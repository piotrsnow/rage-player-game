import { useTranslation } from 'react-i18next';
import Tooltip from '../../ui/Tooltip';
import NpcMiniCard from '../world/NpcMiniCard';
import { useModals } from '../../../contexts/ModalContext';

/**
 * Wraps an NPC speaker label in chat. Hover reveals a mini character card;
 * click opens the full sheet modal. When `npc` is null (narrator, player, or
 * unresolved name) falls back to a plain span so nothing interactive leaks
 * into lines that aren't NPC dialogue.
 */
export default function NpcSpeakerChip({ npc, label, className = '' }) {
  const { t } = useTranslation();
  const { openNpcSheet } = useModals();

  if (!npc) {
    return <span className={className}>{label}</span>;
  }

  return (
    <Tooltip content={<NpcMiniCard npc={npc} />} delay={150}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          openNpcSheet(npc.name);
        }}
        className={`${className} underline decoration-dotted decoration-tertiary/50 underline-offset-2 hover:text-primary focus:text-primary transition-colors cursor-pointer`}
        aria-label={t('chat.openNpcSheet', { name: label })}
      >
        {label}
      </button>
    </Tooltip>
  );
}
