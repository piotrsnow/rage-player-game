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

  // Cloud Run / Cloud Tasks — used for post-scene async work dispatch.
  // CLOUD_TASKS_ENABLED=false → inline fire-and-forget fallback (local dev).
  gcpProjectId: process.env.GCP_PROJECT_ID || '',
  gcpRegion: process.env.GCP_REGION || 'europe-west1',
  cloudTasksEnabled: process.env.CLOUD_TASKS_ENABLED === 'true',
  // Cloud Run service URL — needed for Cloud Tasks callback. Set once after first deploy:
  //   gcloud run services describe rage-player-game --region europe-west1 --format 'value(status.url)'
  selfUrl: process.env.SELF_URL || '',
  runtimeServiceAccount: process.env.RUNTIME_SERVICE_ACCOUNT || '',

  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  // Model tiering — premium for scene/campaign generation, standard for
  // compression/recaps/combat commentary, nano for intent classification +
  // fact extraction. Override via env vars for staging/dev without editing
  // code. See CLAUDE.md "AI Architecture — Two-Stage Pipeline".
  //
  // Anthropic premium is Sonnet 4.0 (sonnet-4-20250514) instead of 4.6
  // because 4.6 is ~2x more verbose for the same structured JSON output
  // at identical per-token pricing — effectively 2x the cost per request
  // with marginal quality gains for our schema-driven prompts. Flip to
  // `claude-sonnet-4-6` via AI_MODEL_PREMIUM_ANTHROPIC if a specific
  // quality issue actually justifies the cost hit.
  aiModels: {
    premium: {
      openai: process.env.AI_MODEL_PREMIUM_OPENAI || 'gpt-5.4',
      anthropic: process.env.AI_MODEL_PREMIUM_ANTHROPIC || 'claude-sonnet-4-20250514',
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
