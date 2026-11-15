import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMidtransAuthHeader, buildMidtransSnapPayload, mapMidtransTransactionState, syncMidtransPaymentTransaction, verifyMidtransSignature } from './index.js';
import { creditBalance, createPaymentTransaction, findLedgerByReference, insertLedger } from './db.js';
import { createTestEnv, createTestUser } from './test-helpers.mjs';

async function sha512Hex(value) {
  const bytes = new TextEncoder().encode(String(value || ''));
  const digest = await crypto.subtle.digest('SHA-512', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

test('Midtrans auth header uses basic auth with server key', () => {
  const header = buildMidtransAuthHeader({ MIDTRANS_SERVER_KEY: 'SB-Mid-server-123' });
  assert.equal(header, `Basic ${btoa('SB-Mid-server-123:')}`);
});

test('Midtrans snap payload includes amount, customer details, and finish callback', () => {
  const payload = buildMidtransSnapPayload({
    orderId: 'mt-123',
    amountIdr: 25000,
    finishUrl: 'https://example.com/?midtrans_return=1&midtrans_order_id=mt-123',
    user: {
      id: 'user-1',
      email: 'user@example.com',
      user_metadata: { full_name: 'User Test' }
    },
    profile: {
      id: 'user-1',
      full_name: 'User Test'
    }
  });

  assert.equal(payload.transaction_details.order_id, 'mt-123');
  assert.equal(payload.transaction_details.gross_amount, 25000);
  assert.equal(payload.item_details[0].price, 25000);
  assert.equal(payload.customer_details.email, 'user@example.com');
  assert.equal(payload.callbacks.finish, 'https://example.com/?midtrans_return=1&midtrans_order_id=mt-123');
});

test('Midtrans signature verification accepts valid signature', async () => {
  const env = { MIDTRANS_SERVER_KEY: 'SB-Mid-server-123' };
  const notification = {
    order_id: 'mt-123',
    status_code: '200',
    gross_amount: '25000.00'
  };
  notification.signature_key = await sha512Hex(`${notification.order_id}${notification.status_code}${notification.gross_amount}${env.MIDTRANS_SERVER_KEY}`);

  assert.equal(await verifyMidtransSignature(notification, env), true);
  assert.equal(await verifyMidtransSignature({ ...notification, signature_key: 'invalid' }, env), false);
});

test('Midtrans transaction mapping only credits settlement or accepted capture', () => {
  const settled = mapMidtransTransactionState({
    transaction_status: 'settlement',
    gross_amount: '30000.00',
    payment_type: 'bank_transfer',
    transaction_id: 'txn-1'
  });
  assert.equal(settled.provider, 'midtrans');
  assert.equal(settled.status, 'settlement');
  assert.equal(settled.grossAmount, 30000);
  assert.equal(settled.paymentType, 'bank_transfer');
  assert.equal(settled.externalTransactionId, 'txn-1');
  assert.equal(settled.creditEligible, true);
  assert.equal(settled.isFinal, true);
  assert.match(settled.paidAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(settled.expiredAt, null);

  const challenged = mapMidtransTransactionState({
    transaction_status: 'capture',
    fraud_status: 'challenge',
    gross_amount: '30000.00'
  });
  assert.equal(challenged.creditEligible, false);
  assert.equal(challenged.isFinal, false);
});

test('Midtrans payment sync stays idempotent when duplicate ledger insert happens', async () => {
  const env = createTestEnv();
  await createTestUser(env, { id: 'user-1', email: 'user@example.com' });
  const payment = await createPaymentTransaction(env, {
    id: 'payment-1',
    user_id: 'user-1',
    provider: 'midtrans',
    order_id: 'mt-123',
    amount_idr: 25000,
    status: 'pending',
    credited_ledger_id: null
  });

  // Simulasikan race: proses lain sudah menyisipkan baris ledger, tetapi lookup pertama
  // belum melihatnya sehingga insert menabrak unique index asli SQLite.
  await insertLedger(env, {
    userId: 'user-1',
    amountIdr: 25000,
    kind: 'credit',
    reason: 'midtrans_payment',
    referenceId: 'payment-1',
    createdBy: 'user-1'
  });
  const existingLedger = await findLedgerByReference(env, 'payment-1', 'midtrans_payment');

  let ledgerLookupCount = 0;
  let ledgerInsertAttempts = 0;
  const originalPrepare = env.DB.prepare.bind(env.DB);
  env.DB.prepare = (sql) => {
    const statement = originalPrepare(sql);
    if (sql.includes('FROM credit_ledger WHERE reference_id')) {
      const originalFirst = statement.first.bind(statement);
      statement.first = async (...args) => {
        ledgerLookupCount += 1;
        if (ledgerLookupCount === 1) return null;
        return originalFirst(...args);
      };
    }
    if (sql.startsWith('INSERT INTO credit_ledger')) {
      const originalRun = statement.run.bind(statement);
      statement.run = async (...args) => {
        ledgerInsertAttempts += 1;
        return originalRun(...args);
      };
    }
    return statement;
  };

  const sourceData = {
    transaction_status: 'settlement',
    status_code: '200',
    gross_amount: '25000.00',
    payment_type: 'bank_transfer',
    transaction_id: 'txn-1',
    settlement_time: '2026-07-01 10:00:00'
  };

  const updated = await syncMidtransPaymentTransaction(env, payment, sourceData, { createdBy: 'user-1' });
  assert.equal(updated.credited_ledger_id, existingLedger.id);
  assert.equal(updated.status, 'settlement');
  assert.equal(ledgerLookupCount, 2);
  assert.equal(ledgerInsertAttempts, 1);
  assert.equal(await creditBalance(env, 'user-1'), 25000);
});
