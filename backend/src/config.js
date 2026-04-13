import 'dotenv/config';

const WEAK_DEFAULTS = ['dev-secret-change-me', 'dev-encryption-key-change-me!!!'];

if (!process.env.JWT_SECRET || WEAK_DEFAULTS.includes(process.env.JWT_SECRET)) {
  throw new Error('FATAL: JWT_SECRET env var is missing or uses a weak default. Set a strong secret in .env before starting the server.');
}

if (!process.env.API_KEY_ENCRYPTION_SECRET || WEAK_DEFAULTS.includes(process.env.API_KEY_ENCRYPTION_SECRET)) {
  throw new Error('FATAL: API_KEY_ENCRYPTION_SECRET env var is missing or uses a weak default. Set a strong secret in .env before starting the server.');
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '0.0.0.0',

  databaseUrl: process.env.DATABASE_URL || 'mongodb://localhost:27017/rpgon',

  jwtSecret: process.env.JWT_SECRET,
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
    gemini: process.env.GEMINI_API_KEY || '',
    meshy: process.env.MESHY_API_KEY || '',
  },

  elevenlabsDefaultVoiceId: "HnELITaEvp7a0HOmfoBo",

  apiKeyEncryptionSecret: process.env.API_KEY_ENCRYPTION_SECRET,

  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  // Model tiering — premium for scene/campaign generation, standard for
  // compression/recaps/combat commentary, nano for intent classification +
  // fact extraction. Override via env vars for staging/dev without editing
  // code. See CLAUDE.md "AI Architecture — Two-Stage Pipeline".
  aiModels: {
    premium: {
      openai: process.env.AI_MODEL_PREMIUM_OPENAI || 'gpt-5.4',
      anthropic: process.env.AI_MODEL_PREMIUM_ANTHROPIC || 'claude-sonnet-4-6',
    },
    standard: {
      openai: process.env.AI_MODEL_STANDARD_OPENAI || 'gpt-5.4-mini',
      anthropic: process.env.AI_MODEL_STANDARD_ANTHROPIC || 'claude-haiku-4-5-20251001',
    },
    nano: {
      openai: process.env.AI_MODEL_NANO_OPENAI || 'gpt-5.4-nano',
      anthropic: process.env.AI_MODEL_NANO_ANTHROPIC || 'claude-haiku-4-5-20251001',
    },
  },
};
