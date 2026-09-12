import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, mkdtemp, mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { FetchHttpHandler } from '@smithy/fetch-http-handler';
import { CreateBucketCommand, GetBucketVersioningCommand, GetObjectLockConfigurationCommand, GetPublicAccessBlockCommand, ListBucketsCommand, PutBucketPolicyCommand, PutPublicAccessBlockCommand, S3Client } from '@aws-sdk/client-s3';

assert.equal(process.env.FREE_CRM_S3_QA, 'synthetic-disposable', 'Explicit synthetic-disposable acknowledgement required. Never run against an existing bucket.');
assert.equal(process.platform, 'win32', 'This pinned evaluation harness is Windows-only; do not substitute an unverified executable.');
const directory = new URL('../outputs/s3-evaluation/', import.meta.url); await mkdir(directory, { recursive: true });
const zip = await readFile(new URL('rustfs-windows-x86_64-v1.0.0-rc.6.zip', directory));
assert.equal(zip.byteLength, 101397387); assert.equal(createHash('sha256').update(zip).digest('hex'), 'e9f4ad57ea8596a41d0e5879c565784021663ecca32c40e69527cf575f107f97');
const executable = fileURLToPath(new URL('bin/rustfs.exe', directory));
const executableHash = createHash('sha256');
for await (const chunk of createReadStream(executable)) executableHash.update(chunk);
// Computed from rustfs.exe inside the above verified official archive.
assert.equal(executableHash.digest('hex'), '3e1d300a15bfb6cb91c42a80816c49a668800c1702738fad0f3c29f23cd766f0');
const dataPath = await mkdtemp(fileURLToPath(new URL('data-', directory)));
const reservation = createServer(); await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port; await new Promise((resolve) => reservation.close(resolve));
const credentials = { accessKeyId: randomBytes(16).toString('hex'), secretAccessKey: randomBytes(32).toString('hex') };
const server = spawn(executable, ['server', '--address', `127.0.0.1:${port}`, '--console-address', '127.0.0.1:19384', '--region', 'us-east-1', dataPath], {
  windowsHide: true, stdio: 'ignore', env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP, RUSTFS_ACCESS_KEY: credentials.accessKeyId, RUSTFS_SECRET_KEY: credentials.secretAccessKey, RUSTFS_CONSOLE_ENABLE: 'false', RUSTFS_OBS_ENDPOINT: '' },
});
const endpoint = `http://127.0.0.1:${port}`; const Bucket = 'synthetic-private-conformance';
const stopOwnedServer = () => { server.kill(); };
process.once('SIGINT', stopOwnedServer); process.once('SIGTERM', stopOwnedServer);
const client = new S3Client({ endpoint, region: 'us-east-1', credentials, forcePathStyle: true, maxAttempts: 1, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED', requestHandler: new FetchHttpHandler({ requestTimeout: 5000 }) });
let worker;
try {
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) { try { await client.send(new ListBucketsCommand({})); ready = true; break; } catch { if (server.exitCode !== null) break; await new Promise((resolve) => setTimeout(resolve, 500)); } }
  assert.ok(ready, 'Pinned RustFS failed the bounded startup gate.');
  console.log(`Disposable RustFS evaluation started on literal loopback; PID ${server.pid}.`);
  await client.send(new CreateBucketCommand({ Bucket }));
  console.log('Created disposable private test bucket.');
  const flags = { BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: true, RestrictPublicBuckets: true };
  await client.send(new PutPublicAccessBlockCommand({ Bucket, PublicAccessBlockConfiguration: flags }));
  console.log('Configured the four public-access blocks for disposable test bucket.');
  assert.deepEqual((await client.send(new GetPublicAccessBlockCommand({ Bucket }))).PublicAccessBlockConfiguration, flags);
  assert.equal((await client.send(new GetBucketVersioningCommand({ Bucket }))).Status, undefined);
  await assert.rejects(client.send(new GetObjectLockConfigurationCommand({ Bucket })), (error) => error.name === 'ObjectLockConfigurationNotFoundError' && error.$metadata?.httpStatusCode === 404);
  await assert.rejects(client.send(new PutBucketPolicyCommand({ Bucket, Policy: JSON.stringify({ Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: '*', Action: 's3:GetObject', Resource: `arn:aws:s3:::${Bucket}/*` }] }) })), (error) => error.$metadata?.httpStatusCode === 403);
  console.log('Verified bucket safety and rejected public policy.');

  const nodeOutput = fileURLToPath(new URL('node-adapter.cjs', directory));
  await build({ entryPoints: ['server/s3-storage.ts'], outfile: nodeOutput, bundle: true, platform: 'node', format: 'cjs', alias: { 'cloudflare:workers': fileURLToPath(new URL('../tests/cloudflare-workers-stub.ts', import.meta.url)) }, logLevel: 'silent' });
  const { S3TenantObjectStorage } = await import(new URL('node-adapter.cjs', directory).href);
  const config = { provider: 's3', endpoint, region: 'us-east-1', bucket: Bucket, credentials, maxBytes: 10 * 1024 * 1024 };
  const storage = new S3TenantObjectStorage(config);
  const options = { contentType: 'text/plain', contentDisposition: 'attachment; filename="synthetic.txt"', metadata: { recordId: 'synthetic-record' } };
  const key = 'tenant-a/~epoch/00000000000000000001/record-a/blob';
  const bytes = new TextEncoder().encode('Synthetic private S3 content');
  await storage.put('tenant-a', key, bytes.buffer, options);
  await storage.put('tenant-a', key, bytes.buffer, options); // exact conditional conflict recovery
  const retrieved = await storage.get('tenant-a', key); assert.ok(retrieved);
  assert.equal(await new Response(retrieved.body).text(), 'Synthetic private S3 content');
  await assert.rejects(storage.put('tenant-a', key, new TextEncoder().encode('Different bytes').buffer, options));
  const anonymous = await fetch(`${endpoint}/${Bucket}/${key}`); assert.equal(anonymous.status, 403); await anonymous.body?.cancel();
  assert.equal(await storage.get('tenant-b', key), null);
  const current = 'tenant-a/~epoch/00000000000000000002/record-b/blob';
  await storage.put('tenant-a', current, bytes.buffer, options);
  assert.deepEqual(await storage.deleteWorkspacePage('tenant-a', 2), { deleted: 1, complete: true });
  assert.equal(await storage.get('tenant-a', key), null); assert.ok(await storage.get('tenant-a', current));
  await storage.deleteMany('tenant-a', [current]); assert.equal(await storage.get('tenant-a', current), null);
  await storage.delete('tenant-a', current); // missing delete remains idempotent
  await assert.rejects(storage.put('tenant-a', key, new ArrayBuffer(config.maxBytes + 1), options), (error) => error.code === 'storage_size_limit');

  const workerOutput = fileURLToPath(new URL('worker-adapter.mjs', directory));
  await build({ entryPoints: ['scripts/s3-runtime-probe.ts'], outfile: workerOutput, bundle: true, platform: 'neutral', mainFields: ['module', 'main'], format: 'esm', external: ['cloudflare:workers', 'node:*'], alias: { crypto: 'node:crypto' }, conditions: ['workerd', 'worker', 'module', 'import'], logLevel: 'silent' });
  const nonce = randomBytes(24).toString('hex');
  const s3AccessKeyId = credentials.accessKeyId; const s3SecretAccessKey = credentials.secretAccessKey;
  const { Miniflare, convertV4MiniflareOptions } = await import('miniflare');
  worker = new Miniflare(convertV4MiniflareOptions({ host: '127.0.0.1', port: 0, workers: [{ name: 'synthetic-s3', scriptPath: workerOutput, modules: true, compatibilityDate: '2026-08-30', compatibilityFlags: ['nodejs_compat'], bindings: {
    FREE_CRM_OBJECT_STORAGE: 's3', FREE_CRM_S3_ENDPOINT: endpoint, FREE_CRM_S3_REGION: 'us-east-1', FREE_CRM_S3_BUCKET: Bucket,
    FREE_CRM_S3_ACCESS_KEY_ID: s3AccessKeyId, FREE_CRM_S3_SECRET_ACCESS_KEY: s3SecretAccessKey,
    FREE_CRM_S3_ALLOW_LOOPBACK: 'true', FREE_CRM_LOCAL_MODE: 'true', S3_TEST_NONCE: nonce,
  } }] }));
  const result = await worker.dispatchFetch('http://127.0.0.1/test', { method: 'POST', headers: { 'x-synthetic-test-nonce': nonce } });
  const resultBody = await result.json();
  assert.equal(result.status, 200, `Worker probe failed: ${JSON.stringify(resultBody)}`); assert.deepEqual(resultBody, { runtime: 'workerd', provider: 'private S3-compatible storage', exactContent: true, deleted: true, defaultBindingRequired: false });
  console.log('Real S3 conformance passed in Node and workerd: private configuration, public-policy rejection, anonymous known-object denial, tenant isolation, conditional exact-SHA recovery, bounds, old-epoch cleanup, current-epoch preservation, delete and missing behavior. No default R2 or Blob credential was required.');
} finally {
  try { await worker?.dispose(); } finally {
    client.destroy(); server.kill();
    if (server.exitCode === null) await new Promise((resolve) => server.once('exit', resolve));
    process.removeListener('SIGINT', stopOwnedServer); process.removeListener('SIGTERM', stopOwnedServer);
    console.log(`Stopped exact owned RustFS PID ${server.pid}; disposable data retained at ${dataPath}. Random credentials were process-only and are not retained.`);
  }
}
