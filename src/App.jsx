import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import LoadingSpinner from './components/ui/LoadingSpinner';

const LobbyPage = lazy(() => import('./components/lobby/LobbyPage'));
const CampaignCreatorPage = lazy(() => import('./components/creator/CampaignCreatorPage'));
const GameplayPage = lazy(() => import('./components/gameplay/GameplayPage'));
const JoinRoomPage = lazy(() => import('./components/multiplayer/JoinRoomPage'));
const GalleryPage = lazy(() => import('./components/gallery/GalleryPage'));
const CampaignViewerPage = lazy(() => import('./components/viewer/CampaignViewerPage'));
const AdminLivingWorldPage = lazy(() => import('./components/admin/AdminLivingWorldPage'));

function RouteFallback() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <LoadingSpinner size="lg" />
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route
          path="/"
          element={
            <Suspense fallback={<RouteFallback />}>
              <LobbyPage />
            </Suspense>
          }
        />
        <Route
          path="/create"
          element={
            <Suspense fallback={<RouteFallback />}>
              <CampaignCreatorPage />
            </Suspense>
          }
        />
        <Route
          path="/play/:campaignId?"
          element={
            <Suspense fallback={<RouteFallback />}>
              <GameplayPage />
            </Suspense>
          }
        />
        <Route
          path="/join/:code?"
          element={
            <Suspense fallback={<RouteFallback />}>
              <JoinRoomPage />
            </Suspense>
          }
        />
        <Route
          path="/gallery"
          element={
            <Suspense fallback={<RouteFallback />}>
              <GalleryPage />
            </Suspense>
          }
        />
        <Route
          path="/view/:shareToken"
          element={
            <Suspense fallback={<RouteFallback />}>
              <CampaignViewerPage />
            </Suspense>
          }
        />
        <Route
          path="/admin/living-world"
          element={
            <Suspense fallback={<RouteFallback />}>
              <AdminLivingWorldPage />
            </Suspense>
          }
        />
      </Route>
    </Routes>
  );
}
