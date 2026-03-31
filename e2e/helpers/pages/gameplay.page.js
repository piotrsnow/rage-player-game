export class GameplayPage {
  constructor(page) {
    this.page = page;
  }

  async goto(campaignId) {
    const path = campaignId ? `/play/${campaignId}` : '/play';
    await this.page.goto(path);
  }

  // Scene panel
  get scenePanel() { return this.page.locator('[data-testid="scene-panel"]'); }
  get sceneNarrative() { return this.page.locator('[data-testid="scene-narrative"]'); }

  // Action panel
  get actionInput() { return this.page.locator('[data-testid="action-input"]'); }
  get submitActionButton() { return this.page.locator('[data-testid="submit-action"]'); }
  get suggestedActions() { return this.page.locator('[data-testid="suggested-action"]'); }

  // Chat panel
  get chatMessages() { return this.page.locator('[data-testid="chat-message"]'); }
  get chatPanel() { return this.page.locator('[data-testid="chat-panel"]'); }

  // Scene generation progress
  get sceneGenerating() { return this.page.locator('[data-testid="scene-generating"]'); }

  // Panels/modals
  get characterSheet() { return this.page.locator('[data-testid="character-sheet"]'); }
  get combatPanel() { return this.page.locator('[data-testid="combat-panel"]'); }
  get questLog() { return this.page.locator('[data-testid="quest-log"]'); }

  async typeAction(text) {
    await this.actionInput.fill(text);
  }

  async submitAction(text) {
    await this.typeAction(text);
    await this.submitActionButton.click();
  }

  async clickSuggestedAction(index) {
    await this.suggestedActions.nth(index).click();
  }

  async waitForSceneGeneration() {
    // Wait for generation to start then finish
    await this.sceneGenerating.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
    await this.sceneGenerating.waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});
  }
}
