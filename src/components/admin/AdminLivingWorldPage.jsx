// Living World Phase 6 — admin observability dashboard (scoped).
//
// Tab switcher + auth gate only. Each tab's implementation lives under
// ./adminLivingWorld/tabs/ after the 795-LOC split; shared UI primitives
// are in ./adminLivingWorld/shared/. Deferred features (audit UI, etc.)
// live in knowledge/ideas/living-world-admin-extras.md.
//
// Access control: route guard calls the cheapest admin endpoint on mount.
// 403 shows a friendly message. Backend enforces the guard authoritatively.

import { useEffect, useState } from 'react';
import { apiClient } from '../../services/apiClient';
import AdminWorldLoreTab from './AdminWorldLoreTab';
import NpcListTab from './adminLivingWorld/tabs/NpcListTab';
import LocationListTab from './adminLivingWorld/tabs/LocationListTab';
import EventTimelineTab from './adminLivingWorld/tabs/EventTimelineTab';
import ReputationListTab from './adminLivingWorld/tabs/ReputationListTab';
import MapTab from './adminLivingWorld/tabs/MapTab';
import PromotionsTab from './adminLivingWorld/tabs/PromotionsTab';
import CanonGraphTab from './adminLivingWorld/tabs/CanonGraphTab';

const TABS = ['npcs', 'locations', 'events', 'reputation', 'map', 'lore', 'promotions', 'canon'];

export default function AdminLivingWorldPage() {
  const [tab, setTab] = useState('npcs');
  const [authorized, setAuthorized] = useState(null); // null=checking, true/false
  const [checkError, setCheckError] = useState(null);

  useEffect(() => {
    // Probe by calling the cheapest admin endpoint.
    apiClient
      .get('/v1/admin/livingWorld/locations?limit=1')
      .then(() => setAuthorized(true))
      .catch((err) => {
        setAuthorized(false);
        setCheckError(err?.message || 'Forbidden');
      });
  }, []);

  if (authorized === null) {
    return (
      <div className="p-8 text-on-surface-variant">Sprawdzam uprawnienia admina…</div>
    );
  }
  if (authorized === false) {
    return (
      <div className="p-8 max-w-xl">
        <h1 className="text-xl font-bold text-on-surface mb-2">Living World — Admin</h1>
        <p className="text-sm text-error">
          Brak dostępu. {checkError ? `(${checkError})` : ''}
        </p>
        <p className="text-xs text-on-surface-variant mt-2">
          Endpoint wymaga flag <code>isAdmin</code> na użytkowniku.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-xl font-bold text-on-surface mb-4 flex items-center gap-2">
        <span className="material-symbols-outlined text-tertiary">public</span>
        Living World — Admin Dashboard
        <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded-sm bg-tertiary/20 text-tertiary border border-tertiary/30">
          exp
        </span>
      </h1>

      <div className="flex items-center gap-1 border-b border-outline-variant/25 mb-4">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setTab(name)}
            className={`px-3 py-2 text-xs font-bold uppercase tracking-widest border-b-2 ${
              tab === name
                ? 'border-tertiary text-tertiary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      {tab === 'npcs' && <NpcListTab />}
      {tab === 'locations' && <LocationListTab />}
      {tab === 'events' && <EventTimelineTab />}
      {tab === 'reputation' && <ReputationListTab />}
      {tab === 'map' && <MapTab />}
      {tab === 'lore' && <AdminWorldLoreTab />}
      {tab === 'promotions' && <PromotionsTab />}
      {tab === 'canon' && <CanonGraphTab />}
    </div>
  );
}
