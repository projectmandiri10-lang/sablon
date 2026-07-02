import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const authPanelSource = fs.readFileSync(path.join(import.meta.dirname, '..', 'components', 'AuthPanel.jsx'), 'utf8');

test('google login button keeps readable text styling when disabled', () => {
  const googleButtonSnippet = authPanelSource.match(/className=\{`mt-3 inline-flex min-h-11 w-full[\s\S]+?`\}/)?.[0] || '';
  assert.match(authPanelSource, /text-\[#3C4043\]/);
  assert.equal(googleButtonSnippet.includes('opacity-60'), false);
  assert.match(googleButtonSnippet, /cursor-not-allowed bg-gray-50/);
});
