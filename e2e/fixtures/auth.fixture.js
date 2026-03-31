import { test as base, mergeTests } from '@playwright/test';
import { test as mockTest } from './api-mocks.fixture.js';
import { LobbyPage } from '../helpers/pages/lobby.page.js';
import { CreatorPage } from '../helpers/pages/creator.page.js';
import { GameplayPage } from '../helpers/pages/gameplay.page.js';
import { JoinRoomPage } from '../helpers/pages/join-room.page.js';
import { GalleryPage } from '../helpers/pages/gallery.page.js';

/** Base test with page objects (no auth) */
export const test = base.extend({
  lobbyPage: async ({ page }, use) => {
    await use(new LobbyPage(page));
  },
  creatorPage: async ({ page }, use) => {
    await use(new CreatorPage(page));
  },
  gameplayPage: async ({ page }, use) => {
    await use(new GameplayPage(page));
  },
  joinRoomPage: async ({ page }, use) => {
    await use(new JoinRoomPage(page));
  },
  galleryPage: async ({ page }, use) => {
    await use(new GalleryPage(page));
  },
});

/** Authenticated test with page objects */
export const authenticatedTest = test.extend({
  storageState: './e2e/.auth/user.json',
});

/** Authenticated test with page objects + AI mocking */
export const fullTest = mergeTests(authenticatedTest, mockTest);
