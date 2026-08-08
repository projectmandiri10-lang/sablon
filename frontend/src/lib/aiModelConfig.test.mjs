import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeAiModelDraft, selectAiveneImageModel } from './aiModelConfig.js';

test('Admin draft loads a stored AIVene GPT Image 1.5 selection', () => {
  const draft = normalizeAiModelDraft({
    mode: 'custom',
    aiveneImageModel: 'gpt-image-1.5',
    openAiImageModel: 'gpt-image-1.5'
  });

  assert.equal(draft.mode, 'custom');
  assert.equal(draft.aiveneImageModel, 'gpt-image-1.5');
  assert.equal(draft.openAiImageModel, 'gpt-image-2');
});

test('selecting an AIVene model creates a persistable custom draft', () => {
  const selected = selectAiveneImageModel(normalizeAiModelDraft(), 'gpt-image-1.5');
  const saved = normalizeAiModelDraft(selected);

  assert.equal(saved.mode, 'custom');
  assert.equal(saved.preset, 'custom');
  assert.equal(saved.label, 'Custom');
  assert.equal(saved.aiveneImageModel, 'gpt-image-1.5');
  assert.equal(saved.openAiImageModel, 'gpt-image-2');
});
