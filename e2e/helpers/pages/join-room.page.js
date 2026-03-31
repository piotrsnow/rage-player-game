export class JoinRoomPage {
  constructor(page) {
    this.page = page;
  }

  async goto(code) {
    const path = code ? `/join/${code}` : '/join';
    await this.page.goto(path);
  }

  get roomCodeInput() { return this.page.locator('[data-testid="room-code-input"]'); }
  get joinButton() { return this.page.locator('[data-testid="join-room-button"]'); }
  get roomList() { return this.page.locator('[data-testid="room-list"]'); }
  get roomCards() { return this.page.locator('[data-testid="room-card"]'); }
  get refreshButton() { return this.page.locator('[data-testid="refresh-rooms"]'); }
  get errorMessage() { return this.page.locator('[data-testid="join-error"]'); }

  async joinWithCode(code) {
    await this.roomCodeInput.fill(code);
    await this.joinButton.click();
  }
}
