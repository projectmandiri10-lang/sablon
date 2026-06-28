import assert from 'node:assert/strict';
import { test } from 'node:test';
import { enforcePrintableColorLimit, requestedSpotColorLimit, shouldUseHardSpotColors } from './localProcessor.js';

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
