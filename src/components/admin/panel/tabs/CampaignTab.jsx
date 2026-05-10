// Campaign tab — top-level scalars + coreState JSON.

import { useState } from 'react';
import EntityForm from '../shared/EntityForm';
import { campaignFields } from '../entityConfigs';
import { adminApi } from '../shared/adminApi';
import { useAdminPanelStore } from '../../../../stores/adminPanelStore';

export default function CampaignTab({ campaign }) {
  const refreshCurrent = useAdminPanelStore((s) => s.refreshCurrent);
  const validate = useAdminPanelStore((s) => s.validate);
  const [busy, setBusy] = useState(false);

  if (!campaign?.campaign) return null;

  async function handleSave(diff) {
    setBusy(true);
    try {
      await adminApi.patchCampaign(campaign.campaign.id, diff);
      await refreshCurrent();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-5xl">
      <h2 className="mb-4 text-lg font-semibold text-slate-100">Pola kampanii</h2>
      <EntityForm
        fields={campaignFields}
        value={campaign.campaign}
        onSave={handleSave}
        onValidate={validate}
        busy={busy}
      />
    </div>
  );
}
