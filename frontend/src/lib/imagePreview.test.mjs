import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateContainedDimensions, hasTransparentPixels } from './imagePreview.js';

test('AI input dimensions limit the longest landscape edge to 1080', () => {
  assert.deepEqual(calculateContainedDimensions(4000, 2000, 1080), { width: 1080, height: 540 });
});

test('AI input dimensions limit the longest portrait edge to 1080', () => {
  assert.deepEqual(calculateContainedDimensions(2000, 4000, 1080), { width: 540, height: 1080 });
});

test('AI input dimensions preserve square images and never upscale small images', () => {
  assert.deepEqual(calculateContainedDimensions(3000, 3000, 1080), { width: 1080, height: 1080 });
  assert.deepEqual(calculateContainedDimensions(640, 480, 1080), { width: 640, height: 480 });
});

test('transparent pixel detection distinguishes opaque and alpha images', () => {
  assert.equal(hasTransparentPixels(new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255])), false);
  assert.equal(hasTransparentPixels(new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 128])), true);
});
