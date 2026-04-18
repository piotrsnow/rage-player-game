import { Storage } from '@google-cloud/storage';

export class GcpStore {
  constructor({ bucketName, credentials, serviceAccountKey }) {
    const options = {};
    if (serviceAccountKey) {
      options.credentials = JSON.parse(serviceAccountKey);
    } else if (credentials) {
      options.keyFilename = credentials;
    }

    this.storage = new Storage(options);
    this.bucket = this.storage.bucket(bucketName);
    this.bucketName = bucketName;
  }

  async put(storagePath, buffer, contentType) {
    const file = this.bucket.file(storagePath);
    await file.save(buffer, {
      contentType,
      resumable: false,
      metadata: { cacheControl: 'public, max-age=86400' },
    });

    return { url: `/v1/media/file/${storagePath}`, path: storagePath, size: buffer.length };
  }

  async get(storagePath) {
    try {
      const file = this.bucket.file(storagePath);
      const [buffer] = await file.download();
      return { buffer };
    } catch {
      return null;
    }
  }

  async getUrl(storagePath) {
    return `/v1/media/file/${storagePath}`;
  }

  async has(storagePath) {
    try {
      const file = this.bucket.file(storagePath);
      const [exists] = await file.exists();
      return exists;
    } catch {
      return false;
    }
  }

  async delete(storagePath) {
    try {
      await this.bucket.file(storagePath).delete();
    } catch {
      // File may not exist
    }
  }

  async getSize(storagePath) {
    try {
      const file = this.bucket.file(storagePath);
      const [metadata] = await file.getMetadata();
      return parseInt(metadata.size || '0', 10);
    } catch {
      return 0;
    }
  }
}
