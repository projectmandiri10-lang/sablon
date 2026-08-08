function isoDateOnly(date) {
  return new Date(date).toISOString().slice(0, 10);
}

export function defaultAdminFinanceRange(now = new Date()) {
  const current = new Date(now);
  const year = current.getUTCFullYear();
  const month = current.getUTCMonth();
  return {
    from: isoDateOnly(Date.UTC(year, month, 1)),
    to: isoDateOnly(Date.UTC(year, month + 1, 0))
  };
}

export function buildAdminFinanceQuery(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    const normalized = String(value).trim();
    if (!normalized) continue;
    search.set(key, normalized);
  }
  const serialized = search.toString();
  return serialized ? `?${serialized}` : '';
}

export function buildAdminFinanceExportFilename(section, range = {}) {
  const safeSection = String(section || 'summary').trim() || 'summary';
  const from = String(range.from || '').trim() || 'all';
  const to = String(range.to || '').trim() || 'all';
  return `finance-${safeSection}-${from}-${to}.csv`;
}
