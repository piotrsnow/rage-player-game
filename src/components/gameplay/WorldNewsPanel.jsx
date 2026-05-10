import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../services/apiClient';

export default function WorldNewsPanel({ campaignId }) {
  const { t } = useTranslation();
  const [events, setEvents] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!campaignId || fetchedRef.current) return;
    fetchedRef.current = true;

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    apiClient.get(`/livingWorld/news?since=${since}`)
      .then((data) => setEvents(data.events || []))
      .catch(() => setEvents([]));
  }, [campaignId]);

  if (dismissed || !events || events.length === 0) return null;

  const display = events.slice(0, 3);

  return (
    <div className="relative bg-surface-container-low/60 backdrop-blur-md border border-outline-variant/15 rounded-sm p-4 animate-fade-in">
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-2 right-2 text-on-surface-variant/60 hover:text-on-surface transition-colors"
        aria-label={t('common.close', 'Zamknij')}
      >
        <span className="material-symbols-outlined text-base">close</span>
      </button>

      <label className="block text-[10px] text-on-surface-variant font-label uppercase tracking-widest mb-2">
        {t('worldNews.title', 'Wieści ze świata')}
      </label>

      <ul className="space-y-1.5">
        {display.map((ev) => (
          <li key={ev.id} className="flex items-start gap-2 text-sm text-on-surface/85">
            <span className="material-symbols-outlined text-primary/70 text-sm mt-0.5 shrink-0">campaign</span>
            <span>
              <strong className="font-medium text-on-surface">{ev.title}</strong>
              {ev.description ? ` — ${ev.description}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
