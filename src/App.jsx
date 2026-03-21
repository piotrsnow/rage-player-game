import { Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import LobbyPage from './components/lobby/LobbyPage';
import CampaignCreatorPage from './components/creator/CampaignCreatorPage';
import GameplayPage from './components/gameplay/GameplayPage';
import CharacterSheet from './components/character/CharacterSheet';
import DMSettingsPage from './components/settings/DMSettingsPage';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<LobbyPage />} />
        <Route path="/create" element={<CampaignCreatorPage />} />
        <Route path="/play" element={<GameplayPage />} />
        <Route path="/character" element={<CharacterSheet />} />
        <Route path="/settings" element={<DMSettingsPage />} />
      </Route>
    </Routes>
  );
}
