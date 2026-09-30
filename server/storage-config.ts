import { ApiError } from './request-context';

export type StorageEnvironment = {
  FREE_CRM_OBJECT_STORAGE?: string;
  FREE_CRM_S3_ENDPOINT?: string;
  FREE_CRM_S3_REGION?: string;
  FREE_CRM_S3_BUCKET?: string;
  FREE_CRM_S3_ACCESS_KEY_ID?: string;
  FREE_CRM_S3_SECRET_ACCESS_KEY?: string;
  FREE_CRM_S3_SESSION_TOKEN?: string;
  FREE_CRM_S3_ALLOW_LOOPBACK?: string;
  FREE_CRM_LOCAL_MODE?: string;
};
export type S3StorageConfiguration = { provider: 's3'; endpoint: string; region: string; bucket: string; credentials: { accessKeyId: string; secretAccessKey: string; sessionToken?: string }; maxBytes: number };
const invalid = () => new ApiError(503, 'storage_configuration_invalid', 'The selected object storage configuration is incomplete or unsupported. See the server-only S3 setup guide.');

/** Explicit, fail-closed selection. No credentials are sourced from SDK defaults. */
export function storageConfiguration(env: StorageEnvironment, vercel = false): { provider: 'default' } | S3StorageConfiguration {
  const provider = env.FREE_CRM_OBJECT_STORAGE;
  if (provider === undefined || provider === '' || provider === 'default') return { provider: 'default' };
  if (provider !== 's3') throw invalid();
  const { FREE_CRM_S3_ENDPOINT: endpoint, FREE_CRM_S3_REGION: region, FREE_CRM_S3_BUCKET: bucket, FREE_CRM_S3_ACCESS_KEY_ID: accessKeyId, FREE_CRM_S3_SECRET_ACCESS_KEY: secretAccessKey, FREE_CRM_S3_SESSION_TOKEN: sessionToken } = env;
  if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) throw invalid();
  if (![endpoint, region, bucket, accessKeyId, secretAccessKey, ...(sessionToken === undefined ? [] : [sessionToken])].every((value) => value.trim() === value && value.length > 0 && value.length <= 4096 && !/[\u0000-\u001f\u007f]/.test(value))) throw invalid();
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(region) || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) || bucket.includes('..') || /^\d+\.\d+\.\d+\.\d+$/.test(bucket) || /(?:--x-s3|-s3alias|--ol-s3|\.mrap|--table-s3)$/.test(bucket)) throw invalid();
  let url: URL; try { url = new URL(endpoint); } catch { throw invalid(); }
  const loopback = ['127.0.0.1', '[::1]'].includes(url.hostname);
  const localAllowed = env.FREE_CRM_S3_ALLOW_LOOPBACK === 'true' && env.FREE_CRM_LOCAL_MODE === 'true' && !vercel;
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.hostname.includes('s3express') || (loopback ? !localAllowed || !url.port || !['http:', 'https:'].includes(url.protocol) : url.protocol !== 'https:' || url.hostname === 'localhost')) throw invalid();
  if (env.FREE_CRM_S3_ALLOW_LOOPBACK !== undefined && !['true', 'false'].includes(env.FREE_CRM_S3_ALLOW_LOOPBACK)) throw invalid();
  return { provider: 's3', endpoint: url.origin, region, bucket, credentials: { accessKeyId, secretAccessKey, ...(sessionToken ? { sessionToken } : {}) }, maxBytes: (vercel ? 4 : 10) * 1024 * 1024 };
}
