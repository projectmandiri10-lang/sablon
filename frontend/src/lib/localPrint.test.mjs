import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getPaperSizeMm, PAPER_SIZE_OPTIONS } from './localPrint.js';

test('paper size options include larger ISO sizes for film export', () => {
  assert.deepEqual(PAPER_SIZE_OPTIONS, ['A4', 'A3', 'A2', 'A1', 'A0']);
});

test('paper size helper resolves A2, A1, and A0 dimensions with orientation', () => {
  assert.deepEqual(getPaperSizeMm('A2'), { widthMm: 420, heightMm: 594 });
  assert.deepEqual(getPaperSizeMm('A1'), { widthMm: 594, heightMm: 841 });
  assert.deepEqual(getPaperSizeMm('A0', 'landscape'), { widthMm: 1189, heightMm: 841 });
});
