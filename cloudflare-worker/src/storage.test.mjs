import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from './index.js';
import { copyObject, deleteObjects, getObject, objectKey, putObject } from './storage.js';
import { createTestEnv } from './test-helpers.mjs';

test('objectKey prefixes the bucket and strips leading slashes', () => {
  assert.equal(objectKey('example-jobs', 'jobs/job-1/preview.png'), 'example-jobs/jobs/job-1/preview.png');
  assert.equal(objectKey('example-jobs', '/jobs/job-1/preview.png'), 'example-jobs/jobs/job-1/preview.png');
});

test('putObject stores bytes with content type and getObject reads them back', async () => {
  const env = createTestEnv();
  const bytes = new Uint8Array([1, 2, 3, 4]);
  await putObject(env, 'example-jobs', 'jobs/job-1/preview.png', bytes, 'image/png');

  const object = await getObject(env, 'example-jobs', 'jobs/job-1/preview.png');
  assert.ok(object);
  assert.equal(object.httpMetadata.contentType, 'image/png');
  assert.equal(object.httpMetadata.cacheControl, 'public, max-age=3600');
  assert.deepEqual([...new Uint8Array(await object.arrayBuffer())], [1, 2, 3, 4]);
  assert.equal(await getObject(env, 'example-jobs', 'jobs/missing.png'), null);
});

test('deleteObjects removes every object under the given prefixes', async () => {
  const env = createTestEnv();
  await putObject(env, 'example-jobs', 'jobs/job-1/a.png', new Uint8Array([1]), 'image/png');
  await putObject(env, 'example-jobs', 'jobs/job-1/b.png', new Uint8Array([2]), 'image/png');
  await putObject(env, 'example-jobs', 'jobs/job-2/c.png', new Uint8Array([3]), 'image/png');

  assert.equal(await deleteObjects(env, 'example-jobs', []), null);
  const result = await deleteObjects(env, 'example-jobs', ['jobs/job-1/']);
  assert.deepEqual(result, { deleted: true });
  assert.equal(env.ASSETS.objects.size, 1);
  assert.ok(env.ASSETS.objects.has('example-jobs/jobs/job-2/c.png'));
});

test('copyObject duplicates content and rejects missing sources', async () => {
  const env = createTestEnv();
  await putObject(env, 'example-jobs', 'jobs/job-1/a.png', new Uint8Array([9, 9]), 'image/png');

  await copyObject(env, 'example-jobs', 'jobs/job-1/a.png', 'app-assets/examples/a.png');
  const copied = await getObject(env, 'example-jobs', 'app-assets/examples/a.png');
  assert.deepEqual([...new Uint8Array(await copied.arrayBuffer())], [9, 9]);
  assert.equal(copied.httpMetadata.contentType, 'image/png');

  await assert.rejects(() => copyObject(env, 'example-jobs', 'jobs/missing.png', 'x.png'), /File sumber tidak ditemukan/);
});

test('storage helpers fail fast when the R2 binding is missing', async () => {
  const env = createTestEnv({ ASSETS: undefined });
  await assert.rejects(() => putObject(env, 'example-jobs', 'a.png', new Uint8Array([1]), 'image/png'), /binding R2 ASSETS kosong/);
});

test('public asset route serves R2 objects with cache headers and blocks traversal', async () => {
  const env = createTestEnv();
  await putObject(env, 'example-jobs', 'app-assets/qris/qris-1.png', new Uint8Array([5, 6, 7]), 'image/png');

  const ok = await worker.fetch(new Request('https://worker.example/api/assets/example-jobs/app-assets/qris/qris-1.png'), env);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('content-type'), 'image/png');
  assert.equal(ok.headers.get('cache-control'), 'public, max-age=3600');
  assert.deepEqual([...new Uint8Array(await ok.arrayBuffer())], [5, 6, 7]);

  const missing = await worker.fetch(new Request('https://worker.example/api/assets/example-jobs/app-assets/qris/none.png'), env);
  assert.equal(missing.status, 404);

  const traversal = await worker.fetch(new Request('https://worker.example/api/assets/example-jobs/app-assets/../secrets.png'), env);
  assert.equal(traversal.status, 404);
});