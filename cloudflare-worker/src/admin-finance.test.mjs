import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildFinanceCsv,
  buildFinanceSummary,
  defaultFinanceRange,
  filterFinanceTransactions,
  findApplicableTaxRule,
  isSuccessfulGatewayPayment,
  normalizeLedgerTransaction,
  normalizeManualPaymentTransaction
} from './admin-finance.js';

test('default finance range covers the current UTC month', () => {
  const range = defaultFinanceRange(new Date('2026-07-02T10:00:00.000Z'));
  assert.deepEqual(range, {
    from: '2026-07-01',
    to: '2026-07-31'
  });
});

test('successful gateway payments require credited ledger or paid final status', () => {
  assert.equal(isSuccessfulGatewayPayment({ status: 'settlement', paid_at: '2026-07-02T10:00:00.000Z' }), true);
  assert.equal(isSuccessfulGatewayPayment({ status: 'pending', credited_ledger_id: 'ledger-1' }), true);
  assert.equal(isSuccessfulGatewayPayment({ status: 'pending' }), false);
});

test('finance summary counts customer cash once and excludes audit ledger duplicates', () => {
  const summary = buildFinanceSummary({
    manualPayments: [
      {
        id: 'manual-1',
        user_email: 'buyer@example.com',
        amount_idr: 10000,
        status: 'approved',
        approved_at: '2026-07-02T10:00:00.000Z'
      }
    ],
    gatewayPayments: [
      {
        id: 'gateway-1',
        user_email: 'buyer@example.com',
        amount_idr: 25000,
        status: 'settlement',
        paid_at: '2026-07-03T10:00:00.000Z',
        credited_ledger_id: 'ledger-midtrans-1'
      }
    ],
    ledgerEntries: [
      {
        id: 'ledger-midtrans-1',
        user_email: 'buyer@example.com',
        amount_idr: 25000,
        reason: 'midtrans_payment',
        kind: 'credit',
        created_at: '2026-07-03T10:00:00.000Z'
      },
      {
        id: 'ledger-signup-1',
        user_email: 'new@example.com',
        amount_idr: 5000,
        reason: 'signup_free_credit',
        kind: 'credit',
        created_at: '2026-07-03T11:00:00.000Z'
      }
    ],
    businessEntries: [
      {
        id: 'biz-1',
        entry_date: '2026-07-05',
        entry_type: 'owner_capital',
        cash_direction: 'in',
        amount_idr: 200000
      }
    ],
    jobs: [
      {
        id: 'job-1',
        input_mode: 'ai_redraw',
        price_idr: 10000
      },
      {
        id: 'job-2',
        input_mode: 'ready_trace',
        price_idr: 2000
      }
    ],
    taxRules: [
      {
        effective_from: '2026-01-01',
        effective_to: null,
        rate_percent: 0.5
      }
    ]
  });

  assert.equal(summary.customerCashRevenueIdr, 35000);
  assert.equal(summary.nonRevenueCreditsIdr, 5000);
  assert.equal(summary.ownerCapitalIdr, 200000);
  assert.equal(summary.operationalExpenseIdr, 0);
  assert.equal(summary.taxableBaseIdr, 35000);
  assert.equal(summary.estimatedTaxIdr, 175);
  assert.equal(summary.jobValueIdr, 12000);
  assert.equal(summary.aiRedrawCount, 1);
  assert.equal(summary.readyTraceCount, 1);
});

test('tax rule lookup follows historical effective dates', () => {
  const rules = [
    { effective_from: '2026-04-22', effective_to: null, rate_percent: 0.6 },
    { effective_from: '2026-01-01', effective_to: '2026-04-21', rate_percent: 0.5 }
  ];

  assert.equal(findApplicableTaxRule('2026-03-01T09:00:00.000Z', rules)?.rate_percent, 0.5);
  assert.equal(findApplicableTaxRule('2026-05-01T09:00:00.000Z', rules)?.rate_percent, 0.6);
});

test('finance transaction filters can narrow by source category and user email', () => {
  const transactions = [
    normalizeManualPaymentTransaction({
      id: 'manual-1',
      user_email: 'buyer@example.com',
      amount_idr: 10000,
      approved_at: '2026-07-02T10:00:00.000Z'
    }),
    normalizeLedgerTransaction(
      {
        id: 'ledger-1',
        amount_idr: 5000,
        reason: 'signup_free_credit',
        created_at: '2026-07-03T10:00:00.000Z'
      },
      'new@example.com',
      ''
    )
  ];

  assert.equal(filterFinanceTransactions(transactions, { source: 'manual_payment' }).length, 1);
  assert.equal(filterFinanceTransactions(transactions, { category: 'promo_bonus' }).length, 1);
  assert.equal(filterFinanceTransactions(transactions, { userEmail: 'buyer@' }).length, 1);
});

test('finance csv export renders summary and transaction sections', () => {
  const summaryCsv = buildFinanceCsv('summary', {
    summary: {
      customerCashRevenueIdr: 10000,
      estimatedTaxIdr: 50
    }
  });
  assert.match(summaryCsv, /customerCashRevenueIdr,10000/);
  assert.match(summaryCsv, /estimatedTaxIdr,50/);

  const transactionCsv = buildFinanceCsv('transactions', {
    transactions: [
      {
        occurredAt: '2026-07-02T10:00:00.000Z',
        source: 'manual_payment',
        category: 'customer_cash_revenue',
        direction: 'in',
        amountIdr: 10000,
        taxable: true,
        reviewRequired: false,
        userEmail: 'buyer@example.com',
        reference: 'ORD-1',
        note: '',
        status: 'approved'
      }
    ]
  });
  assert.match(transactionCsv, /manual_payment/);
  assert.match(transactionCsv, /buyer@example.com/);
});
