import { prisma } from '../../lib/prisma.js';
import { resolveApiKey } from '../../services/apiKeyService.js';
import { generateKey } from '../../services/hashService.js';
import { createMediaStore } from '../../services/mediaStore.js';
import { config } from '../../config.js';

const store = createMediaStore(config);
const ELEVENLABS_URL = 'https://api.elevenlabs.io/v1';

export async function elevenlabsProxyRoutes(fastify) {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.get('/voices', async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { apiKeys: true },
    });
    const apiKey = resolveApiKey(user?.apiKeys || '{}', 'elevenlabs');
    if (!apiKey) return reply.code(400).send({ error: 'ElevenLabs API key not configured' });

    const response = await fetch(`${ELEVENLABS_URL}/voices`, {
      headers: { 'xi-api-key': apiKey },
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return reply.code(response.status).send({
        error: err.detail?.message || `ElevenLabs API error: ${response.status}`,
      });
    }

    return response.json();
  });

  fastify.post('/tts', async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { apiKeys: true },
    });
    const apiKey = resolveApiKey(user?.apiKeys || '{}', 'elevenlabs');
    if (!apiKey) return reply.code(400).send({ error: 'ElevenLabs API key not configured' });

    const { voiceId, text, modelId } = request.body;

    const cacheParams = { voiceId, text, modelId: modelId || 'eleven_multilingual_v2' };
    const cacheKey = generateKey('tts', cacheParams);

    const existing = await prisma.mediaAsset.findUnique({ where: { key: cacheKey } });
    if (existing) {
      const url = await store.getUrl(existing.path);
      const meta = JSON.parse(existing.metadata);
      return { cached: true, url, key: cacheKey, alignment: meta.alignment || null };
    }

    const response = await fetch(`${ELEVENLABS_URL}/text-to-speech/${voiceId}/with-timestamps`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: modelId || 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
        output_format: 'mp3_44100_128',
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return reply.code(response.status).send({
        error: err.detail?.message || `ElevenLabs TTS error: ${response.status}`,
      });
    }

    const data = await response.json();

    const audioBytes = Buffer.from(data.audio_base64, 'base64');
    const storeResult = await store.put(cacheKey, audioBytes, 'audio/mpeg');

    await prisma.mediaAsset.create({
      data: {
        userId: request.user.id,
        key: cacheKey,
        type: 'tts',
        contentType: 'audio/mpeg',
        size: audioBytes.length,
        backend: config.mediaBackend,
        path: cacheKey,
        metadata: JSON.stringify({ ...cacheParams, alignment: data.alignment }),
      },
    });

    return {
      cached: false,
      url: storeResult.url,
      key: cacheKey,
      alignment: data.alignment,
    };
  });

  fastify.post('/tts-stream', async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { apiKeys: true },
    });
    const apiKey = resolveApiKey(user?.apiKeys || '{}', 'elevenlabs');
    if (!apiKey) return reply.code(400).send({ error: 'ElevenLabs API key not configured' });

    const { voiceId, text, modelId } = request.body;

    const cacheParams = { voiceId, text, modelId: modelId || 'eleven_multilingual_v2', stream: true };
    const cacheKey = generateKey('tts', cacheParams);

    const existing = await prisma.mediaAsset.findUnique({ where: { key: cacheKey } });
    if (existing) {
      const url = await store.getUrl(existing.path);
      return { cached: true, url, key: cacheKey };
    }

    const response = await fetch(`${ELEVENLABS_URL}/text-to-speech/${voiceId}/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: modelId || 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
        output_format: 'mp3_44100_128',
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return reply.code(response.status).send({
        error: err.detail?.message || `ElevenLabs TTS error: ${response.status}`,
      });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const storeResult = await store.put(cacheKey, buffer, 'audio/mpeg');

    await prisma.mediaAsset.create({
      data: {
        userId: request.user.id,
        key: cacheKey,
        type: 'tts',
        contentType: 'audio/mpeg',
        size: buffer.length,
        backend: config.mediaBackend,
        path: cacheKey,
        metadata: JSON.stringify(cacheParams),
      },
    });

    return { cached: false, url: storeResult.url, key: cacheKey };
  });

  fastify.post('/sfx', async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { apiKeys: true },
    });
    const apiKey = resolveApiKey(user?.apiKeys || '{}', 'elevenlabs');
    if (!apiKey) return reply.code(400).send({ error: 'ElevenLabs API key not configured' });

    const { text, durationSeconds } = request.body;

    const cacheParams = { text, durationSeconds: durationSeconds || 4 };
    const cacheKey = generateKey('sfx', cacheParams);

    const existing = await prisma.mediaAsset.findUnique({ where: { key: cacheKey } });
    if (existing) {
      const url = await store.getUrl(existing.path);
      return { cached: true, url, key: cacheKey };
    }

    const response = await fetch(`${ELEVENLABS_URL}/sound-generation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        duration_seconds: durationSeconds || 4,
        prompt_influence: 0.3,
        output_format: 'mp3_44100_128',
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return reply.code(response.status).send({
        error: err.detail?.message || `ElevenLabs SFX error: ${response.status}`,
      });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const storeResult = await store.put(cacheKey, buffer, 'audio/mpeg');

    await prisma.mediaAsset.create({
      data: {
        userId: request.user.id,
        key: cacheKey,
        type: 'sfx',
        contentType: 'audio/mpeg',
        size: buffer.length,
        backend: config.mediaBackend,
        path: cacheKey,
        metadata: JSON.stringify(cacheParams),
      },
    });

    return { cached: false, url: storeResult.url, key: cacheKey };
  });
}
