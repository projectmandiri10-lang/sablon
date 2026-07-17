import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hydrateBackendRetouchResult } from './api.js';

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
