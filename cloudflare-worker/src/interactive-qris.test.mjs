import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker, { allocateInteractiveQrisPaymentAmount, extractInteractiveQrisAmountCandidates } from './index.js';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

test('interactive qris amount allocator skips already used payable amounts', () => {
  const allocation = allocateInteractiveQrisPaymentAmount(
    10000,
    [
      { amount_idr: 10001 },
      { amount_idr: 10002 },
      { amount_idr: 10003 }
    ],
    2
  );

  assert.deepEqual(allocation, {
    displayAmountIdr: 10004,
    uniqueCode: 4
  });
});

test('interactive qris amount candidate parser reads Indonesian currency text', () => {
  const candidates = extractInteractiveQrisAmountCandidates({
    title: 'InterActive QRIS',
    text: 'Pembayaran QRIS sukses sebesar Rp 10.237 pada merchant A',
    raw: { amount: 'IDR 10.237' }
  });

  assert.deepEqual(candidates, [10237]);
});

test('app config exposes interactive qris availability when env and public setting are ready', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input) => {
    const url = String(input);

    if (url.includes('/rest/v1/app_settings?select=key,value,is_public&is_public=eq.true&order=key.asc')) {
      return jsonResponse([
        {
          key: 'interactive_qris_payment',
          value: {
            enabled: true,
            merchantName: 'Merchant QRIS',
            qrImageUrl: 'https://cdn.example/qris.png',
            instructions: 'Bayar sesuai nominal unik.',
            contact: 'WA Admin'
          },
          is_public: true
        }
      ]);
    }

    if (url.includes('/rest/v1/app_settings?select=key,value,is_public,description,updated_at&key=eq.ai_redraw_model&limit=1')) {
      return jsonResponse([]);
    }

    throw new Error(`Unexpected fetch ${url}`);
  };

  try {
    const env = {
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
      INTERACTIVE_QRIS_WEBHOOK_SECRET: 'secret-123',
      INTERACTIVE_QRIS_SOURCE_PACKAGE: 'com.interactive.qrisid',
      INTERACTIVE_QRIS_MIN_AMOUNT_IDR: '2000',
      INTERACTIVE_QRIS_UNIQUE_DIGITS: '2'
    };

    const response = await worker.fetch(new Request('https://worker.example/api/app-config'), env);
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.equal(data.settings.interactive_qris_payment.enabled, true);
    assert.equal(data.features.interactiveQrisAvailable, true);
    assert.equal(data.features.interactiveQrisMinimumAmountIdr, 2000);
    assert.equal(data.features.interactiveQrisUniqueDigits, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('interactive qris checkout expires stale rows and creates pending unique payment', async () => {
  const originalFetch = globalThis.fetch;
  let expiredRowsPatched = 0;
  let createdBody = null;

  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);

    if (url.endsWith('/auth/v1/user')) {
      return jsonResponse({
        id: 'user-1',
        email: 'user@example.com',
        user_metadata: { full_name: 'User Test' }
      });
    }

    if (url.includes('/rest/v1/profiles?id=eq.user-1&select=id,email,full_name,role,is_unlimited,is_active,deleted_at,created_at')) {
      return jsonResponse([
        {
          id: 'user-1',
          email: 'user@example.com',
          full_name: 'User Test',
          role: 'user',
          is_unlimited: false,
          is_active: true,
          deleted_at: null,
          created_at: '2026-07-11T09:00:00.000Z'
        }
      ]);
    }

    if (url.includes('/rest/v1/app_settings?select=key,value,is_public,description,updated_at&key=eq.interactive_qris_payment&limit=1')) {
      return jsonResponse([
        {
          key: 'interactive_qris_payment',
          value: {
            enabled: true,
            merchantName: 'Merchant QRIS',
            qrImageUrl: 'https://cdn.example/qris.png',
            instructions: 'Bayar sesuai nominal unik.',
            contact: 'WA Admin'
          },
          is_public: true
        }
      ]);
    }

    if (url.includes('/rest/v1/payment_transactions?provider=eq.interactive_qris&status=eq.pending&expired_at=lt.') && init.method === 'PATCH') {
      expiredRowsPatched += 1;
      return jsonResponse([]);
    }

    if (url.includes('/rest/v1/payment_transactions?select=id,user_id,provider,order_id,external_transaction_id,amount_idr,base_amount_idr,unique_code,currency,status,payment_type,redirect_url,credited_ledger_id,paid_at,expired_at,created_at,updated_at&provider=eq.interactive_qris&status=eq.pending&expired_at=gt.')) {
      return jsonResponse([
        {
          id: 'existing-1',
          provider: 'interactive_qris',
          amount_idr: 10001,
          status: 'pending',
          expired_at: '2099-07-11T10:30:00.000Z'
        }
      ]);
    }

    if (url.endsWith('/rest/v1/payment_transactions?select=*') && init.method === 'POST') {
      createdBody = JSON.parse(init.body);
      return jsonResponse([
        {
          id: 'payment-1',
          ...createdBody,
          created_at: '2026-07-11T10:00:00.000Z',
          updated_at: '2026-07-11T10:00:00.000Z'
        }
      ]);
    }

    throw new Error(`Unexpected fetch ${url}`);
  };

  try {
    const env = {
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
      INTERACTIVE_QRIS_WEBHOOK_SECRET: 'secret-123',
      INTERACTIVE_QRIS_SOURCE_PACKAGE: 'com.interactive.qrisid'
    };
    const request = new Request('https://worker.example/api/payments/interactive-qris/checkout', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer user-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ amountIdr: 10000 })
    });

    const response = await worker.fetch(request, env);
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.equal(expiredRowsPatched, 1);
    assert.equal(createdBody.provider, 'interactive_qris');
    assert.equal(createdBody.amount_idr, 10002);
    assert.equal(createdBody.base_amount_idr, 10000);
    assert.equal(createdBody.unique_code, 2);
    assert.equal(createdBody.payment_type, 'qris_static_unique');
    assert.match(createdBody.order_id, /^iq-/);
    assert.equal(data.instruction.displayAmountIdr, 10002);
    assert.equal(data.instruction.baseAmountIdr, 10000);
    assert.equal(data.instruction.uniqueCode, '02');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('interactive qris webhook rejects invalid secret and ignores wrong package name', async () => {
  const env = {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    INTERACTIVE_QRIS_WEBHOOK_SECRET: 'secret-123',
    INTERACTIVE_QRIS_SOURCE_PACKAGE: 'com.interactive.qrisid'
  };

  const invalidSecretResponse = await worker.fetch(
    new Request('https://worker.example/api/payments/interactive-qris/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packageName: 'com.interactive.qrisid' })
    }),
    env
  );
  assert.equal(invalidSecretResponse.status, 401);

  const wrongPackageResponse = await worker.fetch(
    new Request('https://worker.example/api/payments/interactive-qris/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-interactive-qris-secret': 'secret-123'
      },
      body: JSON.stringify({ packageName: 'com.other.app' })
    }),
    env
  );
  const wrongPackageData = await wrongPackageResponse.json();
  assert.equal(wrongPackageResponse.status, 200);
  assert.equal(wrongPackageData.ignored, true);
  assert.equal(wrongPackageData.reason, 'unexpected_package');
});

test('interactive qris webhook settles matching payment without double credit', async () => {
  const originalFetch = globalThis.fetch;
  let ledgerLookupCount = 0;

  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);

    if (url.includes('/rest/v1/payment_transactions?provider=eq.interactive_qris&status=eq.pending&expired_at=lt.') && init.method === 'PATCH') {
      return jsonResponse([]);
    }

    if (url.includes('/rest/v1/payment_transactions?select=id,user_id,provider,order_id,external_transaction_id,amount_idr,base_amount_idr,unique_code,currency,status,payment_type,redirect_url,credited_ledger_id,paid_at,expired_at,created_at,updated_at&provider=eq.interactive_qris&status=eq.pending&expired_at=gt.')) {
      return jsonResponse([
        {
          id: 'payment-1',
          user_id: 'user-1',
          provider: 'interactive_qris',
          order_id: 'iq-123',
          amount_idr: 10237,
          base_amount_idr: 10000,
          unique_code: 237,
          status: 'pending',
          payment_type: 'qris_static_unique',
          credited_ledger_id: null,
          expired_at: '2099-07-11T10:30:00.000Z'
        }
      ]);
    }

    if (url.includes('/rest/v1/credit_ledger?select=id&reference_id=eq.payment-1&reason=eq.interactive_qris_payment&limit=1')) {
      ledgerLookupCount += 1;
      return jsonResponse(ledgerLookupCount >= 2 ? [{ id: 'ledger-1' }] : []);
    }

    if (url.endsWith('/rest/v1/credit_ledger?select=id') && init.method === 'POST') {
      return new Response(JSON.stringify({ message: 'duplicate key value violates unique constraint "credit_ledger_interactive_qris_reference_unique_idx"' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (url.includes('/rest/v1/payment_transactions?id=eq.payment-1&select=*') && init.method === 'PATCH') {
      const patch = JSON.parse(init.body);
      return jsonResponse([
        {
          id: 'payment-1',
          user_id: 'user-1',
          provider: 'interactive_qris',
          order_id: 'iq-123',
          amount_idr: 10237,
          base_amount_idr: 10000,
          unique_code: 237,
          status: patch.status,
          payment_type: patch.payment_type,
          credited_ledger_id: patch.credited_ledger_id || 'ledger-1',
          paid_at: patch.paid_at,
          expired_at: '2099-07-11T10:30:00.000Z',
          updated_at: '2026-07-11T10:00:01.000Z'
        }
      ]);
    }

    throw new Error(`Unexpected fetch ${url}`);
  };

  try {
    const env = {
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
      INTERACTIVE_QRIS_WEBHOOK_SECRET: 'secret-123',
      INTERACTIVE_QRIS_SOURCE_PACKAGE: 'com.interactive.qrisid'
    };
    const response = await worker.fetch(
      new Request('https://worker.example/api/payments/interactive-qris/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-interactive-qris-secret': 'secret-123'
        },
        body: JSON.stringify({
          packageName: 'com.interactive.qrisid',
          title: 'InterActive QRIS',
          text: 'Pembayaran QRIS sukses sebesar Rp 10.237',
          postedAt: '2026-07-11T10:00:00.000Z',
          raw: {
            notificationId: 'notif-1'
          }
        })
      }),
      env
    );
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.equal(data.payment.status, 'settlement');
    assert.equal(data.payment.credited_ledger_id, 'ledger-1');
    assert.equal(ledgerLookupCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
