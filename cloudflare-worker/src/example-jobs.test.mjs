import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import worker from './index.js';
import { createJob } from './db.js';
import { putObject } from './storage.js';
import { authHeaderFor, createTestEnv, createTestUser } from './test-helpers.mjs';
import {
  decorateAdminJobs,
  getExampleArtifactsFromManifest,
  hasCompleteExampleArtifacts,
  isSuperuserProfile,
  normalizeExampleJobsSetting,
  updateExampleJobsSetting
} from './example-jobs.js';

const workerSource = fs.readFileSync(path.join(import.meta.dirname, 'index.js'), 'utf8');
const dbSource = fs.readFileSync(path.join(import.meta.dirname, 'db.js'), 'utf8');

function completeArtifacts(productionType = 'sticker') {
  return {
    version: 1,
    projectName: `Contoh ${productionType}`,
    productionType,
    inputMode: 'ai_redraw',
    sourcePreviewPath: `jobs/job-1/source-preview.png`,
    resultPreviewPath: `jobs/job-1/preview-full-color.png`,
    manifestPath: `jobs/job-1/manifest.json`,
    files: {
      fullPng: 'https://example.com/full.png',
      fullSvg: 'https://example.com/full.svg',
      fullPdf: 'https://example.com/full.pdf',
      stickerCutlineSvg: '',
      stickerCutlinePdf: '',
      zip: 'https://example.com/result.zip',
      separationZip: productionType === 'sablon' ? 'https://example.com/separations.zip' : ''
    },
    separations:
      productionType === 'sablon'
        ? [
            {
              index: 1,
              kind: 'color',
              hex: '#000000',
              label: 'FILM 01 - #000000',
              svg: 'https://example.com/film-01.svg',
              pdf: 'https://example.com/film-01.pdf',
              preview: 'https://example.com/film-01-preview.png'
            }
          ]
        : [],
    updatedAt: '2026-05-28T00:00:00.000Z'
  };
}

test('decorateAdminJobs marks superadmin jobs with full artifact bundle as eligible examples', () => {
  const profiles = [
    { id: 'super-1', email: 'boss@example.com', role: 'superuser' },
    { id: 'user-1', email: 'user@example.com', role: 'user' }
  ];
  const jobs = [
    {
      id: 'job-1',
      user_id: 'super-1',
      production_type: 'sticker',
      status: 'done',
      is_example_public: true,
      deleted_at: null,
      manifest: { exampleArtifacts: completeArtifacts('sticker') }
    },
    {
      id: 'job-2',
      user_id: 'user-1',
      production_type: 'sablon',
      status: 'done',
      is_example_public: false,
      deleted_at: null,
      manifest: { exampleArtifacts: completeArtifacts('sablon') }
    },
    {
      id: 'job-3',
      user_id: 'super-1',
      production_type: 'sablon',
      status: 'done',
      is_example_public: false,
      deleted_at: null,
      manifest: {
        exampleArtifacts: {
          ...completeArtifacts('sablon'),
          files: { ...completeArtifacts('sablon').files, separationZip: '' },
          separations: []
        }
      }
    }
  ];

  const decorated = decorateAdminJobs(jobs, profiles, {
    sticker: {
      jobId: 'job-1',
      projectName: 'Contoh sticker',
      productionType: 'sticker',
      resultPreviewUrl: 'https://example.com/full.png',
      files: { fullPng: 'https://example.com/full.png' },
      updatedAt: '2026-05-28T00:00:00.000Z'
    }
  });

  assert.equal(decorated[0].user_email, 'boss@example.com');
  assert.equal(decorated[0].can_set_as_example, true);
  assert.equal(decorated[0].can_unset_example, true);
  assert.equal(decorated[0].is_active_example, true);
  assert.equal(decorated[0].is_example_public, true);
  assert.equal(decorated[1].can_set_as_example, false);
  assert.equal(decorated[1].can_unset_example, false);
  assert.equal(decorated[2].can_set_as_example, false);
});

test('decorateAdminJobs treats protected whitelist email as example-capable superadmin', () => {
  const decorated = decorateAdminJobs(
    [
      {
        id: 'job-whitelist',
        user_id: 'whitelist-1',
        production_type: 'sablon',
        status: 'done',
        is_example_public: false,
        deleted_at: null,
        manifest: { exampleArtifacts: completeArtifacts('sablon') }
      }
    ],
    [{ id: 'whitelist-1', email: 'jho.j80@gmail.com', role: 'user' }],
    {}
  );

  assert.equal(decorated[0].can_set_as_example, true);
  assert.equal(decorated[0].owner_role, 'user');
});

test('normalizeExampleJobsSetting keeps rich example fields and legacy imageUrl fallback', () => {
  const normalized = normalizeExampleJobsSetting({
    sticker: {
      jobId: 'job-1',
      projectName: 'Contoh lama',
      imageUrl: 'https://example.com/legacy.png',
      files: { fullSvg: 'https://example.com/full.svg' },
      updatedAt: '2026-05-28T00:00:00.000Z'
    }
  });

  assert.equal(normalized.sticker.resultPreviewUrl, 'https://example.com/legacy.png');
  assert.equal(normalized.sticker.files.fullSvg, 'https://example.com/full.svg');
});

test('updateExampleJobsSetting keeps other production examples untouched', () => {
  const current = normalizeExampleJobsSetting({
    sticker: {
      jobId: 'job-1',
      projectName: 'Contoh sticker',
      productionType: 'sticker',
      resultPreviewUrl: 'https://example.com/sticker.png',
      files: { fullPng: 'https://example.com/sticker.png' },
      updatedAt: '2026-05-28T00:00:00.000Z'
    }
  });

  const next = updateExampleJobsSetting(current, 'sablon', {
    jobId: 'job-2',
    projectName: 'Contoh sablon',
    productionType: 'sablon',
    resultPreviewUrl: 'https://example.com/sablon.png',
    files: { fullPng: 'https://example.com/sablon.png', separationZip: 'https://example.com/sablon.zip' },
    separations: [{ index: 1, kind: 'color', hex: '#000000', label: 'FILM 01', svg: 'a', pdf: 'b', preview: 'c' }],
    updatedAt: '2026-05-28T00:05:00.000Z'
  });

  assert.equal(next.sticker.jobId, 'job-1');
  assert.equal(next.sablon.jobId, 'job-2');
});

test('getExampleArtifactsFromManifest and completeness guard require full sablon bundle', () => {
  const stickerManifest = { exampleArtifacts: completeArtifacts('sticker') };
  const sablonManifest = { exampleArtifacts: completeArtifacts('sablon') };
  const brokenManifest = {
    exampleArtifacts: {
      ...completeArtifacts('sablon'),
      files: { ...completeArtifacts('sablon').files, separationZip: '' },
      separations: []
    }
  };

  assert.equal(getExampleArtifactsFromManifest(stickerManifest).projectName, 'Contoh sticker');
  assert.equal(hasCompleteExampleArtifacts(stickerManifest, 'sticker'), true);
  assert.equal(hasCompleteExampleArtifacts(sablonManifest, 'sablon'), true);
  assert.equal(hasCompleteExampleArtifacts(brokenManifest, 'sablon'), false);
});

test('whitelist email still counts as superuser fallback', () => {
  assert.equal(isSuperuserProfile({ role: 'user' }, 'jho.j80@gmail.com'), true);
  assert.equal(isSuperuserProfile({ role: 'user' }, 'other@example.com'), false);
});

test('publishing a new example replaces the previous job of the same production type', () => {
  assert.match(workerSource, /const replacedJobs = await unpublishOtherExampleJobs\(env, job\)/);
  assert.match(workerSource, /replacedJobIds/);
  assert.match(dbSource, /export async function unpublishOtherExampleJobs/);
  assert.match(dbSource, /UPDATE jobs SET is_example_public = 0, example_published_at = NULL WHERE production_type = \? AND id <> \? AND is_example_public = 1/);
});

test('GET /api/example-jobs returns published superadmin examples to unauthenticated guests and regular users', async () => {
  const env = createTestEnv({
    PUBLIC_APP_ORIGIN: 'https://worker.example'
  });
  const superadmin = await createTestUser(env, {
    id: 'super-1',
    email: 'jho.j80@gmail.com',
    role: 'superuser'
  });
  const regularUser = await createTestUser(env, {
    id: 'user-1',
    email: 'customer@example.com',
    role: 'user'
  });

  await putObject(env, 'example-jobs', 'jobs/job-sablon-1/source-preview.png', new Uint8Array([1, 2, 3]), 'image/png');
  await putObject(env, 'example-jobs', 'jobs/job-sablon-1/full-color.png', new Uint8Array([4, 5, 6]), 'image/png');

  await createJob(env, {
    id: 'job-sablon-1',
    user_id: superadmin.id,
    project_name: 'Sample Kaos Rock',
    input_mode: 'ai_redraw',
    production_type: 'sablon',
    status: 'done',
    is_example_public: false,
    manifest: {
      exampleArtifacts: {
        sourcePreviewPath: 'jobs/job-sablon-1/source-preview.png',
        resultPreviewPath: 'jobs/job-sablon-1/full-color.png',
        files: {
          sourcePreview: '/api/assets/example-jobs/jobs/job-sablon-1/source-preview.png',
          fullPng: '/api/assets/example-jobs/jobs/job-sablon-1/full-color.png',
          fullSvg: '/api/assets/example-jobs/jobs/job-sablon-1/full-vector.svg',
          fullPdf: '/api/assets/example-jobs/jobs/job-sablon-1/full-vector.pdf',
          zip: '/api/assets/example-jobs/jobs/job-sablon-1/result.zip',
          separationZip: '/api/assets/example-jobs/jobs/job-sablon-1/separation-films.zip'
        },
        separations: [
          {
            index: 1,
            kind: 'color',
            hex: '#ff0000',
            label: 'Merah',
            svg: '/api/assets/example-jobs/jobs/job-sablon-1/film-color-01.svg',
            pdf: '/api/assets/example-jobs/jobs/job-sablon-1/film-color-01.pdf',
            preview: '/api/assets/example-jobs/jobs/job-sablon-1/film-color-01.png'
          }
        ]
      }
    }
  });

  const beforePublishRes = await worker.fetch(new Request('https://worker.example/api/example-jobs'), env);
  assert.equal(beforePublishRes.status, 200);
  const beforeData = await beforePublishRes.json();
  assert.equal(beforeData.exampleJobs.length, 0);

  const publishRes = await worker.fetch(
    new Request('https://worker.example/api/admin/jobs/job-sablon-1/set-example', {
      method: 'POST',
      headers: await authHeaderFor(env, superadmin)
    }),
    env
  );
  assert.equal(publishRes.status, 200);

  const guestRes = await worker.fetch(new Request('https://worker.example/api/example-jobs'), env);
  assert.equal(guestRes.status, 200);
  const guestData = await guestRes.json();
  assert.equal(guestData.exampleJobs.length, 1);
  assert.equal(guestData.exampleJobs[0].jobId, 'job-sablon-1');
  assert.equal(guestData.exampleJobs[0].isExamplePublic, true);
  assert.match(guestData.exampleJobs[0].sourcePreviewUrl, /\/api\/assets\/example-jobs\/jobs\/job-sablon-1\/source-preview\.png$/);
  assert.match(guestData.exampleJobs[0].resultPreviewUrl, /\/api\/assets\/example-jobs\/jobs\/job-sablon-1\/full-color\.png$/);
  assert.equal(guestData.exampleJobs[0].separations.length, 1);

  const assetRes = await worker.fetch(new Request(new URL(guestData.exampleJobs[0].resultPreviewUrl, 'https://worker.example')), env);
  assert.equal(assetRes.status, 200);
  assert.deepEqual([...new Uint8Array(await assetRes.arrayBuffer())], [4, 5, 6]);

  const userRes = await worker.fetch(
    new Request('https://worker.example/api/example-jobs', {
      headers: await authHeaderFor(env, regularUser)
    }),
    env
  );
  assert.equal(userRes.status, 200);
  const userData = await userRes.json();
  assert.equal(userData.exampleJobs.length, 1);
  assert.equal(userData.exampleJobs[0].jobId, 'job-sablon-1');
});

test('per-file streaming artifact upload + finalize publishes complete sablon example without multipart memory spike', async () => {
  const env = createTestEnv({
    PUBLIC_APP_ORIGIN: 'https://worker.example'
  });
  const superadmin = await createTestUser(env, {
    id: 'super-stream-1',
    email: 'jho.j80@gmail.com',
    role: 'superuser'
  });
  const job = await createJob(env, {
    id: 'job-stream-1',
    user_id: superadmin.id,
    project_name: 'Streamed Sablon',
    input_mode: 'ai_redraw',
    production_type: 'sablon',
    status: 'done',
    is_example_public: false
  });
  const headers = await authHeaderFor(env, superadmin);

  const traversalRes = await worker.fetch(
    new Request(`https://worker.example/api/jobs/${job.id}/artifact-file?path=${encodeURIComponent('../secret.png')}`, {
      method: 'POST',
      headers,
      body: new Uint8Array([1, 2, 3])
    }),
    env
  );
  assert.equal(traversalRes.status, 400);

  const incompleteFinalize = await worker.fetch(
    new Request(`https://worker.example/api/jobs/${job.id}/artifacts-finalize`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        manifest: {
          projectName: 'Streamed Sablon',
          productionType: 'sablon',
          inputMode: 'ai_redraw',
          separations: [{ index: 1, kind: 'color', hex: '#111111', label: 'Hitam' }]
        }
      })
    }),
    env
  );
  assert.equal(incompleteFinalize.status, 400);

  const filesToUpload = [
    ['source-preview.png', 'image/png', new Uint8Array([10, 11])],
    ['preview-full-color.png', 'image/png', new Uint8Array([12, 13])],
    ['full-vector.svg', 'image/svg+xml', new TextEncoder().encode('<svg/>')],
    ['full-vector.pdf', 'application/pdf', new Uint8Array([37, 80, 68, 70])],
    ['result.zip', 'application/zip', new Uint8Array([80, 75, 3, 4])],
    ['separation-films.zip', 'application/zip', new Uint8Array([80, 75, 5, 6])],
    ['separations/film-color-01.svg', 'image/svg+xml', new TextEncoder().encode('<svg/>')],
    ['separations/film-color-01.pdf', 'application/pdf', new Uint8Array([37, 80, 68, 70])],
    ['separations/film-color-01-preview.png', 'image/png', new Uint8Array([14, 15])]
  ];

  for (const [relativePath, mimeType, bytes] of filesToUpload) {
    const uploadRes = await worker.fetch(
      new Request(`https://worker.example/api/jobs/${job.id}/artifact-file?path=${encodeURIComponent(relativePath)}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': mimeType },
        body: bytes
      }),
      env
    );
    assert.equal(uploadRes.status, 200, `Expected 200 for ${relativePath}`);
  }

  const finalizeRes = await worker.fetch(
    new Request(`https://worker.example/api/jobs/${job.id}/artifacts-finalize`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        manifest: {
          projectName: 'Streamed Sablon',
          productionType: 'sablon',
          inputMode: 'ai_redraw',
          separations: [{ index: 1, kind: 'color', hex: '#111111', label: 'Hitam' }]
        }
      })
    }),
    env
  );
  assert.equal(finalizeRes.status, 200);
  const finalized = await finalizeRes.json();
  assert.equal(finalized.jobId, job.id);
  assert.ok(finalized.exampleArtifacts?.files?.zip);

  const publishRes = await worker.fetch(
    new Request(`https://worker.example/api/admin/jobs/${job.id}/set-example`, {
      method: 'POST',
      headers
    }),
    env
  );
  assert.equal(publishRes.status, 200);

  const feedRes = await worker.fetch(new Request('https://worker.example/api/example-jobs'), env);
  assert.equal(feedRes.status, 200);
  const feedData = await feedRes.json();
  assert.equal(feedData.exampleJobs.length, 1);
  assert.equal(feedData.exampleJobs[0].jobId, job.id);
  assert.equal(feedData.exampleJobs[0].separations.length, 1);
});
