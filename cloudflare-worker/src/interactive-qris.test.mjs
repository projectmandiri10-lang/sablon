import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker, { allocateInteractiveQrisPaymentAmount, extractInteractiveQrisAmountCandidates } from './index.js';
import { creditBalance, createPaymentTransaction, findLedgerByReference, getAppSetting, insertLedger, listInteractiveQrisWebhookLogs, listUserAutomaticPayments, upsertAppSetting } from './db.js';
import { authHeaderFor, createTestEnv, createTestUser } from './test-helpers.mjs';
import { crc16CcittFalse, isValidQrisPayload, parseQrisTlv, serializeQrisTlv } from '../../shared/qrisPayload.js';

function buildStaticQrisFixture() {
  const body = `${serializeQrisTlv([
    { tag: '00', value: '01' },
    { tag: '01', value: '11' },
    { tag: '26', value: '0016COM.NOBUBANK.WWW01189360050300000873620214516278328362610303UMI' },
    { tag: '51', value: '0014ID.CO.QRIS.WWW0215ID10243227383620303UMI' },
    { tag: '52', value: '5499' },
    { tag: '53', value: '360' },
    { tag: '58', value: 'ID' },
    { tag: '59', value: 'NAMA TOKO' },
    { tag: '60', value: 'JAKARTA' },
    { tag: '61', value: '12340' }
  ])}6304`;
  return `${body}${crc16CcittFalse(body)}`;
}

function qrisTestEnv(overrides = {}) {
  return createTestEnv({
    INTERACTIVE_QRIS_WEBHOOK_SECRET: 'secret-123',
    INTERACTIVE_QRIS_SOURCE_PACKAGE: 'com.interactive.qrisid',
    INTERACTIVE_QRIS_MIN_AMOUNT_IDR: '2000',
    INTERACTIVE_QRIS_UNIQUE_DIGITS: '2',
    ...overrides
  });
}

async function seedQrisSetting(env, valueOverrides = {}) {
  return upsertAppSetting(env, {
    key: 'interactive_qris_payment',
    isPublic: true,
    value: {
      enabled: true,
      merchantName: 'Merchant QRIS',
      qrImageUrl: 'https://cdn.example/qris.png',
      instructions: 'Bayar sesuai nominal unik.',
      contact: 'WA Admin',
      closedHours: { enabled: false },
      ...valueOverrides
    }
  });
}

async function seedQrisPayment(env, overrides = {}) {
  return createPaymentTransaction(env, {
    user_id: 'user-1',
    provider: 'interactive_qris',
    order_id: 'iq-123',
    amount_idr: 10237,
    base_amount_idr: 10000,
    unique_code: 237,
    currency: 'IDR',
    status: 'pending',
    payment_type: 'qris_static_unique',
    credited_ledger_id: null,
    expired_at: '2099-07-11T10:30:00.000Z',
    ...overrides
  });
}

function webhookRequest(body, { secret = 'secret-123' } = {}) {
  return new Request('https://worker.example/api/payments/interactive-qris/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-interactive-qris-secret': secret
    },
    body: typeof body === 'string' ? body : JSON.stringify(body)
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
  const env = qrisTestEnv();
  await seedQrisSetting(env, {
    closedHours: {
      enabled: true,
      timezone: 'Asia/Jakarta',
      start: '22:00',
      end: '05:00',
      message: 'QRIS tutup malam.'
    }
  });

  const response = await worker.fetch(new Request('https://worker.example/api/app-config'), env);
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.settings.interactive_qris_payment.enabled, true);
  assert.equal(data.features.interactiveQrisAvailable, true);
  assert.equal(data.features.interactiveQrisMinimumAmountIdr, 2000);
  assert.equal(data.features.interactiveQrisUniqueDigits, 2);
  assert.equal(data.settings.interactive_qris_payment.closedHours.start, '22:00');
});

test('app config keeps interactive qris available even when qr image is not filled yet', async () => {
  const env = qrisTestEnv();
  await seedQrisSetting(env, { qrImageUrl: '' });

  const response = await worker.fetch(new Request('https://worker.example/api/app-config'), env);
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.features.interactiveQrisAvailable, true);
});

test('interactive qris checkout expires stale rows and creates pending unique payment', async () => {
  const env = qrisTestEnv();
  const profile = await createTestUser(env, { id: 'user-1', email: 'user@example.com' });
  await seedQrisSetting(env);
  const stalePayment = await seedQrisPayment(env, {
    order_id: 'iq-stale',
    amount_idr: 10005,
    unique_code: 5,
    expired_at: '2020-01-01T00:00:00.000Z'
  });
  await seedQrisPayment(env, { order_id: 'iq-existing', amount_idr: 10001, unique_code: 1 });

  const request = new Request('https://worker.example/api/payments/interactive-qris/checkout', {
    method: 'POST',
    headers: {
      ...(await authHeaderFor(env, profile)),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ amountIdr: 10000 })
  });

  const response = await worker.fetch(request, env);
  const data = await response.json();

  assert.equal(response.status, 200);
  const refreshedStale = (await listUserAutomaticPayments(env, 'user-1')).find((item) => item.order_id === 'iq-stale');
  assert.equal(refreshedStale.status, 'expired');
  assert.equal(stalePayment.status, 'pending');
  assert.equal(data.payment.provider, 'interactive_qris');
  assert.equal(data.payment.amount_idr, 10002);
  assert.equal(data.payment.base_amount_idr, 10000);
  assert.equal(data.payment.unique_code, 2);
  assert.equal(data.payment.payment_type, 'qris_static_unique');
  assert.match(data.payment.order_id, /^iq-/);
  assert.equal(data.instruction.displayAmountIdr, 10002);
  assert.equal(data.instruction.baseAmountIdr, 10000);
  assert.equal(data.instruction.uniqueCode, '02');
});

test('interactive qris checkout rejects closed hours in Asia Jakarta', async () => {
  const originalDateNow = Date.now;
  const env = qrisTestEnv();
  const profile = await createTestUser(env, { id: 'user-1', email: 'user@example.com' });
  await seedQrisSetting(env, {
    closedHours: {
      enabled: true,
      timezone: 'Asia/Jakarta',
      start: '22:00',
      end: '05:00',
      message: 'QRIS tutup malam.'
    }
  });

  Date.now = () => new Date('2026-07-11T15:30:00.000Z').getTime();

  try {
    const request = new Request('https://worker.example/api/payments/interactive-qris/checkout', {
      method: 'POST',
      headers: {
        ...(await authHeaderFor(env, profile)),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ amountIdr: 10000 })
    });

    const response = await worker.fetch(request, env);
    const data = await response.json();

    assert.equal(response.status, 400);
    assert.equal(data.error, 'QRIS tutup malam.');
  } finally {
    Date.now = originalDateNow;
  }
});

test('interactive qris webhook rejects invalid secret and ignores wrong package name', async () => {
  const env = qrisTestEnv();

  const invalidSecretResponse = await worker.fetch(
    webhookRequest({ packageName: 'com.interactive.qrisid' }, { secret: '' }),
    env
  );
  assert.equal(invalidSecretResponse.status, 401);

  const wrongPackageResponse = await worker.fetch(webhookRequest({ packageName: 'com.other.app' }), env);
  const wrongPackageData = await wrongPackageResponse.json();
  assert.equal(wrongPackageResponse.status, 200);
  assert.equal(wrongPackageData.ignored, true);
  assert.equal(wrongPackageData.reason, 'unexpected_package');
});

test('interactive qris webhook settles matching payment without double credit', async () => {
  const env = qrisTestEnv();
  await createTestUser(env, { id: 'user-1', email: 'user@example.com' });
  await seedQrisPayment(env);

  // Simulasikan race: baris ledger sudah ada, tetapi lookup pertama belum
  // melihatnya sehingga insert menabrak unique index asli SQLite.
  const payment = (await listUserAutomaticPayments(env, 'user-1')).find((item) => item.order_id === 'iq-123');
  await insertLedger(env, {
    userId: 'user-1',
    amountIdr: 10237,
    kind: 'credit',
    reason: 'interactive_qris_payment',
    referenceId: payment.id,
    createdBy: 'user-1'
  });
  const existingLedger = await findLedgerByReference(env, payment.id, 'interactive_qris_payment');

  let ledgerLookupCount = 0;
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
    return statement;
  };

  const response = await worker.fetch(
    webhookRequest({
      packageName: 'com.interactive.qrisid',
      title: 'InterActive QRIS',
      text: 'Pembayaran QRIS sukses sebesar Rp 10.237',
      postedAt: '2026-07-11T10:00:00.000Z',
      raw: { notificationId: 'notif-1' }
    }),
    env
  );
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.payment.status, 'settlement');
  assert.equal(data.payment.credited_ledger_id, existingLedger.id);
  assert.equal(ledgerLookupCount, 2);
  assert.equal(await creditBalance(env, 'user-1'), 10237);
});

test('interactive qris webhook can recover malformed multiline MacroDroid JSON payload', async () => {
  const env = qrisTestEnv();
  await createTestUser(env, { id: 'user-1', email: 'user@example.com' });
  await seedQrisPayment(env, {
    amount_idr: 2001,
    base_amount_idr: 2000,
    unique_code: 1,
    expired_at: '2099-07-12T22:00:00.000Z'
  });

  const malformedBody = `{
  "packageName": "com.interactive.qrisid",
  "title": "Transaksi InterActive QRIS",
  "text": "Pembayaran QRIS sebesar Rp 2.001
6285156861485 - ShopeePay telah diterima",
  "raw": "Pembayaran QRIS sebesar Rp 2.001
6285156861485 - ShopeePay telah diterima"
}`;

  const response = await worker.fetch(webhookRequest(malformedBody), env);
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.payment.status, 'settlement');
  assert.ok(data.payment.credited_ledger_id);
  assert.equal(await creditBalance(env, 'user-1'), 2001);
});

test('admin can upload interactive qris image to storage bucket', async () => {
  const env = qrisTestEnv();
  const admin = await createTestUser(env, { id: 'admin-1', email: 'admin@example.com', role: 'superuser', isUnlimited: true });

  const form = new FormData();
  form.append('image', new File([new Uint8Array([1, 2, 3])], 'qris.png', { type: 'image/png' }));
  const request = new Request('https://worker.example/api/admin/settings/interactive-qris-image', {
    method: 'POST',
    headers: await authHeaderFor(env, admin),
    body: form
  });

  const response = await worker.fetch(request, env);
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.match(data.path, /^app-assets\/qris\//);
  assert.match(data.url, /\/api\/assets\/example-jobs\/app-assets\/qris\//);
  const storedKeys = [...env.ASSETS.objects.keys()];
  assert.equal(storedKeys.length, 1);
  assert.match(storedKeys[0], /^example-jobs\/app-assets\/qris\//);
});

test('admin interactive qris image upload rejects non-image mime types', async () => {
  const env = qrisTestEnv();
  const admin = await createTestUser(env, { id: 'admin-1', email: 'admin@example.com', role: 'superuser', isUnlimited: true });

  const form = new FormData();
  form.append('image', new File([new Uint8Array([1, 2, 3])], 'qris.pdf', { type: 'application/pdf' }));
  const request = new Request('https://worker.example/api/admin/settings/interactive-qris-image', {
    method: 'POST',
    headers: await authHeaderFor(env, admin),
    body: form
  });

  const response = await worker.fetch(request, env);
  const data = await response.json();

  assert.equal(response.status, 400);
  assert.equal(data.error, 'Format gambar QRIS harus PNG, JPG, JPEG, atau WEBP.');
  assert.equal(env.ASSETS.objects.size, 0);
});

test('interactive qris checkout returns dynamic payload when static qr payload is configured', async () => {
  const env = qrisTestEnv();
  const profile = await createTestUser(env, { id: 'user-1', email: 'user@example.com' });
  const staticPayload = buildStaticQrisFixture();
  await seedQrisSetting(env, { qrPayload: staticPayload });

  const request = new Request('https://worker.example/api/payments/interactive-qris/checkout', {
    method: 'POST',
    headers: {
      ...(await authHeaderFor(env, profile)),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ amountIdr: 10000 })
  });

  const response = await worker.fetch(request, env);
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.payment.amount_idr, 10001);
  assert.equal(data.payment.raw_create_response.dynamicQris, true);
  assert.equal(data.instruction.displayAmountIdr, 10001);
  assert.equal(isValidQrisPayload(data.instruction.qrisPayload), true);

  const entries = parseQrisTlv(data.instruction.qrisPayload);
  const byTag = Object.fromEntries(entries.map((entry) => [entry.tag, entry.value]));
  assert.equal(byTag['01'], '12');
  assert.equal(byTag['54'], '10001');
  assert.equal(byTag['59'], 'NAMA TOKO');
});

test('interactive qris checkout rejects when neither qr image nor payload is configured', async () => {
  const env = qrisTestEnv();
  const profile = await createTestUser(env, { id: 'user-1', email: 'user@example.com' });
  await seedQrisSetting(env, { qrImageUrl: '' });

  const request = new Request('https://worker.example/api/payments/interactive-qris/checkout', {
    method: 'POST',
    headers: {
      ...(await authHeaderFor(env, profile)),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ amountIdr: 10000 })
  });

  const response = await worker.fetch(request, env);
  const data = await response.json();

  assert.equal(response.status, 400);
  assert.equal(data.error, 'QR image atau payload QRIS untuk QRIS otomatis belum diisi.');
});

test('admin settings reject invalid interactive qris static payload', async () => {
  const env = qrisTestEnv();
  const admin = await createTestUser(env, { id: 'admin-1', email: 'admin@example.com', role: 'superuser', isUnlimited: true });
  await seedQrisSetting(env);

  const response = await worker.fetch(
    new Request('https://worker.example/api/admin/settings', {
      method: 'POST',
      headers: {
        ...(await authHeaderFor(env, admin)),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        key: 'interactive_qris_payment',
        value: { enabled: true, qrPayload: 'bukan-payload-qris' }
      })
    }),
    env
  );
  const data = await response.json();

  assert.equal(response.status, 400);
  assert.equal(data.error, 'Payload QRIS statis tidak valid. Pastikan teks EMVCo lengkap dan CRC benar.');
  const saved = await getAppSetting(env, 'interactive_qris_payment');
  assert.equal(saved.value.qrPayload, undefined);
});

test('admin settings accept valid interactive qris static payload', async () => {
  const env = qrisTestEnv();
  const admin = await createTestUser(env, { id: 'admin-1', email: 'admin@example.com', role: 'superuser', isUnlimited: true });
  const staticPayload = buildStaticQrisFixture();

  const response = await worker.fetch(
    new Request('https://worker.example/api/admin/settings', {
      method: 'POST',
      headers: {
        ...(await authHeaderFor(env, admin)),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        key: 'interactive_qris_payment',
        value: { enabled: true, qrPayload: staticPayload }
      })
    }),
    env
  );
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.setting.value.qrPayload, staticPayload);
  const saved = await getAppSetting(env, 'interactive_qris_payment');
  assert.equal(saved.value.qrPayload, staticPayload);
});

test('interactive qris amount parser handles Indonesian decimal cents and adjacent digits', () => {
  const withPhone = extractInteractiveQrisAmountCandidates({
    title: 'InterActive QRIS',
    text: 'Dana masuk sebesar Rp 2.001,00\n085156861485 dari pembeli'
  });
  assert.equal(withPhone.includes(2001), true);
  assert.equal(withPhone.includes(200100), false);

  const plainDot = extractInteractiveQrisAmountCandidates({
    title: 'Transaksi QRIS berhasil',
    text: 'Nominal Rp. 2001,00 telah diterima'
  });
  assert.equal(plainDot.includes(2001), true);
  assert.equal(plainDot.includes(200100), false);
});

test('interactive qris webhook parses form-urlencoded, package_name alias, malformed partial JSON, and logs outcomes', async () => {
  const env = qrisTestEnv();
  await createTestUser(env, { id: 'user-1', email: 'user@example.com' });
  await seedQrisPayment(env, {
    order_id: 'iq-2001',
    amount_idr: 2001,
    base_amount_idr: 2000,
    unique_code: 1
  });

  // 1) Invalid secret should be logged as rejected (without storing secret value)
  const invalidSecretResp = await worker.fetch(
    webhookRequest({ packageName: 'com.interactive.qrisid', text: 'Rp 2.001' }, { secret: 'wrong-secret' }),
    env
  );
  assert.equal(invalidSecretResp.status, 401);

  // 2) Wrong package should be logged as ignored
  const wrongPackageResp = await worker.fetch(
    webhookRequest({ packageName: 'com.whatsapp', text: 'Rp 2.001' }),
    env
  );
  assert.equal(wrongPackageResp.status, 200);

  // 3) Malformed JSON with unescaped quotes + package_name alias + decimal currency settles 2001
  const malformedBody = '{"package_name":"com.interactive.qrisid","title":"InterActive QRIS","text":"Pembayaran "QRIS" masuk Rp 2.001,00\n085156861485"}';
  const settleResp = await worker.fetch(webhookRequest(malformedBody), env);
  const settleData = await settleResp.json();
  assert.equal(settleResp.status, 200);
  assert.equal(settleData.received, true);
  assert.equal(settleData.payment.status, 'settlement');
  assert.equal(settleData.payment.order_id, 'iq-2001');
  assert.equal(await creditBalance(env, 'user-1'), 2001);

  // 4) Unexpanded MacroDroid variable with InterActive QRIS title/text is recognized when pending payment matches
  await seedQrisPayment(env, {
    order_id: 'iq-3002',
    amount_idr: 3002,
    base_amount_idr: 3000,
    unique_code: 2
  });
  const formBody = new URLSearchParams({
    packageName: '{not_app_package}',
    title: 'InterActive QRIS',
    text: 'Pembayaran InterActive QRIS berhasil Rp 3.002,00'
  }).toString();
  const formResp = await worker.fetch(
    new Request('https://worker.example/api/payments/interactive-qris/webhook/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-webhook-secret': 'secret-123'
      },
      body: formBody
    }),
    env
  );
  const formData = await formResp.json();
  assert.equal(formResp.status, 200);
  assert.equal(formData.received, true);
  assert.equal(formData.payment.status, 'settlement');
  assert.equal(formData.payment.order_id, 'iq-3002');
  assert.equal(await creditBalance(env, 'user-1'), 5003);

  const logs = await listInteractiveQrisWebhookLogs(env, 20);
  assert.equal(logs.length, 4);
  assert.equal(logs[0].outcome, 'settled');
  assert.equal(logs[0].matched_order_id, 'iq-3002');
  assert.equal(logs[1].outcome, 'settled');
  assert.equal(logs[1].matched_order_id, 'iq-2001');
  assert.equal(logs[2].outcome, 'ignored');
  assert.equal(logs[2].reason, 'unexpected_package');
  assert.equal(logs[3].outcome, 'rejected');
  assert.equal(logs[3].reason, 'invalid_secret');
  assert.equal(logs[3].secret_valid, false);
});

test('interactive qris webhook GET healthcheck and admin webhook logs + manual settle work for superuser', async () => {
  const env = qrisTestEnv();
  const user = await createTestUser(env, { id: 'user-1', email: 'user@example.com' });
  const admin = await createTestUser(env, { id: 'admin-1', email: 'admin@example.com', role: 'superuser', isUnlimited: true });
  const pending = await seedQrisPayment(env, {
    order_id: 'iq-manual-check',
    amount_idr: 2001,
    base_amount_idr: 2000,
    unique_code: 1
  });

  // Healthcheck GET endpoint
  const pingResp = await worker.fetch(
    new Request('https://worker.example/api/payments/interactive-qris/webhook', { method: 'GET' }),
    env
  );
  const pingData = await pingResp.json();
  assert.equal(pingResp.status, 200);
  assert.equal(pingData.ok, true);

  // Trigger a webhook attempt so logs exist
  await worker.fetch(webhookRequest({ packageName: 'com.interactive.qrisid', text: 'Rp 9.999' }), env);

  // Non-admin blocked from admin endpoints
  const forbiddenLogs = await worker.fetch(
    new Request('https://worker.example/api/admin/qris-webhook-logs', {
      headers: await authHeaderFor(env, user)
    }),
    env
  );
  assert.equal(forbiddenLogs.status, 403);

  // Superuser fetches logs
  const logsResp = await worker.fetch(
    new Request('https://worker.example/api/admin/qris-webhook-logs', {
      headers: await authHeaderFor(env, admin)
    }),
    env
  );
  const logsData = await logsResp.json();
  assert.equal(logsResp.status, 200);
  assert.equal(logsData.logs.length, 1);
  assert.equal(logsData.logs[0].outcome, 'ignored');
  assert.equal(logsData.logs[0].reason, 'payment_not_found');

  // Superuser manually settles pending QRIS payment
  const settleResp = await worker.fetch(
    new Request(`https://worker.example/api/admin/payment-transactions/${pending.id}/settle-qris`, {
      method: 'POST',
      headers: await authHeaderFor(env, admin)
    }),
    env
  );
  const settleData = await settleResp.json();
  assert.equal(settleResp.status, 200);
  assert.equal(settleData.payment.status, 'settlement');
  assert.ok(settleData.payment.credited_ledger_id);
  assert.equal(await creditBalance(env, 'user-1'), 2001);

  // Second settle is idempotent and does not double-credit
  const secondSettleResp = await worker.fetch(
    new Request(`https://worker.example/api/admin/payment-transactions/${pending.id}/settle-qris`, {
      method: 'POST',
      headers: await authHeaderFor(env, admin)
    }),
    env
  );
  const secondSettleData = await secondSettleResp.json();
  assert.equal(secondSettleResp.status, 200);
  assert.equal(secondSettleData.payment.status, 'settlement');
  assert.equal(secondSettleData.payment.credited_ledger_id, settleData.payment.credited_ledger_id);
  assert.equal(await creditBalance(env, 'user-1'), 2001);
});

test('interactive qris webhook supports extended Android notification fields, braces in raw, query fallback, and hardened macro json', async () => {
  const { readFileSync } = await import('node:fs');
  const macroRaw = readFileSync(new URL('../../macrodroid/interactive-qris-relay.macro', import.meta.url), 'utf8');
  const macroDoc = JSON.parse(macroRaw);
  const trigger = macroDoc.macro.m_triggerList[0];
  assert.equal(trigger.m_ignoreOngoing, true);
  assert.equal(trigger.m_supressMultiples, false);
  assert.equal(macroDoc.macro.m_actionList[0].m_classType, 'PauseAction');
  assert.equal(macroDoc.macro.m_actionList[1].m_classType, 'HttpRequestAction');
  assert.equal(macroDoc.macro.m_actionList[1].requestConfig.blockNextAction, true);

  const env = qrisTestEnv();
  await createTestUser(env, { id: 'user-1', email: 'user@example.com' });
  await seedQrisPayment(env, {
    order_id: 'iq-4005',
    amount_idr: 4005,
    base_amount_idr: 4000,
    unique_code: 5
  });

  // Extended subText/ticker/appName with unexpanded tokens + braces inside raw malformed JSON
  const braceRaw =
    '{"packageName":"{not_app_package}","appName":"InterActive QRIS","title":"Pembayaran Masuk","text":"{notification}","subText":"{not_sub_text}","ticker":"Dana Rp 4.005 masuk","raw":"Info {ok} nominal Rp 4.005,00"}';
  const braceResp = await worker.fetch(webhookRequest(braceRaw), env);
  const braceData = await braceResp.json();
  assert.equal(braceResp.status, 200);
  assert.equal(braceData.payment.status, 'settlement');
  assert.equal(braceData.payment.order_id, 'iq-4005');
  assert.equal(await creditBalance(env, 'user-1'), 4005);

  // URL query param fallback when POST body is empty
  await seedQrisPayment(env, {
    order_id: 'iq-5007',
    amount_idr: 5007,
    base_amount_idr: 5000,
    unique_code: 7
  });
  const queryUrl =
    'https://worker.example/api/payments/interactive-qris/webhook?packageName=com.interactive.qrisid&title=InterActive+QRIS&text=Masuk+Rp+5.007';
  const queryResp = await worker.fetch(
    new Request(queryUrl, {
      method: 'POST',
      headers: { 'x-interactive-qris-secret': 'secret-123' }
    }),
    env
  );
  const queryData = await queryResp.json();
  assert.equal(queryResp.status, 200);
  assert.equal(queryData.payment.order_id, 'iq-5007');
  assert.equal(await creditBalance(env, 'user-1'), 9012);
});