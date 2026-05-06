import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../../contexts/SettingsContext';
import { apiClient } from '../../../services/apiClient';

const PACKAGES = [
  { cents: 200, label: '$2' },
  { cents: 500, label: '$5' },
  { cents: 1000, label: '$10' },
  { cents: 2500, label: '$25' },
];

export default function CreditsSection() {
  const { t } = useTranslation();
  const { backendUser, loadBackendUser } = useSettings();
  const [customAmount, setCustomAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    if (params.get('credits') === 'success' && sessionId) {
      setLoading(true);
      apiClient.verifyCreditsCheckout(sessionId)
        .then((res) => {
          if (res.credited) setSuccessMsg('Doładowanie zakończone pomyślnie!');
          loadBackendUser();
        })
        .catch(() => loadBackendUser())
        .finally(() => setLoading(false));

      const url = new URL(window.location.href);
      url.searchParams.delete('credits');
      url.searchParams.delete('session_id');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    }
  }, [loadBackendUser]);

  const credits = backendUser?.credits ?? 0;

  async function handleCheckout(amountCents) {
    setError('');
    setLoading(true);
    try {
      const { url } = await apiClient.createCreditsCheckout(amountCents);
      if (url) window.location.href = url;
    } catch (err) {
      setError(err.message || t('credits.checkoutFailed'));
    } finally {
      setLoading(false);
    }
  }

  function handleCustomCheckout() {
    const dollars = parseFloat(customAmount);
    if (!Number.isFinite(dollars) || dollars < 1 || dollars > 100) {
      setError(t('credits.amountRange'));
      return;
    }
    handleCheckout(Math.round(dollars * 100));
  }

  return (
    <div className="bg-surface-container-high/60 backdrop-blur-xl p-8 rounded-sm border-l border-tertiary/20">
      <h2 className="font-headline text-xl text-tertiary mb-6 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary-dim">payments</span>
        {t('credits.title')}
      </h2>

      <div className="flex items-baseline gap-3 mb-6">
        <span className="text-3xl font-headline text-primary">
          ${(credits / 100).toFixed(2)}
        </span>
        <span className="text-sm text-on-surface-variant">{t('credits.available')}</span>
      </div>

      <p className="text-xs text-on-surface-variant mb-4">
        {t('credits.description')}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {PACKAGES.map((pkg) => (
          <button
            key={pkg.cents}
            disabled={loading}
            onClick={() => handleCheckout(pkg.cents)}
            className="px-4 py-3 rounded-sm border border-outline-variant/15 bg-surface-container-high/40 text-on-surface hover:border-primary/30 hover:bg-surface-tint/10 hover:text-primary transition-all font-headline text-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pkg.label}
          </button>
        ))}
      </div>

      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-[200px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">$</span>
          <input
            type="number"
            min="1"
            max="100"
            step="0.01"
            placeholder={t('credits.customAmount')}
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            disabled={loading}
            className="w-full pl-7 pr-3 py-2.5 rounded-sm border border-outline-variant/15 bg-surface-container-high/40 text-on-surface text-sm placeholder:text-on-surface-variant/60 focus:border-primary/40 focus:outline-none transition-colors disabled:opacity-50"
          />
        </div>
        <button
          onClick={handleCustomCheckout}
          disabled={loading || !customAmount}
          className="px-5 py-2.5 rounded-sm bg-primary/15 border border-primary/30 text-primary font-label text-sm hover:bg-primary/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? t('credits.redirecting') : t('credits.topUp')}
        </button>
      </div>

      {error && (
        <p className="mt-3 text-xs text-error">{error}</p>
      )}
      {successMsg && (
        <p className="mt-3 text-xs text-primary">{successMsg}</p>
      )}

      <div className="mt-6 pt-5 border-t border-outline-variant/10 flex items-center gap-3">
        <button
          onClick={async () => {
            setPortalLoading(true);
            setError('');
            try {
              const { url } = await apiClient.createBillingPortalSession();
              if (url) window.location.href = url;
            } catch (err) {
              setError(err.message || t('credits.billingPortalFailed'));
            } finally {
              setPortalLoading(false);
            }
          }}
          disabled={portalLoading || loading}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-sm border border-outline-variant/15 bg-surface-container-high/40 text-on-surface text-sm hover:border-primary/30 hover:text-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="material-symbols-outlined text-base">receipt_long</span>
          {portalLoading ? t('credits.redirecting') : t('credits.billingPortal')}
        </button>
        <span className="text-[10px] text-on-surface-variant/50">{t('credits.billingPortalHint')}</span>
      </div>

      <p className="mt-4 text-[10px] text-on-surface-variant/50">
        {t('credits.footer')}
      </p>
    </div>
  );
}
