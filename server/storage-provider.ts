import { env } from 'cloudflare:workers';
import { getFiles } from '@/db';
import { R2TenantObjectStorage, type TenantObjectStorage } from './object-storage';
import { S3TenantObjectStorage } from './s3-storage';
import { storageConfiguration } from './storage-config';

/** Lazy default binding access is essential: opting into S3 requires no R2/Blob token. */
export function getObjectStorage(): TenantObjectStorage {
  const config = storageConfiguration(env, Boolean(process.env.VERCEL));
  return config.provider === 's3' ? new S3TenantObjectStorage(config) : new R2TenantObjectStorage(getFiles());
}
export async function assertObjectStorageReady(): Promise<void> {
  const config = storageConfiguration(env, Boolean(process.env.VERCEL));
  if (config.provider === 's3') await new S3TenantObjectStorage(config).assertReady();
  else await getFiles().head('__free_crm_readiness_probe__');
}
export function objectStorageLabel(runtime: 'device' | 'authjs' | 'cloudflare-access' | 'scheduled-service'): string {
  if (storageConfiguration(env, Boolean(process.env.VERCEL)).provider === 's3') return 'private S3-compatible storage';
  return runtime === 'authjs' ? 'private Vercel Blob' : 'R2';
}
