import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  enforcePrintableColorLimit,
  decideRasterUpscaleEligibility,
  isVectorImageFile,
  normalizeLocalTraceSettings,
  normalizeTraceUpscaleFactor,
  refineAssignmentsForTraceForTest,
  requestedSpotColorLimit,
  shouldUseHardSpotColors,
  traceBinaryPathForTest
} from './localProcessor.js';

function testColors(count) {
  return Array.from({ length: count }, (_, index) => ({
    index: index + 1,
    hex: `#${String(index + 1).repeat(6).slice(0, 6)}`,
    r: index * 20,
    g: index * 20,
    b: index * 20,
    count: count - index,
    pixelCount: count - index,
    bounds: { x: 0, y: 0, maxX: 0, maxY: 0, width: 1, height: 1 }
  }));
}

function countPathCommands(path) {
  return (path.match(/[LQ]/g) || []).length;
}

function jaggedBlob(width, height) {
  const binary = new Uint8Array(width * height);
  for (let y = 8; y < height - 8; y += 1) {
    const left = 7 + Math.floor(y / 3) + (y % 2);
    const right = width - 8 - Math.floor(y / 4);
    for (let x = left; x < right; x += 1) {
      binary[width * y + x] = 1;
    }
  }
  return binary;
}

function countAssigned(assignments, colorIndex = 0) {
  let count = 0;
  for (let index = 0; index < assignments.length; index += 1) {
    if (assignments[index] === colorIndex) count += 1;
  }
  return count;
}

test('auto color mode keeps a wider detected spot color limit', () => {
  assert.equal(
    requestedSpotColorLimit({
      productionType: 'sablon',
      separateColors: true,
      colorLimitMode: 'auto',
      maxColors: 4
    }),
    8
  );
});

test('manual color mode keeps the selected spot color limit', () => {
  assert.equal(
    requestedSpotColorLimit({
      productionType: 'sablon',
      separateColors: true,
      colorLimitMode: 'manual',
      maxColors: 4
    }),
    4
  );
});

test('auto printable color limit does not cut detected palette to default 4', () => {
  const result = enforcePrintableColorLimit(
    new Int16Array([0, 1, 2, 3, 4, 5]),
    testColors(6),
    {
      productionType: 'sablon',
      separateColors: true,
      colorLimitMode: 'auto',
      maxColors: 4
    },
    6,
    1
  );

  assert.equal(result.colors.length, 6);
  assert.equal(result.wasColorLimited, false);
});

test('manual printable color limit still cuts palette to selected amount', () => {
  const result = enforcePrintableColorLimit(
    new Int16Array([0, 1, 2, 3, 4, 5]),
    testColors(6),
    {
      productionType: 'sablon',
      separateColors: true,
      colorLimitMode: 'manual',
      maxColors: 4
    },
    6,
    1
  );

  assert.equal(result.colors.length, 4);
  assert.equal(result.wasColorLimited, true);
});

test('spot color handling stays active for sablon separation', () => {
  assert.equal(shouldUseHardSpotColors({ productionType: 'sablon', separateColors: false }), true);
  assert.equal(shouldUseHardSpotColors({ productionType: 'sticker', separateColors: false }), false);
});

test('AI redraw always enables browser color separation', () => {
  const settings = normalizeLocalTraceSettings({ inputMode: 'ai_redraw', productionType: 'sticker', separateColors: false });
  assert.equal(settings.separateColors, true);
  assert.equal(settings.traceUpscaleFactor, 3.15);
});

test('trace upscale keeps the 3.15x default without integer truncation', () => {
  assert.equal(normalizeTraceUpscaleFactor(undefined), 3.15);
  assert.equal(normalizeTraceUpscaleFactor(3.15), 3.15);
  assert.equal(normalizeTraceUpscaleFactor(9), 3.15);
  assert.equal(normalizeTraceUpscaleFactor(0), 1);
});

test('ready trace upscale eligibility follows resolution and quality thresholds', () => {
  assert.equal(decideRasterUpscaleEligibility({ width: 1200, height: 900, edgeDensity: 0.4, sharpnessScore: 0.9 }).shouldUpscale, true);
  assert.equal(decideRasterUpscaleEligibility({ width: 2048, height: 1200, edgeDensity: 0.02, sharpnessScore: 0.01 }).shouldUpscale, false);
  assert.equal(decideRasterUpscaleEligibility({ width: 1800, height: 1200, edgeDensity: 0.2, sharpnessScore: 0.8 }).shouldUpscale, false);
  assert.equal(decideRasterUpscaleEligibility({ width: 1800, height: 1200, edgeDensity: 0.02, sharpnessScore: 0.8 }).shouldUpscale, true);
});

test('ready trace recognizes SVG sources and skips raster upscale', () => {
  assert.equal(isVectorImageFile({ type: 'image/svg+xml', name: 'logo.svg' }), true);
  assert.equal(isVectorImageFile({ type: '', name: 'logo.svg' }), true);
  assert.equal(isVectorImageFile({ type: 'image/png', name: 'logo.png' }), false);
});

test('lineart trace smooths jagged AI redraw boundaries into fewer curve commands', () => {
  const width = 64;
  const height = 64;
  const binary = jaggedBlob(width, height);
  const pixelPath = traceBinaryPathForTest(binary, width, height, { inputMode: 'ready_trace', edgeRefinement: true });
  const lineartPath = traceBinaryPathForTest(binary, width, height, { inputMode: 'ai_redraw', edgeRefinement: true });

  assert.match(lineartPath, /Q/);
  assert.ok(countPathCommands(lineartPath) < countPathCommands(pixelPath));
});

test('lineart polish keeps small readable components instead of dropping them', () => {
  const width = 10;
  const height = 10;
  const assignments = new Int16Array(width * height);
  assignments.fill(-1);
  for (const [x, y] of [
    [4, 4],
    [5, 4],
    [4, 5],
    [5, 5]
  ]) {
    assignments[width * y + x] = 0;
  }

  const result = refineAssignmentsForTraceForTest(assignments, testColors(1), width, height, {
    inputMode: 'ai_redraw',
    edgeRefinement: true
  });

  assert.equal(result.lineartPolish, true);
  assert.equal(countAssigned(result.assignments, 0), 4);
});

test('lineart polish does not create extra spot colors from the dominant palette', () => {
  const width = 6;
  const height = 2;
  const assignments = new Int16Array([0, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 1]);
  const result = refineAssignmentsForTraceForTest(assignments, testColors(2), width, height, {
    inputMode: 'ai_redraw',
    edgeRefinement: true
  });

  assert.ok(result.colors.length <= 2);
});

test('edgeRefinement false preserves the previous assignments without lineart polish', () => {
  const assignments = new Int16Array([0, 0, -1, 0]);
  const result = refineAssignmentsForTraceForTest(assignments, testColors(1), 2, 2, {
    inputMode: 'ai_redraw',
    edgeRefinement: false
  });

  assert.equal(result.lineartPolish, false);
  assert.deepEqual([...result.assignments], [...assignments]);
});
