import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BONUS_AMOUNT_IDR = 6000;
const BONUS_REASON = 'signup_free_credit';
const DEFAULT_DUMMY_EMAIL = 'midtrans.dummy@sablon.test';
const DEFAULT_DUMMY_PASSWORD = 'MidtransDummy#2026';
const DEFAULT_DUMMY_FULL_NAME = 'Midtrans Dummy';

function parseEnvFile(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const values = {};
  for (const line of lines) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
    const [key, ...rest] = line.split('=');
    values[key.trim()] = rest.join('=').trim();
  }
  return values;
}

function requireValue(values, key) {
  const value = values[key];
  if (!value) {
    throw new Error(`${key} tidak ditemukan di .env`);
  }
  return value;
}

async function supabaseRequest(baseUrl, serviceRoleKey, requestPath, { method = 'GET', body, prefer } = {}) {
  const response = await fetch(`${baseUrl}${requestPath}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Supabase request failed: ${response.status}`);
  }
  return data;
}

async function waitForProfile(baseUrl, serviceRoleKey, email, attempts = 10) {
  const encodedEmail = encodeURIComponent(email);
  for (let index = 0; index < attempts; index += 1) {
    const rows = await supabaseRequest(
      baseUrl,
      serviceRoleKey,
      `/rest/v1/profiles?select=id,email,is_unlimited&email=eq.${encodedEmail}&limit=1`
    );
    if (rows?.[0]) return rows[0];
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return null;
}

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, '..', '..');
const envFile = path.join(projectRoot, '.env');
const envValues = { ...parseEnvFile(envFile), ...process.env };

const baseUrl = requireValue(envValues, 'SUPABASE_URL').replace(/\/+$/, '');
const serviceRoleKey = requireValue(envValues, 'SUPABASE_SERVICE_ROLE_KEY');
const dummyEmail = envValues.MIDTRANS_DUMMY_EMAIL || DEFAULT_DUMMY_EMAIL;
const dummyPassword = envValues.MIDTRANS_DUMMY_PASSWORD || DEFAULT_DUMMY_PASSWORD;
const dummyFullName = envValues.MIDTRANS_DUMMY_FULL_NAME || DEFAULT_DUMMY_FULL_NAME;

const profiles = await supabaseRequest(baseUrl, serviceRoleKey, '/rest/v1/profiles?select=id,email,is_unlimited');
const bonusRows = await supabaseRequest(
  baseUrl,
  serviceRoleKey,
  `/rest/v1/credit_ledger?select=user_id,reason&reason=eq.${BONUS_REASON}`
);
const bonusUserIds = new Set(bonusRows.map((row) => row.user_id));

let dummyProfile = profiles.find((profile) => profile.email === dummyEmail) || null;
if (!dummyProfile) {
  await supabaseRequest(baseUrl, serviceRoleKey, '/auth/v1/admin/users', {
    method: 'POST',
    body: {
      email: dummyEmail,
      password: dummyPassword,
      email_confirm: true,
      user_metadata: {
        full_name: dummyFullName
      }
    }
  });
  dummyProfile = await waitForProfile(baseUrl, serviceRoleKey, dummyEmail);
  if (!dummyProfile) {
    throw new Error(`Akun dummy berhasil dibuat di Auth tetapi profile belum muncul untuk ${dummyEmail}`);
  }
}

const bonusPayload = [];
for (const profile of [...profiles, dummyProfile].filter(Boolean)) {
  if (bonusUserIds.has(profile.id)) continue;
  bonusPayload.push({
    user_id: profile.id,
    amount_idr: BONUS_AMOUNT_IDR,
    kind: 'credit',
    reason: BONUS_REASON,
    created_by: profile.id,
    metadata: {
      source: profile.email === dummyEmail ? 'midtrans_dummy_bonus' : 'backfill_signup_bonus',
      freeCredits: 3,
      unitPriceIdr: 2000
    }
  });
  bonusUserIds.add(profile.id);
}

let insertedBonusCount = 0;
if (bonusPayload.length > 0) {
  const inserted = await supabaseRequest(baseUrl, serviceRoleKey, '/rest/v1/credit_ledger?select=id,user_id', {
    method: 'POST',
    prefer: 'return=representation',
    body: bonusPayload
  });
  insertedBonusCount = inserted.length;
}

const dummyLedger = await supabaseRequest(
  baseUrl,
  serviceRoleKey,
  `/rest/v1/credit_ledger?select=amount_idr&user_id=eq.${encodeURIComponent(dummyProfile.id)}`
);
const dummyBalanceIdr = dummyLedger.reduce((sum, row) => sum + (Number(row.amount_idr) || 0), 0);

console.log(
  JSON.stringify(
    {
      dummyEmail,
      dummyPassword,
      dummyUserId: dummyProfile.id,
      insertedBonusCount,
      totalProfilesSeen: profiles.length,
      dummyBalanceIdr
    },
    null,
    2
  )
);
