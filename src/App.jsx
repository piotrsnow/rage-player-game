import { Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import LobbyPage from './components/lobby/LobbyPage';
import CampaignCreatorPage from './components/creator/CampaignCreatorPage';
import GameplayPage from './components/gameplay/GameplayPage';
import JoinRoomPage from './components/multiplayer/JoinRoomPage';
import GalleryPage from './components/gallery/GalleryPage';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<LobbyPage />} />
        <Route path="/create" element={<CampaignCreatorPage />} />
        <Route path="/play" element={<GameplayPage />} />
        <Route path="/join/:code?" element={<JoinRoomPage />} />
        <Route path="/gallery" element={<GalleryPage />} />
      </Route>
    </Routes>
  );
}
