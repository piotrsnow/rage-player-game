import { test, expect } from '@playwright/test';
import { LobbyPage } from '../helpers/pages/lobby.page.js';
import { TEST_USER } from '../fixtures/test-data.js';

test.describe('Authentication', () => {
  let lobby;

  test.beforeEach(async ({ page }) => {
    lobby = new LobbyPage(page);
    await lobby.goto();
  });

  test('should show login form when not authenticated', async () => {
    await expect(lobby.emailInput).toBeVisible();
    await expect(lobby.passwordInput).toBeVisible();
    await expect(lobby.loginButton).toBeVisible();
    await expect(lobby.registerButton).toBeVisible();
  });

  test('should register a new user', async () => {
    const uniqueEmail = `e2e-reg-${Date.now()}@rpgon.test`;

    await lobby.register(uniqueEmail, 'SecurePass123!');

    // After successful registration, app auto-logs in → LoggedInBanner appears
    await expect(
      lobby.authSuccess.or(lobby.loggedInBanner)
    ).toBeVisible({ timeout: 10_000 });
  });

  test('should show error for duplicate email registration', async () => {
    // TEST_USER was registered in global setup
    await lobby.register(TEST_USER.email, TEST_USER.password);

    await expect(lobby.authError).toBeVisible({ timeout: 10_000 });
  });

  test('should show error for short password', async () => {
    await lobby.register('short-pass@rpgon.test', '12345');

    await expect(lobby.authError).toBeVisible({ timeout: 5_000 });
  });

  test('should login with valid credentials', async () => {
    await lobby.login(TEST_USER.email, TEST_USER.password);

    await lobby.waitForLoggedIn();
    await expect(lobby.loggedInBanner).toBeVisible();
  });

  test('should show error for invalid password', async () => {
    await lobby.login(TEST_USER.email, 'WrongPassword999');

    await expect(lobby.authError).toBeVisible({ timeout: 10_000 });
  });

  test('should persist session after reload', async () => {
    await lobby.login(TEST_USER.email, TEST_USER.password);
    await lobby.waitForLoggedIn();

    await lobby.page.reload();
    await lobby.waitForLoggedIn();
    await expect(lobby.loggedInBanner).toBeVisible();
  });

  test('should logout and clear auth token', async () => {
    await lobby.login(TEST_USER.email, TEST_USER.password);
    await lobby.waitForLoggedIn();

    await lobby.logoutButton.click();

    // Login form should reappear
    await expect(lobby.emailInput).toBeVisible({ timeout: 10_000 });
    await expect(lobby.loggedInBanner).not.toBeVisible();

    // Token should be removed from storage
    const token = await lobby.page.evaluate(() =>
      localStorage.getItem('nikczemny_krzemuch_auth_token')
    );
    expect(token).toBeFalsy();
  });
});
