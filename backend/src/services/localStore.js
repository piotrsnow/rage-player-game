import { mkdir, writeFile, readFile, unlink, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join, resolve } from 'path';

export class LocalStore {
  constructor(basePath) {
    this.basePath = resolve(basePath);
  }

  _fullPath(storagePath) {
    return join(this.basePath, storagePath);
  }

  async put(storagePath, buffer, contentType) {
    const fullPath = this._fullPath(storagePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, buffer);
    return {
      url: `/v1/media/file/${storagePath}`,
      path: storagePath,
      size: buffer.length,
    };
  }

  async get(storagePath) {
    const fullPath = this._fullPath(storagePath);
    try {
      const buffer = await readFile(fullPath);
      return { buffer };
    } catch {
      return null;
    }
  }

  async getUrl(storagePath) {
    return `/v1/media/file/${storagePath}`;
  }

  async has(storagePath) {
    return existsSync(this._fullPath(storagePath));
  }

  async delete(storagePath) {
    try {
      await unlink(this._fullPath(storagePath));
    } catch {
      // File may not exist
    }
  }

  async getSize(storagePath) {
    try {
      const s = await stat(this._fullPath(storagePath));
      return s.size;
    } catch {
      return 0;
    }
  }
}
