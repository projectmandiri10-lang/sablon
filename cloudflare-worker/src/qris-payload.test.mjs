import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildDynamicQrisPayload,
  crc16CcittFalse,
  isValidQrisPayload,
  parseQrisTlv,
  serializeQrisTlv
} from '../../shared/qrisPayload.js';

const STATIC_ENTRIES = [
  { tag: '00', value: '01' },
  { tag: '01', value: '11' },
  { tag: '26', value: '0016COM.NOBUBANK.WWW01189360050300000873620214516278328362610303UMI' },
  { tag: '51', value: '0014ID.CO.QRIS.WWW0215ID10243227383620303UMI' },
  { tag: '52', value: '5499' },
  { tag: '53', value: '360' },
  { tag: '58', value: 'ID' },
  { tag: '59', value: 'NAMA TOKO' },
  { tag: '60', value: 'JAKARTA' },
  { tag: '61', value: '12340' },
  { tag: '62', value: '0703A01' }
];

function buildStaticPayload(entries = STATIC_ENTRIES) {
  const body = `${serializeQrisTlv(entries)}6304`;
  return `${body}${crc16CcittFalse(body)}`;
}

test('crc16 ccitt-false matches the standard check vector', () => {
  assert.equal(crc16CcittFalse('123456789'), '29B1');
});

test('qris tlv parse and serialize roundtrip keeps every tag', () => {
  const payload = buildStaticPayload();
  const entries = parseQrisTlv(payload);
  assert.deepEqual(entries.slice(0, -1), STATIC_ENTRIES);
  assert.equal(entries[entries.length - 1].tag, '63');
  assert.equal(serializeQrisTlv(entries), payload);
});

test('qris tlv parser rejects malformed payloads', () => {
  assert.throws(() => parseQrisTlv(''), /kosong/);
  assert.throws(() => parseQrisTlv('0002010102'), /terpotong/);
  assert.throws(() => parseQrisTlv('00020101XX11'), /numerik/);
  assert.throws(() => parseQrisTlv('0002015910ABC'), /terpotong/);
});

test('qris payload validator accepts valid static payload and rejects broken ones', () => {
  const payload = buildStaticPayload();
  assert.equal(isValidQrisPayload(payload), true);
  assert.equal(isValidQrisPayload(`${payload.slice(0, -4)}${payload.slice(-4).toLowerCase()}`), true);
  assert.equal(isValidQrisPayload(''), false);
  assert.equal(isValidQrisPayload(`${payload.slice(0, -4)}0000`), false);
  assert.equal(isValidQrisPayload(payload.slice(0, -8)), false);
  assert.equal(isValidQrisPayload(`000202${payload.slice(4)}`), false);
});

test('dynamic qris payload embeds exact amount with valid crc and dynamic initiation', () => {
  const dynamic = buildDynamicQrisPayload(buildStaticPayload(), 10023);
  assert.equal(isValidQrisPayload(dynamic), true);

  const entries = parseQrisTlv(dynamic);
  const byTag = Object.fromEntries(entries.map((entry) => [entry.tag, entry.value]));
  assert.equal(byTag['01'], '12');
  assert.equal(byTag['54'], '10023');
  assert.equal(byTag['26'], STATIC_ENTRIES.find((entry) => entry.tag === '26').value);
  assert.equal(byTag['51'], STATIC_ENTRIES.find((entry) => entry.tag === '51').value);
  assert.equal(byTag['59'], 'NAMA TOKO');
  assert.equal(entries[entries.length - 1].tag, '63');

  const tags = entries.map((entry) => entry.tag);
  assert.deepEqual(tags, [...tags].sort());
  assert.equal(tags.indexOf('54'), tags.indexOf('53') + 1);
});

test('dynamic qris payload replaces an existing amount tag', () => {
  const withAmount = buildStaticPayload([
    ...STATIC_ENTRIES.slice(0, 6),
    { tag: '54', value: '5000' },
    ...STATIC_ENTRIES.slice(6)
  ]);
  const dynamic = buildDynamicQrisPayload(withAmount, 20007);
  const entries = parseQrisTlv(dynamic);
  const amountEntries = entries.filter((entry) => entry.tag === '54');
  assert.equal(amountEntries.length, 1);
  assert.equal(amountEntries[0].value, '20007');
  assert.equal(isValidQrisPayload(dynamic), true);
});

test('dynamic qris payload inserts initiation tag when missing', () => {
  const withoutInitiation = buildStaticPayload(STATIC_ENTRIES.filter((entry) => entry.tag !== '01'));
  const dynamic = buildDynamicQrisPayload(withoutInitiation, 3000);
  const entries = parseQrisTlv(dynamic);
  assert.equal(entries[0].tag, '00');
  assert.equal(entries[1].tag, '01');
  assert.equal(entries[1].value, '12');
  assert.equal(isValidQrisPayload(dynamic), true);
});

test('dynamic qris payload rejects invalid amounts', () => {
  const payload = buildStaticPayload();
  for (const amount of [0, -5, 1.5, Number.NaN, 'abc', 1000000000000]) {
    assert.throws(() => buildDynamicQrisPayload(payload, amount), /Nominal/);
  }
});

test('dynamic qris payload rejects static payload with broken crc', () => {
  const payload = buildStaticPayload();
  assert.throws(() => buildDynamicQrisPayload(`${payload.slice(0, -4)}FFFF`, 5000), /tidak valid/);
  assert.throws(() => buildDynamicQrisPayload('', 5000), /tidak valid/);
});

test('dynamic qris payload conversion is deterministic', () => {
  const payload = buildStaticPayload();
  assert.equal(buildDynamicQrisPayload(payload, 10023), buildDynamicQrisPayload(payload, 10023));
});