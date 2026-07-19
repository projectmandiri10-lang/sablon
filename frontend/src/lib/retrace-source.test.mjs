import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const appSource = await readFile(new URL('../App.jsx', import.meta.url), 'utf8');
const previewSource = await readFile(new URL('../components/ResultPreview.jsx', import.meta.url), 'utf8');
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
