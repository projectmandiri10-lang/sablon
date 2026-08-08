import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAdminFinanceExportFilename, buildAdminFinanceQuery, defaultAdminFinanceRange } from './adminFinance.js';

test('default admin finance range uses the current UTC month', () => {
  assert.deepEqual(defaultAdminFinanceRange(new Date('2026-07-02T10:00:00.000Z')), {
    from: '2026-07-01',
    to: '2026-07-31'
  });
});

test('admin finance query builder keeps meaningful filters and skips blanks', () => {
  assert.equal(
    buildAdminFinanceQuery({
      from: '2026-07-01',
      to: '2026-07-31',
      source: 'payment_gateway',
      category: '',
      userEmail: 'buyer@example.com'
    }),
    '?from=2026-07-01&to=2026-07-31&source=payment_gateway&userEmail=buyer%40example.com'
  );
});

test('admin finance export filename follows section and range', () => {
  assert.equal(
    buildAdminFinanceExportFilename('transactions', { from: '2026-07-01', to: '2026-07-31' }),
    'finance-transactions-2026-07-01-2026-07-31.csv'
  );
});
