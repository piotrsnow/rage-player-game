import { LocalStore } from './localStore.js';
import { GcpStore } from './gcpStore.js';

export function createMediaStore(config) {
  if (config.mediaBackend === 'gcp') {
    if (!config.gcsBucketName) {
      throw new Error('GCS_BUCKET_NAME is required when MEDIA_BACKEND=gcp');
    }
    return new GcpStore({
      bucketName: config.gcsBucketName,
      credentials: config.googleApplicationCredentials,
      serviceAccountKey: config.gcpServiceAccountKey,
    });
  }

  return new LocalStore(config.mediaLocalPath);
}
