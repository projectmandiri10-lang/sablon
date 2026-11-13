export const QRIS_MAX_PAYLOAD_LENGTH = 2048;
const QRIS_MAX_AMOUNT_IDR = 999999999999;

export function crc16CcittFalse(text) {
  const source = String(text || '');
  let crc = 0xffff;
  for (let index = 0; index < source.length; index += 1) {
    crc ^= source.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function parseQrisTlv(payload) {
  const source = String(payload || '').trim();
  if (!source) throw new Error('Payload QRIS kosong.');

  const entries = [];
  let cursor = 0;
  while (cursor < source.length) {
    if (cursor + 4 > source.length) throw new Error('Payload QRIS terpotong: header tag tidak lengkap.');
    const tag = source.slice(cursor, cursor + 2);
    const lengthText = source.slice(cursor + 2, cursor + 4);
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(lengthText)) {
      throw new Error('Payload QRIS rusak: tag dan panjang harus numerik.');
    }
    const length = Number.parseInt(lengthText, 10);
    const valueStart = cursor + 4;
    const valueEnd = valueStart + length;
    if (valueEnd > source.length) throw new Error('Payload QRIS terpotong: nilai tag tidak lengkap.');
    entries.push({ tag, value: source.slice(valueStart, valueEnd) });
    cursor = valueEnd;
  }
  return entries;
}

export function serializeQrisTlv(entries) {
  return (entries || [])
    .map((entry) => {
      const value = String(entry?.value ?? '');
      if (!/^\d{2}$/.test(String(entry?.tag || ''))) throw new Error('Tag QRIS harus 2 digit numerik.');
      if (value.length > 99) throw new Error('Nilai tag QRIS melebihi 99 karakter.');
      return `${entry.tag}${String(value.length).padStart(2, '0')}${value}`;
    })
    .join('');
}

export function isValidQrisPayload(payload) {
  try {
    const source = String(payload || '').trim();
    if (!source || source.length > QRIS_MAX_PAYLOAD_LENGTH) return false;

    const entries = parseQrisTlv(source);
    if (!entries.length) return false;
    if (entries[0].tag !== '00' || entries[0].value !== '01') return false;

    const last = entries[entries.length - 1];
    if (last.tag !== '63' || last.value.length !== 4) return false;

    const body = source.slice(0, source.length - 4);
    return crc16CcittFalse(body) === last.value.toUpperCase();
  } catch {
    return false;
  }
}

export function buildDynamicQrisPayload(staticPayload, amountIdr) {
  const amount = Number(amountIdr);
  if (!Number.isInteger(amount) || amount <= 0 || amount > QRIS_MAX_AMOUNT_IDR) {
    throw new Error('Nominal QRIS dinamis harus bilangan bulat positif maksimal 12 digit.');
  }

  const source = String(staticPayload || '').trim();
  if (!isValidQrisPayload(source)) {
    throw new Error('Payload QRIS statis tidak valid atau CRC salah.');
  }

  const entries = parseQrisTlv(source).filter((entry) => entry.tag !== '54' && entry.tag !== '63');

  const pointOfInitiation = entries.find((entry) => entry.tag === '01');
  if (pointOfInitiation) {
    pointOfInitiation.value = '12';
  } else {
    const formatIndex = entries.findIndex((entry) => entry.tag === '00');
    entries.splice(formatIndex + 1, 0, { tag: '01', value: '12' });
  }

  const amountEntry = { tag: '54', value: String(amount) };
  const insertIndex = entries.findIndex((entry) => entry.tag > '54');
  if (insertIndex === -1) entries.push(amountEntry);
  else entries.splice(insertIndex, 0, amountEntry);

  const body = `${serializeQrisTlv(entries)}6304`;
  return `${body}${crc16CcittFalse(body)}`;
}