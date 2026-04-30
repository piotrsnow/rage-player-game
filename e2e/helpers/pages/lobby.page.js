export class LobbyPage {
  constructor(page) {
    this.page = page;
  }

  async goto() {
    await this.page.goto('/');
  }

  // Auth panel
  get emailInput() { return this.page.locator('input[name="email"]'); }
  get passwordInput() { return this.page.locator('input[name="password"]'); }
  get serverUrlInput() { return this.page.locator('input[name="serverUrl"]'); }
  get loginButton() { return this.page.getByRole('button', { name: /login|zaloguj/i }); }
  get registerButton() { return this.page.getByRole('button', { name: /register|zarejestruj/i }); }
  get logoutButton() { return this.page.getByRole('button', { name: /log out|wyloguj/i }); }
  get authError() { return this.page.locator('[data-testid="auth-error"]'); }
  get authSuccess() { return this.page.locator('[data-testid="auth-success"]'); }

  // Action buttons
  get newCampaignButton() { return this.page.getByRole('button', { name: /new campaign|nowa kampania/i }); }
  get continueCampaignButton() { return this.page.getByRole('button', { name: /continue|kontynuuj/i }); }

  // Campaign list
  get campaignCards() { return this.page.locator('[data-testid="campaign-card"]'); }
  get savedCampaignsSection() { return this.page.locator('[data-testid="saved-campaigns"]'); }

  // Rejoin banner
  get rejoinBanner() { return this.page.locator('[data-testid="rejoin-banner"]'); }
  get rejoinButton() { return this.page.getByRole('button', { name: /rejoin|dołącz ponownie/i }); }
  get dismissRejoinButton() { return this.page.getByRole('button', { name: /dismiss|odrzuć/i }); }

  // API key warning
  get apiKeyWarning() { return this.page.locator('[data-testid="api-key-warning"]'); }

  // Character choice modal
  // The modal only appears when the library version meaningfully differs from
  // the campaign-embedded character. Otherwise the campaign version loads
  // directly without a prompt.
  get characterChoiceModal() { return this.page.locator('[data-testid="character-choice-modal"]'); }
  get useCampaignCharButton() { return this.page.getByRole('button', { name: /use campaign version|użyj z kampanii/i }); }
  get useLibraryCharButton() { return this.page.locator('[data-testid="character-choice-switch-library"]'); }

  // Logged-in banner
  get loggedInBanner() { return this.page.locator('[data-testid="logged-in-banner"]'); }

  async login(email, password) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }

  async register(email, password) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.registerButton.click();
  }

  async waitForLoggedIn() {
    await this.loggedInBanner.waitFor({ state: 'visible', timeout: 10_000 });
  }

  async getCampaignCount() {
    return this.campaignCards.count();
  }
}
