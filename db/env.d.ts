declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    FILES: R2Bucket;
    FREE_CRM_WEBHOOK_KEY?: string;
    FREE_CRM_LOCAL_MODE?: string;
  }
}
