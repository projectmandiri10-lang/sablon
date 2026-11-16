import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { isStaleChunkError } from './pendingAiRecovery.js';

const appSource = await readFile(new URL('../App.jsx', import.meta.url), 'utf8');
const previewSource = await readFile(new URL('../components/ResultPreview.jsx', import.meta.url), 'utf8');
const librarySource = await readFile(new URL('../components/JobLibraryPanel.jsx', import.meta.url), 'utf8');
const processorSource = await readFile(new URL('./localProcessor.js', import.meta.url), 'utf8');
const historySource = await readFile(new URL('./localHistoryStore.js', import.meta.url), 'utf8');

test('history exposes one retrace control that replaces previous artifacts', () => {
  assert.match(previewSource, /Trace Ulang 3,15×/);
  assert.doesNotMatch(previewSource, /Trace Ulang 2×/);
  assert.doesNotMatch(previewSource, /Trace Ulang 3×/);
  assert.match(previewSource, /film separasi, dan cutline lama akan diganti seluruhnya/);
});

test('retrace starts from stored local input and never requests another AI redraw', () => {
  const handlerStart = appSource.indexOf('async function handleRetraceLibraryJob');
  const handlerEnd = appSource.indexOf('\n  const currentPathname', handlerStart);
  const handlerSource = appSource.slice(handlerStart, handlerEnd);

  assert.match(handlerSource, /processImageLocallyWithFallback\(traceFile, traceSettings\)/);
  assert.match(handlerSource, /analyzeRasterForUpscale/);
  assert.match(handlerSource, /saveHistoryJob/);
  assert.doesNotMatch(handlerSource, /requestImageRetouch/);
});

test('AI local trace uses Pica upscale with a 4096px safety cap', () => {
  assert.match(processorSource, /const MAX_CANVAS_EDGE = 4096/);
  assert.match(processorSource, /DEFAULT_TRACE_UPSCALE_FACTOR = 3\.15/);
  assert.match(processorSource, /await import\('pica'\)/);
  assert.match(processorSource, /filter: 'mks2013'/);
  assert.match(processorSource, /traceUpscaleAnalysis/);
  assert.match(processorSource, /traceUpscaleApplied/);
  assert.match(processorSource, /reason: 'vector_source'/);
});

test('ready trace history keeps the original raster for future retries', () => {
  assert.match(appSource, /sourceRasterBlob: file/);
  assert.match(historySource, /sourceRasterBlob/);
  assert.match(historySource, /sourceRasterUrl/);
});

test('full-color preview keeps the complete traced palette separate from film colors', () => {
  assert.match(processorSource, /const fullColorPalette = outputColors/);
  assert.match(processorSource, /buildFullSvg\(\{ colors: fullColorPalette/);
  assert.match(processorSource, /palette: fullColorPalette/);
});

test('failed or pending AI jobs are saved to history and retryable locally without new AI calls', () => {
  const preloadIdx = appSource.indexOf("await Promise.all([import('jszip'), import('jspdf'), import('pica')])");
  const aiCallIdx = appSource.indexOf('await requestImageRetouch(');
  assert.ok(preloadIdx > 0 && aiCallIdx > preloadIdx, 'local render modules preload before AI request');

  assert.match(appSource, /status:\s*'pending_trace'/);
  assert.match(appSource, /status:\s*'failed'/);
  assert.match(appSource, /savePendingAiRecovery/);
  assert.match(librarySource, /Retry tanpa panggil AI/);
  assert.match(previewSource, /Coba Lagi Proses Lokal \(Tanpa Panggil AI\)/);

  assert.equal(isStaleChunkError(new Error('Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html".')), true);
  assert.equal(isStaleChunkError(new Error('Failed to fetch dynamically imported module')), true);
  assert.equal(isStaleChunkError(new Error('Network error')), false);
});
