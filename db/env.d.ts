declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    FILES: R2Bucket;
    FREE_CRM_LOCAL_MODE?: string;
    FREE_CRM_OBJECT_STORAGE?: string;
    FREE_CRM_S3_ENDPOINT?: string;
    FREE_CRM_S3_REGION?: string;
    FREE_CRM_S3_BUCKET?: string;
    FREE_CRM_S3_ACCESS_KEY_ID?: string;
    FREE_CRM_S3_SECRET_ACCESS_KEY?: string;
    FREE_CRM_S3_SESSION_TOKEN?: string;
    FREE_CRM_S3_ALLOW_LOOPBACK?: string;
    FREE_CRM_AUTH_MODE?: 'cloudflare-access' | 'authjs' | 'locked';
    FREE_CRM_ACCESS_TEAM_DOMAIN?: string;
    FREE_CRM_ACCESS_AUD?: string;
    FREE_CRM_OWNER_EMAIL?: string;
    FREE_CRM_OLLAMA_URL?: string;
    FREE_CRM_OLLAMA_CHAT_MODEL?: string;
    FREE_CRM_OLLAMA_EMBED_MODEL?: string;
  }
}
