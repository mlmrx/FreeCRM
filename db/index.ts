import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export function getD1(): D1Database {
  if (!env.DB) {
    throw new Error('Cloudflare D1 binding `DB` is unavailable.');
  }
  return env.DB;
}

export function getFiles(): R2Bucket {
  if (!env.FILES) {
    throw new Error('Cloudflare R2 binding `FILES` is unavailable.');
  }
  return env.FILES;
}

export function getDb() {
  return drizzle(getD1(), { schema });
}
