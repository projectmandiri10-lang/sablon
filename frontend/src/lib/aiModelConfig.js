import { normalizeHybridRedrawConfig } from '../../../shared/hybridRedrawConfig.js';

export function normalizeAiModelDraft(value = {}) {
  return normalizeHybridRedrawConfig(value);
}

export function selectAiveneImageModel(current = {}, aiveneImageModel) {
  return {
    ...current,
    mode: 'custom',
    preset: 'custom',
    label: 'Custom',
    aiveneImageModel
  };
}
