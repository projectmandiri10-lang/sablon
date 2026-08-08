import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const landingSource = fs.readFileSync(path.join(import.meta.dirname, '..', 'components', 'LandingPage.jsx'), 'utf8');
const appSource = fs.readFileSync(path.join(import.meta.dirname, '..', 'App.jsx'), 'utf8');
const uploadBoxSource = fs.readFileSync(path.join(import.meta.dirname, '..', 'components', 'UploadBox.jsx'), 'utf8');

test('landing removes free-credit copy and advertises AI redraw promo at Rp5.000 with color separation', () => {
  assert.doesNotMatch(landingSource, /1 Credit Gratis/);
  assert.doesNotMatch(landingSource, /1 Free Credit/);
  assert.doesNotMatch(landingSource, /Mulai Gratis Sekarang/);
  assert.match(landingSource, /AI Redraw Promo Rp5\.000/);
  assert.match(landingSource, /promo perkenalan/i);
  assert.match(landingSource, /termasuk pecah warna/i);
});

test('upload box explains AI redraw already includes color separation', () => {
  assert.match(uploadBoxSource, /Rp5\.000 per gambar, sudah termasuk pecah warna/);
  assert.match(uploadBoxSource, /Contoh foto sumber yang baik/);
  assert.match(uploadBoxSource, /setSelectedGuideExample/);
  assert.match(appSource, /exampleJobs=\{exampleJobs\}/);
});

test('app exposes a dedicated Contoh hasil button for published superadmin examples', () => {
  assert.match(appSource, /examplesSection: isId \? 'Contoh hasil' : 'Example results'/);
  assert.match(appSource, /openExampleResults/);
});
