import { test as base } from '@playwright/test';
import {
  mockSceneResponse,
  mockCampaignCreationResponse,
  mockStoryPromptResponse,
  mockImageGenerationResponse,
  mockRecapResponse,
  wrapAsOpenAIChatResponse,
  wrapAsAnthropicResponse,
} from '../helpers/mock-responses.js';

export const test = base.extend({
  mockAI: async ({ page }, use) => {
    const mocks = {
      /** Intercept all AI proxy routes with default mock responses */
      async interceptAll() {
        await page.route('**/proxy/openai/**', (route) => {
          const url = route.request().url();
          if (url.includes('/images')) {
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify(mockImageGenerationResponse()),
            });
          }
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(wrapAsOpenAIChatResponse(mockSceneResponse())),
          });
        });

        await page.route('**/proxy/anthropic/**', (route) => {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(wrapAsAnthropicResponse(mockSceneResponse())),
          });
        });

        await page.route('**/proxy/stability/**', (route) => {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockImageGenerationResponse()),
          });
        });

        await page.route('**/proxy/elevenlabs/**', (route) => {
          return route.fulfill({
            status: 200,
            contentType: 'application/octet-stream',
            body: Buffer.alloc(100),
          });
        });

        await page.route('**/proxy/gemini/**', (route) => {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(wrapAsOpenAIChatResponse(mockSceneResponse())),
          });
        });
      },

      /** Mock specifically for campaign creation flow */
      async interceptCampaignCreation() {
        await page.route('**/proxy/openai/**', (route) => {
          const url = route.request().url();
          if (url.includes('/images')) {
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify(mockImageGenerationResponse()),
            });
          }
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(wrapAsOpenAIChatResponse(mockCampaignCreationResponse())),
          });
        });

        await page.route('**/proxy/anthropic/**', (route) => {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(wrapAsAnthropicResponse(mockCampaignCreationResponse())),
          });
        });

        await page.route('**/proxy/stability/**', (route) => {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockImageGenerationResponse()),
          });
        });
      },

      /** Mock for story prompt generation */
      async interceptStoryPrompt() {
        await page.route('**/proxy/openai/**', (route) => {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(wrapAsOpenAIChatResponse(mockStoryPromptResponse())),
          });
        });
      },

      /** Mock AI returning an error */
      async interceptWithError(statusCode = 500) {
        await page.route('**/proxy/openai/**', (route) => {
          return route.fulfill({
            status: statusCode,
            contentType: 'application/json',
            body: JSON.stringify({ error: { message: 'Mock AI error' } }),
          });
        });
      },
    };

    await use(mocks);
  },
});
