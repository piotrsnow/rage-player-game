export class CreatorPage {
  constructor(page) {
    this.page = page;
  }

  async goto() {
    await this.page.goto('/create');
  }

  // Genre/Tone/Style/Difficulty/Length chip selectors
  genreChip(value) { return this.page.locator(`[data-testid="chip-genre-${value}"]`); }
  toneChip(value) { return this.page.locator(`[data-testid="chip-tone-${value}"]`); }
  styleChip(value) { return this.page.locator(`[data-testid="chip-style-${value}"]`); }
  difficultyChip(value) { return this.page.locator(`[data-testid="chip-difficulty-${value}"]`); }
  lengthChip(value) { return this.page.locator(`[data-testid="chip-length-${value}"]`); }

  // Story prompt
  get storyPromptInput() { return this.page.locator('[data-testid="story-prompt"]'); }
  get randomizeButton() { return this.page.getByRole('button', { name: /randomize|losuj/i }); }

  // Character section
  get createCharacterButton() { return this.page.getByRole('button', { name: /create character|stwórz postać/i }); }

  // Campaign generation
  get startCampaignButton() { return this.page.locator('[data-testid="start-campaign"]'); }

  // Multiplayer
  get multiplayerButton() { return this.page.getByRole('button', { name: /multiplayer|wieloosobowa/i }); }

  async selectGenre(genre) {
    await this.genreChip(genre).click();
  }

  async selectTone(tone) {
    await this.toneChip(tone).click();
  }

  async selectDifficulty(difficulty) {
    await this.difficultyChip(difficulty).click();
  }

  async fillStoryPrompt(text) {
    await this.storyPromptInput.fill(text);
  }
}
