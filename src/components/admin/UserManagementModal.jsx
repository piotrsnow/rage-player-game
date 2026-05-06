import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { useModalA11y } from '../../hooks/useModalA11y';
import { apiClient } from '../../services/apiClient';

export default function UserManagementModal({ onClose }) {
  const { t } = useTranslation();
  const modalRef = useModalA11y(onClose);
  const { backendUser } = useSettings();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  const fetchUsers = useCallback(async () => {
    try {
      setError(null);
      const data = await apiClient.get('/admin/users');
      setUsers(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const toggleAdmin = async (userId, currentIsAdmin) => {
    setTogglingId(userId);
    try {
      const updated = await apiClient.patch(`/admin/users/${userId}`, {
        isAdmin: !currentIsAdmin,
      });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    } catch (err) {
      setError(err.message);
    } finally {
      setTogglingId(null);
    }
  };

  const isSelf = (userId) => userId === backendUser?.id;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('admin.userManagement')}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        ref={modalRef}
        className="relative w-full max-w-2xl max-h-[90vh] bg-surface-container-highest/80 backdrop-blur-2xl border border-outline-variant/15 rounded-sm flex flex-col shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/15 shrink-0">
          <h2 className="font-headline text-xl text-tertiary flex items-center gap-2">
            <span className="material-symbols-outlined text-primary-dim">admin_panel_settings</span>
            {t('admin.userManagement')}
          </h2>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="text-on-surface-variant hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="overflow-y-auto custom-scrollbar flex-1">
          <div className="px-6 lg:px-8 py-6">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <span className="material-symbols-outlined text-primary animate-spin text-3xl">progress_activity</span>
              </div>
            )}

            {error && (
              <div className="text-error text-sm bg-error/10 border border-error/20 rounded-sm px-4 py-3 mb-4">
                {error}
              </div>
            )}

            {!loading && !error && users.length === 0 && (
              <p className="text-on-surface-variant text-sm text-center py-8">
                {t('admin.noUsers')}
              </p>
            )}

            {!loading && users.length > 0 && (
              <div className="space-y-2">
                {users.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between gap-4 px-4 py-3 rounded-sm border border-outline-variant/10 bg-surface-container-high/30 hover:bg-surface-container-high/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-on-surface truncate">{user.email}</span>
                        {user.isAdmin && (
                          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-sm">
                            <span className="material-symbols-outlined text-xs">shield</span>
                            {t('admin.adminBadge')}
                          </span>
                        )}
                        {isSelf(user.id) && (
                          <span className="text-[10px] uppercase tracking-widest text-on-surface-variant/60">
                            ({t('admin.you')})
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-on-surface-variant/50">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <button
                      onClick={() => toggleAdmin(user.id, user.isAdmin)}
                      disabled={isSelf(user.id) || togglingId === user.id}
                      title={isSelf(user.id) ? t('admin.cannotDemoteSelf') : undefined}
                      className={`shrink-0 flex items-center gap-1.5 text-xs font-label uppercase tracking-widest px-3 py-1.5 rounded-sm border transition-all duration-200 ${
                        isSelf(user.id)
                          ? 'opacity-30 cursor-not-allowed border-outline-variant/10 text-on-surface-variant'
                          : user.isAdmin
                            ? 'border-error/30 text-error hover:bg-error/10 active:scale-95'
                            : 'border-primary/30 text-primary hover:bg-primary/10 active:scale-95'
                      }`}
                    >
                      {togglingId === user.id ? (
                        <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                      ) : (
                        <span className="material-symbols-outlined text-sm">
                          {user.isAdmin ? 'remove_moderator' : 'add_moderator'}
                        </span>
                      )}
                      {user.isAdmin ? t('admin.removeAdmin') : t('admin.makeAdmin')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
