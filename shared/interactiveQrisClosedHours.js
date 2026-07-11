export const DEFAULT_INTERACTIVE_QRIS_CLOSED_HOURS = {
  enabled: true,
  timezone: 'Asia/Jakarta',
  start: '22:00',
  end: '05:00',
  message: 'Pembayaran QRIS tutup pukul 22:00 sampai 05:00 WIB. Silakan pilih metode lain atau kembali saat jam operasional.'
};

function normalizeTimeString(value, fallback) {
  const source = typeof value === 'string' ? value.trim() : '';
  if (!/^\d{2}:\d{2}$/.test(source)) return fallback;
  const [hourText, minuteText] = source.split(':');
  const hour = Number.parseInt(hourText, 10);
  const minute = Number.parseInt(minuteText, 10);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return fallback;
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function timeStringToMinutes(value) {
  const [hourText, minuteText] = String(value || '00:00').split(':');
  const hour = Number.parseInt(hourText, 10);
  const minute = Number.parseInt(minuteText, 10);
  return Number.isInteger(hour) && Number.isInteger(minute) ? hour * 60 + minute : 0;
}

function zonedMinutesOfDay(timezone, now = new Date()) {
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone || DEFAULT_INTERACTIVE_QRIS_CLOSED_HOURS.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    });
  } catch {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: DEFAULT_INTERACTIVE_QRIS_CLOSED_HOURS.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    });
  }
  const parts = formatter.formatToParts(now);
  const hour = Number.parseInt(parts.find((part) => part.type === 'hour')?.value || '0', 10);
  const minute = Number.parseInt(parts.find((part) => part.type === 'minute')?.value || '0', 10);
  return hour * 60 + minute;
}

export function normalizeInteractiveQrisClosedHours(value = {}) {
  const input = value && typeof value === 'object' ? value : {};
  return {
    enabled: input.enabled !== false,
    timezone: typeof input.timezone === 'string' && input.timezone.trim() ? input.timezone.trim() : DEFAULT_INTERACTIVE_QRIS_CLOSED_HOURS.timezone,
    start: normalizeTimeString(input.start, DEFAULT_INTERACTIVE_QRIS_CLOSED_HOURS.start),
    end: normalizeTimeString(input.end, DEFAULT_INTERACTIVE_QRIS_CLOSED_HOURS.end),
    message:
      typeof input.message === 'string' && input.message.trim()
        ? input.message.trim()
        : DEFAULT_INTERACTIVE_QRIS_CLOSED_HOURS.message
  };
}

export function getInteractiveQrisClosedState(value = {}, now = new Date()) {
  const closedHours = normalizeInteractiveQrisClosedHours(value);
  if (!closedHours.enabled) {
    return {
      ...closedHours,
      isClosed: false
    };
  }

  const currentMinutes = zonedMinutesOfDay(closedHours.timezone, now);
  const startMinutes = timeStringToMinutes(closedHours.start);
  const endMinutes = timeStringToMinutes(closedHours.end);

  let isClosed = false;
  if (startMinutes === endMinutes) {
    isClosed = true;
  } else if (startMinutes < endMinutes) {
    isClosed = currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    isClosed = currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }

  return {
    ...closedHours,
    isClosed
  };
}
