import { readdir, readFile, stat } from 'fs/promises';
import { resolve, join, extname } from 'path';
import { config } from '../config.js';
import { createMediaStore } from '../services/mediaStore.js';

const MUSIC_ROOT = resolve('public/music');
const ALLOWED_FOLDERS = new Set(['lobby']);
const GCS_MUSIC_PREFIX = 'music/';

function resolveMusicDir(folder) {
  if (folder && ALLOWED_FOLDERS.has(folder)) {
    return join(MUSIC_ROOT, folder);
  }
  return MUSIC_ROOT;
}

function gcsMusicPath(folder, filename) {
  const prefix = folder && ALLOWED_FOLDERS.has(folder) ? `${folder}/` : '';
  return `${GCS_MUSIC_PREFIX}${prefix}${filename}`;
}

async function localTracks(folder) {
  const musicDir = resolveMusicDir(folder);
  const folderParam = folder && ALLOWED_FOLDERS.has(folder) ? `?folder=${folder}` : '';

  try {
    const files = await readdir(musicDir);
    const mp3Files = files.filter(f => extname(f).toLowerCase() === '.mp3');

    return Promise.all(
      mp3Files.map(async (filename) => {
        const filePath = join(musicDir, filename);
        const info = await stat(filePath);
        const name = filename.replace(/\.mp3$/i, '').replace(/[-_]/g, ' ');
        return {
          filename,
          name,
          size: info.size,
          url: `/music/play/${encodeURIComponent(filename)}${folderParam}`,
        };
      })
    );
  } catch {
    return [];
  }
}

async function gcsTracks(store, folder) {
  try {
    const prefix = folder && ALLOWED_FOLDERS.has(folder)
      ? `${GCS_MUSIC_PREFIX}${folder}/`
      : GCS_MUSIC_PREFIX;

    const [files] = await store.bucket.getFiles({ prefix });
    const mp3Files = files.filter(f => extname(f.name).toLowerCase() === '.mp3');

    return Promise.all(
      mp3Files.map(async (file) => {
        const filename = file.name.split('/').pop();
        const name = filename.replace(/\.mp3$/i, '').replace(/[-_]/g, ' ');
        const [metadata] = await file.getMetadata();
        const folderParam = folder && ALLOWED_FOLDERS.has(folder) ? `?folder=${folder}` : '';
        return {
          filename,
          name,
          size: parseInt(metadata.size || '0', 10),
          url: `/music/play/${encodeURIComponent(filename)}${folderParam}`,
        };
      })
    );
  } catch {
    return [];
  }
}

export async function musicRoutes(fastify) {
  const useGcs = config.mediaBackend === 'gcp' && config.gcsBucketName;
  const store = useGcs ? createMediaStore(config) : null;

  fastify.get('/tracks', async (request) => {
    const folder = request.query.folder || '';

    if (useGcs) {
      return { tracks: await gcsTracks(store, folder) };
    }
    return { tracks: await localTracks(folder) };
  });

  fastify.get('/play/:filename', async (request, reply) => {
    const { filename } = request.params;
    const folder = request.query.folder || '';

    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return reply.code(400).send({ error: 'Invalid filename' });
    }

    if (useGcs) {
      const storagePath = gcsMusicPath(folder, filename);
      const result = await store.get(storagePath);
      if (!result) return reply.code(404).send({ error: 'Track not found' });
      reply.header('Content-Type', 'audio/mpeg');
      reply.header('Cache-Control', 'public, max-age=604800');
      return reply.send(result.buffer);
    }

    const musicDir = resolveMusicDir(folder);
    const filePath = join(musicDir, filename);

    try {
      const buffer = await readFile(filePath);
      reply.header('Content-Type', 'audio/mpeg');
      reply.header('Cache-Control', 'public, max-age=604800');
      reply.header('Accept-Ranges', 'bytes');
      return reply.send(buffer);
    } catch {
      return reply.code(404).send({ error: 'Track not found' });
    }
  });
}
