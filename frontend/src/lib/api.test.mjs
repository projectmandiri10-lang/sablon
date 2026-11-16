import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hydrateBackendRetouchResult, registerAuthTokenProvider, uploadExampleArtifacts } from './api.js';

globalThis.window = {
  atob: globalThis.atob
};

test('raw AI PNG response is returned as the local trace input without backend trace artifacts', async () => {
  const result = hydrateBackendRetouchResult(
    {
      artifacts: {
        aiRawPng: {
          filename: 'hasil-ai-mentah.png',
          mimeType: 'image/png',
          base64: 'AQID'
        }
      }
    },
    { inputMode: 'ai_redraw' }
  );

  assert.equal(result.localResult, null);
  assert.equal(result.aiRawPngBlob.type, 'image/png');
  assert.deepEqual([...new Uint8Array(await result.pngFile.arrayBuffer())], [1, 2, 3]);
});

test('uploadExampleArtifacts uploads per-file sequentially with proactive token refresh', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  registerAuthTokenProvider({
    getValidAccessToken: async () => 'fresh-jwt-token',
    refreshAccessToken: async () => 'refreshed-jwt-token'
  });

  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method, auth: init.headers?.Authorization, body: init.body });
    return new Response(JSON.stringify({ ok: true, jobId: 'job-99' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    const form = new FormData();
    form.append('sourcePreview', new Blob([1, 2], { type: 'image/png' }), 'source.png');
    form.append('fullPng', new Blob([3, 4], { type: 'image/png' }), 'full.png');
    form.append('fullSvg', new Blob(['<svg/>'], { type: 'image/svg+xml' }), 'full.svg');
    form.append('fullPdf', new Blob([5, 6], { type: 'application/pdf' }), 'full.pdf');
    form.append('zip', new Blob([7, 8], { type: 'application/zip' }), 'result.zip');
    form.append('manifest', JSON.stringify({ projectName: 'Sticker Demo', productionType: 'sticker', separations: [] }));

    await uploadExampleArtifacts('job-99', form, 'stale-jwt-token');

    assert.equal(calls.length, 6);
    assert.ok(calls.every((entry) => entry.auth === 'Bearer fresh-jwt-token'));
    assert.match(calls[0].url, /\/api\/jobs\/job-99\/artifact-file\?path=source-preview\.png$/);
    assert.match(calls[4].url, /\/api\/jobs\/job-99\/artifact-file\?path=result\.zip$/);
    assert.match(calls[5].url, /\/api\/jobs\/job-99\/artifacts-finalize$/);
  } finally {
    globalThis.fetch = originalFetch;
    registerAuthTokenProvider(null);
  }
});
