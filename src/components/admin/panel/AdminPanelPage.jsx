// Admin panel — root page. Three-zone layout:
//   ┌──────────────────────────────────────────────────────────┐
//   │ Header (breadcrumbs + Validate + Snapshots + Save)       │
//   ├────────────────┬─────────────────────────────────────────┤
//   │ Campaign list  │ Active tab (Campaign / Quests / NPCs… ) │
//   │ (sidebar)      │                                         │
//   └────────────────┴─────────────────────────────────────────┘
//
// Tab routing piggy-backs on URL: /admin/campaigns/:campaignId/:tab.
// Auth: gated by RequireAuth (in App.jsx) + isAdmin check below.

import { useEffect } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useSettings } from '../../../contexts/SettingsContext';
import { useAdminPanelStore } from '../../../stores/adminPanelStore';
import AdminCampaignSidebar from './AdminCampaignSidebar';
import AdminWorkspaceHeader from './AdminWorkspaceHeader';
import CampaignTab from './tabs/CampaignTab';
import QuestsTab from './tabs/QuestsTab';
import NpcsTab from './tabs/NpcsTab';
import WorldNpcsTab from './tabs/WorldNpcsTab';
import LocationsTab from './tabs/LocationsTab';
import EdgesTab from './tabs/EdgesTab';
import CharactersTab from './tabs/CharactersTab';
import ScenesTab from './tabs/ScenesTab';
import IncidentsTab from './tabs/IncidentsTab';
import SnapshotsTab from './tabs/SnapshotsTab';

export const ADMIN_TABS = [
  { key: 'campaign', label: 'Kampania', component: CampaignTab },
  { key: 'quests', label: 'Questy', component: QuestsTab },
  { key: 'npcs', label: 'NPC', component: NpcsTab },
  { key: 'world-npcs', label: 'World NPC', component: WorldNpcsTab },
  { key: 'locations', label: 'Lokacje', component: LocationsTab },
  { key: 'edges', label: 'Krawędzie', component: EdgesTab },
  { key: 'characters', label: 'Postacie', component: CharactersTab },
  { key: 'scenes', label: 'Sceny', component: ScenesTab },
  { key: 'incidents', label: 'Skargi', component: IncidentsTab },
  { key: 'snapshots', label: 'Snapshoty', component: SnapshotsTab },
];

export default function AdminPanelPage() {
  const { backendUser } = useSettings();
  const { campaignId, tab } = useParams();
  const navigate = useNavigate();

  const loadCampaigns = useAdminPanelStore((s) => s.loadCampaigns);
  const selectCampaign = useAdminPanelStore((s) => s.selectCampaign);
  const currentCampaignId = useAdminPanelStore((s) => s.currentCampaignId);
  const currentCampaign = useAdminPanelStore((s) => s.currentCampaign);
  const currentLoading = useAdminPanelStore((s) => s.currentLoading);
  const currentError = useAdminPanelStore((s) => s.currentError);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  useEffect(() => {
    if (campaignId && campaignId !== currentCampaignId) {
      selectCampaign(campaignId);
    }
  }, [campaignId, currentCampaignId, selectCampaign]);

  // Defense-in-depth — backend already gates on isAdmin, but keep the FE
  // route from rendering for non-admin sessions.
  if (backendUser && backendUser.isAdmin !== true) {
    return <Navigate to="/" replace />;
  }

  const activeTabKey = tab || 'campaign';
  const ActiveTab = ADMIN_TABS.find((t) => t.key === activeTabKey)?.component || CampaignTab;

  return (
    <div className="flex h-[calc(100dvh-4rem)] bg-slate-950 text-slate-100">
      <AdminCampaignSidebar
        selectedId={currentCampaignId}
        onSelect={(id) => navigate(`/admin/campaigns/${id}/${activeTabKey}`)}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AdminWorkspaceHeader
          tabs={ADMIN_TABS}
          activeTabKey={activeTabKey}
          campaign={currentCampaign?.campaign}
          onSelectTab={(key) =>
            navigate(`/admin/campaigns/${currentCampaignId || ''}/${key}`)
          }
        />
        <main className="flex-1 overflow-auto p-6">
          {!currentCampaignId && (
            <EmptyHint />
          )}
          {currentCampaignId && currentLoading && (
            <div className="text-slate-400">Ładowanie kampanii…</div>
          )}
          {currentCampaignId && currentError && (
            <div className="rounded border border-red-700 bg-red-900/30 p-4 text-red-200">
              {currentError}
            </div>
          )}
          {currentCampaignId && currentCampaign && !currentLoading && (
            <ActiveTab campaign={currentCampaign} />
          )}
        </main>
      </div>
    </div>
  );
}

function EmptyHint() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-md rounded-lg border border-slate-800 bg-slate-900/50 p-8 text-center">
        <h2 className="text-xl font-semibold text-slate-100">Panel admina</h2>
        <p className="mt-2 text-sm text-slate-400">
          Wybierz kampanię z listy po lewej. Każda mutacja automatycznie tworzy snapshot,
          który możesz przywrócić w razie potrzeby.
        </p>
      </div>
    </div>
  );
}
