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

      /**
       * Mocks the backend scene-stream SSE route. The frontend parser
       * (src/services/ai/service.js) reads `data: {...}\n\n` lines, ignoring
       * any `event: X` prefix, and completes on an event with `type:'complete'`
       * whose `data` contains the `scene` payload.
       */
      async interceptBackendSceneStream(sceneOverrides = {}) {
        const scene = {
          sceneIndex: 1,
          sceneId: 'mock-scene-aftermath',
          narrative: 'The aftermath of battle settles over the forest path.',
          dialogueSegments: [
            { type: 'narration', text: 'The aftermath of battle settles over the forest path.', character: '', gender: '' },
          ],
          suggestedActions: [
            'Przeszukuję zwłoki brygantów',
            'Opatruję rany',
            'Mówię: "Czas iść dalej."',
          ],
          scenePacing: 'exploration',
          atmosphere: { weather: 'clear', particles: 'none', mood: 'peaceful', lighting: 'natural', transition: 'fade' },
          stateChanges: { timeAdvance: { hoursElapsed: 0.25 }, journalEntries: [] },
          ...sceneOverrides,
        };
        const events = [
          { type: 'intent', data: { intent: 'explore' } },
          { type: 'context_ready', data: {} },
          { type: 'chunk', text: JSON.stringify({ narrative: scene.narrative }) },
          {
            type: 'complete',
            data: { scene, sceneIndex: scene.sceneIndex, sceneId: scene.sceneId },
          },
        ];
        const body = events.map((ev) => `data: ${JSON.stringify(ev)}\n\n`).join('');
        await page.route('**/ai/campaigns/*/generate-scene-stream', (route) => {
          return route.fulfill({
            status: 200,
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
              'X-Accel-Buffering': 'no',
            },
            body,
          });
        });
      },

      /**
       * Catch-all safety net: swallow backend AI routes that scene generation
       * might hit (combat commentary, recap, image gen) so a combat test doesn't
       * explode on an unexpected fetch. Only installed alongside the scene-stream
       * mock; keep use narrowly scoped.
       */
      async interceptBackendAiMisc() {
        await page.route('**/ai/generate-image**', (route) => route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ imageUrl: null }),
        }));
        await page.route('**/ai/generate-recap**', (route) => route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ recap: 'Mocked recap.' }),
        }));
        await page.route('**/ai/generate-combat-commentary**', (route) => route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ commentary: '' }),
        }));
      },
    };

    await use(mocks);
  },
});
