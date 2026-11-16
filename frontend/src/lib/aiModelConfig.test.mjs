import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeAiModelDraft, selectAiveneImageModel } from './aiModelConfig.js';

test('Admin draft normalizes legacy GPT Image 1.5 and inputFidelity to GPT Image 2 without fidelity', () => {
  const draft = normalizeAiModelDraft({
    mode: 'custom',
    aiveneImageModel: 'gpt-image-1.5',
    openAiImageModel: 'gpt-image-1.5',
    inputFidelity: 'high'
  });

  assert.equal(draft.mode, 'custom');
  assert.equal(draft.aiveneImageModel, 'gpt-image-2');
  assert.equal(draft.openAiImageModel, 'gpt-image-2');
  assert.equal('inputFidelity' in draft, false);
});

test('selecting AIVene GPT Image 2 creates a persistable custom draft without inputFidelity', () => {
  const selected = selectAiveneImageModel(normalizeAiModelDraft(), 'gpt-image-2');
  const saved = normalizeAiModelDraft(selected);

  assert.equal(saved.mode, 'custom');
  assert.equal(saved.preset, 'custom');
  assert.equal(saved.label, 'Custom');
  assert.equal(saved.aiveneImageModel, 'gpt-image-2');
  assert.equal(saved.openAiImageModel, 'gpt-image-2');
  assert.equal('inputFidelity' in saved, false);
});
