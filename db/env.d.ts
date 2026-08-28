declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    FILES: R2Bucket;
    FREE_CRM_WEBHOOK_KEY?: string;
    FREE_CRM_LOCAL_MODE?: string;
    FREE_CRM_AUTH_MODE?: 'sites' | 'cloudflare-access' | 'locked';
    FREE_CRM_ACCESS_TEAM_DOMAIN?: string;
    FREE_CRM_ACCESS_AUD?: string;
    FREE_CRM_OWNER_EMAIL?: string;
  }
}
