import { readdir, readFile, stat } from 'fs/promises';
import { resolve, join, extname } from 'path';

const MUSIC_ROOT = resolve('public/music');

const ALLOWED_FOLDERS = new Set(['lobby']);

function resolveMusicDir(folder) {
  if (folder && ALLOWED_FOLDERS.has(folder)) {
    return join(MUSIC_ROOT, folder);
  }
  return MUSIC_ROOT;
}

export async function musicRoutes(fastify) {
  fastify.get('/tracks', async (request) => {
    const folder = request.query.folder || '';
    const musicDir = resolveMusicDir(folder);
    const folderParam = folder && ALLOWED_FOLDERS.has(folder) ? `?folder=${folder}` : '';

    try {
      const files = await readdir(musicDir);
      const mp3Files = files.filter(f => extname(f).toLowerCase() === '.mp3');

      const tracks = await Promise.all(
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

      return { tracks };
    } catch {
      return { tracks: [] };
    }
  });

  fastify.get('/play/:filename', async (request, reply) => {
    const { filename } = request.params;
    const folder = request.query.folder || '';

    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return reply.code(400).send({ error: 'Invalid filename' });
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
