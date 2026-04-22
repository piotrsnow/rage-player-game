import { Empty } from './primitives';
import { summarizePayload } from './summarizePayload';

/**
 * Vertical list of WorldEvents. Used by both the Events tab (with
 * `showCampaignId`) and the Location detail drill-down (without).
 */
export default function EventList({ events, showCampaignId }) {
  if (!events?.length) return <Empty />;
  return (
    <ul className="max-h-[60vh] overflow-y-auto divide-y divide-outline-variant/10 border border-outline-variant/25 rounded-sm">
      {events.map((e) => (
        <li key={e.id} className="px-2 py-1.5 text-[11px]">
          <div className="flex items-start gap-2">
            <span className="text-tertiary font-bold shrink-0">[{e.eventType}]</span>
            <span className="text-on-surface-variant shrink-0 font-mono text-[10px]">
              {new Date(e.createdAt).toISOString().slice(0, 16)}
            </span>
            {e.visibility !== 'campaign' && (
              <span className="text-[9px] uppercase px-1 rounded-sm bg-surface-container-highest text-on-surface-variant shrink-0">
                {e.visibility}
              </span>
            )}
            {showCampaignId && e.campaignId && (
              <span className="text-[9px] text-on-surface-variant font-mono shrink-0">
                c:{e.campaignId.slice(-6)}
              </span>
            )}
            <span className="text-on-surface min-w-0 break-words">{summarizePayload(e.payload)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
