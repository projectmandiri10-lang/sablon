import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const landingSource = fs.readFileSync(path.join(import.meta.dirname, '..', 'components', 'LandingPage.jsx'), 'utf8');
const appSource = fs.readFileSync(path.join(import.meta.dirname, '..', 'App.jsx'), 'utf8');
const uploadBoxSource = fs.readFileSync(path.join(import.meta.dirname, '..', 'components', 'UploadBox.jsx'), 'utf8');

test('landing removes free-credit copy and advertises AI redraw at Rp10.000 with color separation', () => {
  assert.doesNotMatch(landingSource, /1 Credit Gratis/);
  assert.doesNotMatch(landingSource, /1 Free Credit/);
  assert.doesNotMatch(landingSource, /Mulai Gratis Sekarang/);
  assert.match(landingSource, /AI Redraw Rp10\.000/);
  assert.match(landingSource, /termasuk pecah warna/i);
});

test('upload box explains AI redraw already includes color separation', () => {
  assert.match(uploadBoxSource, /Rp10\.000 per gambar sudah termasuk pecah warna/);
});

test('app exposes a dedicated Contoh hasil button for published superadmin examples', () => {
  assert.match(appSource, /examplesSection: isId \? 'Contoh hasil' : 'Example results'/);
  assert.match(appSource, /openExampleResults/);
});
