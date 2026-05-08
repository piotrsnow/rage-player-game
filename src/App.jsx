import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import RequireAuth from './components/ui/RequireAuth';
import LoadingSpinner from './components/ui/LoadingSpinner';

const LobbyPage = lazy(() => import('./components/lobby/LobbyPage'));
const CampaignCreatorPage = lazy(() => import('./components/creator/CampaignCreatorPage'));
const GameplayPage = lazy(() => import('./components/gameplay/GameplayPage'));
const JoinRoomPage = lazy(() => import('./components/multiplayer/JoinRoomPage'));
const GalleryPage = lazy(() => import('./components/gallery/GalleryPage'));
const CampaignViewerPage = lazy(() => import('./components/viewer/CampaignViewerPage'));

function RouteFallback() {
  return (
    <div className="flex items-center justify-center min-h-[calc(100dvh-4rem)] select-none cursor-default">
      <LoadingSpinner size="lg" text="Mistrz Gry właśnie siada do stołu..." />
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
          path="/view/:shareToken"
          element={
            <Suspense fallback={<RouteFallback />}>
              <CampaignViewerPage />
            </Suspense>
          }
        />

        <Route element={<RequireAuth />}>
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
        </Route>
      </Route>
    </Routes>
  );
}
