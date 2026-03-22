import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '0.0.0.0',

  databaseUrl: process.env.DATABASE_URL || 'file:./dev.db',

  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: '7d',

  mediaBackend: process.env.MEDIA_BACKEND || 'local',
  mediaLocalPath: process.env.MEDIA_LOCAL_PATH || './media',

  gcsBucketName: process.env.GCS_BUCKET_NAME || '',
  googleApplicationCredentials: process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
  gcpServiceAccountKey: process.env.GCP_SERVICE_ACCOUNT_KEY || '',

  apiKeys: {
    openai: process.env.OPENAI_API_KEY || '',
    anthropic: process.env.ANTHROPIC_API_KEY || '',
    elevenlabs: process.env.ELEVENLABS_API_KEY || '',
    stability: process.env.STABILITY_API_KEY || '',
    suno: process.env.SUNO_API_KEY || '',
  },

  apiKeyEncryptionSecret: process.env.API_KEY_ENCRYPTION_SECRET || 'dev-encryption-key-change-me!!!',

  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
};
