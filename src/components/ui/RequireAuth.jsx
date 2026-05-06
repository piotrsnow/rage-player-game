import { Navigate, Outlet } from 'react-router-dom';
import { useSettings } from '../../contexts/SettingsContext';
import LoadingSpinner from './LoadingSpinner';

export default function RequireAuth() {
  const { backendUser, backendAuthChecking } = useSettings();

  if (backendAuthChecking) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!backendUser) return <Navigate to="/" replace />;

  return <Outlet />;
}
