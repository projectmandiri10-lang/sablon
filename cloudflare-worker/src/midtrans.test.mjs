import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMidtransAuthHeader, buildMidtransSnapPayload, mapMidtransTransactionState, syncMidtransPaymentTransaction, verifyMidtransSignature } from './index.js';

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
  const originalFetch = globalThis.fetch;
  const calls = [];
  let ledgerLookupCount = 0;

  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, method: init.method || 'GET' });

    if (url.includes('/rest/v1/credit_ledger?select=id&reference_id=eq.payment-1&reason=eq.midtrans_payment&limit=1')) {
      ledgerLookupCount += 1;
      const body = ledgerLookupCount >= 2 ? [{ id: 'ledger-1' }] : [];
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url.endsWith('/rest/v1/credit_ledger?select=id') && init.method === 'POST') {
      return new Response(JSON.stringify({ message: 'duplicate key value violates unique constraint "credit_ledger_midtrans_reference_unique_idx"' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (url.includes('/rest/v1/payment_transactions?id=eq.payment-1&select=*') && init.method === 'PATCH') {
      const patch = JSON.parse(init.body);
      return new Response(
        JSON.stringify([
          {
            id: 'payment-1',
            user_id: 'user-1',
            provider: 'midtrans',
            order_id: 'mt-123',
            amount_idr: 25000,
            status: patch.status,
            payment_type: patch.payment_type,
            credited_ledger_id: patch.credited_ledger_id || 'ledger-1',
            paid_at: patch.paid_at,
            expired_at: patch.expired_at,
            updated_at: new Date().toISOString()
          }
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    throw new Error(`Unexpected fetch ${url}`);
  };

  try {
    const env = {
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role'
    };
    const payment = {
      id: 'payment-1',
      user_id: 'user-1',
      order_id: 'mt-123',
      amount_idr: 25000,
      credited_ledger_id: null
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
    assert.equal(updated.credited_ledger_id, 'ledger-1');
    assert.equal(updated.status, 'settlement');
    assert.equal(ledgerLookupCount, 2);
    assert.equal(
      calls.filter((entry) => entry.url.endsWith('/rest/v1/credit_ledger?select=id') && entry.method === 'POST').length,
      1
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
