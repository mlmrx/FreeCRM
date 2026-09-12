import { getObjectStorage, assertObjectStorageReady, objectStorageLabel } from '../server/storage-provider';
import { tenantEpochObjectKey } from '../server/object-storage';

// Built only by the opt-in local conformance script, never an application route.
const probe = {
  async fetch(request: Request, env: { S3_TEST_NONCE: string }) {
    if (request.method !== 'POST' || request.headers.get('x-synthetic-test-nonce') !== env.S3_TEST_NONCE) return new Response(null, { status: 403 });
    let phase = 'readiness';
    try {
      await assertObjectStorageReady(); const storage = getObjectStorage();
      const workspace = 'synthetic-worker'; const key = tenantEpochObjectKey(workspace, 1, 'fixture/blob');
      const body = new TextEncoder().encode('Synthetic Worker S3 integrity probe');
      phase = 'put'; await storage.put(workspace, key, body.buffer, { contentType: 'text/plain', contentDisposition: 'attachment; filename="fixture.txt"' });
      phase = 'get';
      const object = await storage.get(workspace, key);
      const text = object ? await new Response(object.body).text() : null;
      if (text !== 'Synthetic Worker S3 integrity probe') throw new Error('Worker S3 round-trip mismatch');
      phase = 'delete'; await storage.delete(workspace, key);
      if (await storage.get(workspace, key) !== null) throw new Error('Worker S3 deletion did not converge');
      return Response.json({ runtime: 'workerd', provider: objectStorageLabel('device'), exactContent: true, deleted: true, defaultBindingRequired: false });
    } catch (error) {
      return Response.json({ phase, errorName: error instanceof Error ? error.name : 'unknown', errorCode: error && typeof error === 'object' && 'code' in error ? error.code : null }, { status: 500 });
    }
  },
};
export default probe;
