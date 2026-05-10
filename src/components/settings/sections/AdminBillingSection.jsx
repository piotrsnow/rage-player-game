import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '../../../services/apiClient';
import { useSettings } from '../../../contexts/SettingsContext';

const FAKE_PACKAGES = [
  { cents: 200, label: '$2' },
  { cents: 500, label: '$5' },
  { cents: 1000, label: '$10' },
];

export default function AdminBillingSection() {
  const { t } = useTranslation();
  const { loadBackendUser } = useSettings();
  const [billingEnabled, setBillingEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [topUpLoading, setTopUpLoading] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  const fetchBilling = useCallback(async () => {
    try {
      const data = await apiClient.get('/admin/billing');
      setBillingEnabled(data.billingEnabled);
    } catch { /* ignore — admin-only */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchBilling(); }, [fetchBilling]);

  async function handleToggle() {
    setToggling(true);
    try {
      const data = await apiClient.put('/admin/billing', {
        billingEnabled: !billingEnabled,
      });
      setBillingEnabled(data.billingEnabled);
    } catch { /* ignore */ }
    setToggling(false);
  }

  async function handleFakeTopUp(cents) {
    setTopUpLoading(cents);
    setSuccessMsg('');
    try {
      await apiClient.post('/admin/billing/fake-topup', { amountCents: cents });
      await loadBackendUser();
      setSuccessMsg(t('adminBilling.topUpSuccess', { amount: `$${(cents / 100).toFixed(0)}` }));
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch { /* ignore */ }
    setTopUpLoading(null);
  }

  if (loading) return null;

  return (
    <div className="bg-error/5 backdrop-blur-xl p-6 rounded-sm border-l border-error/30">
      <h3 className="font-headline text-base text-error flex items-center gap-2 mb-4">
        <span className="material-symbols-outlined text-sm">admin_panel_settings</span>
        {t('adminBilling.title')}
      </h3>

      <label className="flex items-center gap-3 cursor-pointer select-none group mb-5">
        <div className="relative">
          <input
            type="checkbox"
            checked={billingEnabled}
            onChange={handleToggle}
            disabled={toggling}
            className="sr-only peer"
          />
          <div className="w-10 h-5 rounded-full bg-surface-container-high border border-outline-variant/20 peer-checked:bg-primary/30 peer-checked:border-primary/50 transition-all" />
          <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-on-surface-variant peer-checked:bg-primary peer-checked:translate-x-5 transition-all" />
        </div>
        <span className="text-sm text-on-surface group-hover:text-primary transition-colors">
          {t('adminBilling.chargeCredits')}
        </span>
      </label>

      <p className="text-xs text-on-surface-variant/70 mb-1">{t('adminBilling.fakeTopUpHint')}</p>
      <div className="flex gap-2">
        {FAKE_PACKAGES.map((pkg) => (
          <button
            key={pkg.cents}
            disabled={topUpLoading !== null}
            onClick={() => handleFakeTopUp(pkg.cents)}
            className="px-4 py-2 rounded-sm border border-error/20 bg-error/5 text-on-surface hover:border-error/40 hover:bg-error/10 hover:text-error transition-all font-headline text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {topUpLoading === pkg.cents ? '...' : `+${pkg.label}`}
          </button>
        ))}
      </div>

      {successMsg && (
        <p className="mt-2 text-xs text-primary">{successMsg}</p>
      )}
    </div>
  );
}
