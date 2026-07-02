export const DEFAULT_TAX_CODE = 'umkm_final_revenue';
export const BUSINESS_FINANCE_ENTRY_TYPES = ['owner_capital', 'operational_expense', 'tax_payment', 'owner_withdrawal', 'bank_fee', 'other'];
export const BUSINESS_FINANCE_CASH_DIRECTIONS = ['in', 'out'];
export const BUSINESS_FINANCE_TAX_TREATMENTS = ['non_taxable', 'deductible', 'tax_payment', 'other'];

const SUCCESSFUL_GATEWAY_STATUSES = new Set(['settlement', 'capture']);

function safeText(value) {
  return String(value || '').trim();
}

function safeInt(value) {
  return Number.parseInt(String(value || '0'), 10) || 0;
}

function dateOnly(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function isoDateFromParts(year, month, day) {
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

export function defaultFinanceRange(now = new Date()) {
  const current = new Date(now);
  return {
    from: isoDateFromParts(current.getUTCFullYear(), current.getUTCMonth(), 1),
    to: isoDateFromParts(current.getUTCFullYear(), current.getUTCMonth() + 1, 0)
  };
}

export function normalizeFinanceRange(input = {}, now = new Date()) {
  const fallback = defaultFinanceRange(now);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(String(input.from || '')) ? String(input.from) : fallback.from;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(String(input.to || '')) ? String(input.to) : fallback.to;
  if (from <= to) return { from, to };
  return { from: to, to: from };
}

export function nextDateOnly(value) {
  const next = new Date(`${value}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

export function buildTimestampRangeQuery(column, range) {
  const normalized = normalizeFinanceRange(range);
  const from = `${normalized.from}T00:00:00.000Z`;
  const toExclusive = `${nextDateOnly(normalized.to)}T00:00:00.000Z`;
  return `${column}=gte.${encodeURIComponent(from)}&${column}=lt.${encodeURIComponent(toExclusive)}`;
}

export function buildDateRangeQuery(column, range) {
  const normalized = normalizeFinanceRange(range);
  return `${column}=gte.${normalized.from}&${column}=lte.${normalized.to}`;
}

export function isSuccessfulGatewayPayment(payment = {}) {
  const status = safeText(payment.status).toLowerCase();
  return Boolean(payment.credited_ledger_id) || (SUCCESSFUL_GATEWAY_STATUSES.has(status) && Boolean(payment.paid_at));
}

export function classifyCreditLedgerEntry(entry = {}) {
  const reason = safeText(entry.reason).toLowerCase();
  switch (reason) {
    case 'signup_free_credit':
      return {
        category: 'promo_bonus',
        label: 'Bonus signup',
        includeInNonRevenueCredits: true,
        reviewRequired: false
      };
    case 'admin_user_creation_credit':
      return {
        category: 'internal_grant',
        label: 'Grant user dari admin',
        includeInNonRevenueCredits: true,
        reviewRequired: false
      };
    case 'admin_adjustment':
      return {
        category: 'admin_adjustment',
        label: 'Penyesuaian admin',
        includeInNonRevenueCredits: false,
        reviewRequired: true
      };
    case 'midtrans_payment':
    case 'manual_payment_shopee':
      return {
        category: 'payment_audit_credit',
        label: 'Audit top up customer',
        includeInNonRevenueCredits: false,
        reviewRequired: false
      };
    case 'ai_redraw':
      return {
        category: 'usage_debit_non_cash',
        label: 'Debit AI redraw',
        includeInNonRevenueCredits: false,
        reviewRequired: false
      };
    case 'job_commit':
      return {
        category: 'job_usage_non_cash',
        label: 'Debit commit job',
        includeInNonRevenueCredits: false,
        reviewRequired: false
      };
    case 'ai_redraw_refund':
      return {
        category: 'usage_refund_non_cash',
        label: 'Refund AI redraw',
        includeInNonRevenueCredits: false,
        reviewRequired: false
      };
    default:
      return {
        category: 'other_ledger',
        label: 'Ledger lain',
        includeInNonRevenueCredits: false,
        reviewRequired: false
      };
  }
}

export function normalizeManualPaymentTransaction(payment = {}) {
  return {
    id: `manual_payment:${payment.id}`,
    rawId: payment.id,
    occurredAt: payment.approved_at || payment.created_at || null,
    source: 'manual_payment',
    category: 'customer_cash_revenue',
    label: 'Pembayaran manual disetujui',
    direction: 'in',
    amountIdr: safeInt(payment.amount_idr),
    signedAmountIdr: Math.abs(safeInt(payment.amount_idr)),
    taxable: true,
    reviewRequired: false,
    userEmail: safeText(payment.user_email),
    reference: safeText(payment.order_ref || payment.id),
    note: safeText(payment.notes),
    status: safeText(payment.status),
    metadata: {
      marketplace: safeText(payment.marketplace)
    }
  };
}

export function normalizeGatewayPaymentTransaction(payment = {}) {
  return {
    id: `payment_gateway:${payment.id}`,
    rawId: payment.id,
    occurredAt: payment.paid_at || payment.created_at || null,
    source: 'payment_gateway',
    category: 'customer_cash_revenue',
    label: 'Pembayaran payment gateway',
    direction: 'in',
    amountIdr: safeInt(payment.amount_idr),
    signedAmountIdr: Math.abs(safeInt(payment.amount_idr)),
    taxable: true,
    reviewRequired: false,
    userEmail: safeText(payment.user_email),
    reference: safeText(payment.order_id || payment.id),
    note: safeText(payment.payment_type),
    status: safeText(payment.status),
    metadata: {
      provider: safeText(payment.provider),
      creditedLedgerId: payment.credited_ledger_id || null
    }
  };
}

export function normalizeLedgerTransaction(entry = {}, userEmail = '', createdByEmail = '') {
  const classification = classifyCreditLedgerEntry(entry);
  const signedAmountIdr = safeInt(entry.amount_idr);
  return {
    id: `credit_ledger:${entry.id}`,
    rawId: entry.id,
    occurredAt: entry.created_at || null,
    source: 'credit_ledger',
    category: classification.category,
    label: classification.label,
    direction: signedAmountIdr >= 0 ? 'in' : 'out',
    amountIdr: Math.abs(signedAmountIdr),
    signedAmountIdr,
    taxable: false,
    reviewRequired: classification.reviewRequired,
    userEmail: safeText(userEmail),
    createdByEmail: safeText(createdByEmail),
    reference: safeText(entry.reference_id || entry.id),
    note: safeText(entry.reason),
    status: safeText(entry.kind),
    metadata: entry.metadata || {},
    includeInNonRevenueCredits: classification.includeInNonRevenueCredits
  };
}

export function normalizeBusinessLedgerTransaction(entry = {}, createdByEmail = '') {
  const signedAmountIdr = entry.cash_direction === 'out' ? -Math.abs(safeInt(entry.amount_idr)) : Math.abs(safeInt(entry.amount_idr));
  return {
    id: `business_ledger:${entry.id}`,
    rawId: entry.id,
    occurredAt: entry.entry_date || entry.created_at || null,
    source: 'business_ledger',
    category: safeText(entry.entry_type),
    label: safeText(entry.entry_type).replaceAll('_', ' '),
    direction: entry.cash_direction === 'out' ? 'out' : 'in',
    amountIdr: Math.abs(safeInt(entry.amount_idr)),
    signedAmountIdr,
    taxable: false,
    reviewRequired: false,
    userEmail: '',
    createdByEmail: safeText(createdByEmail),
    reference: safeText(entry.document_ref || entry.id),
    note: safeText(entry.note),
    status: safeText(entry.tax_treatment),
    metadata: {
      counterparty: safeText(entry.counterparty)
    }
  };
}

export function normalizeJobUsageTransaction(job = {}) {
  return {
    id: `job:${job.id}`,
    rawId: job.id,
    occurredAt: job.created_at || null,
    source: 'jobs',
    category: 'usage_value',
    label: job.input_mode === 'ai_redraw' ? 'Generate AI redraw' : 'Generate vector siap proses',
    direction: 'none',
    amountIdr: Math.abs(safeInt(job.price_idr)),
    signedAmountIdr: 0,
    taxable: false,
    reviewRequired: false,
    userEmail: safeText(job.user_email),
    reference: safeText(job.project_name || job.id),
    note: `${safeText(job.production_type)} / ${safeText(job.input_mode)}`,
    status: safeText(job.status),
    metadata: {
      inputMode: safeText(job.input_mode),
      productionType: safeText(job.production_type),
      separationFilmCount: safeInt(job.separation_film_count)
    }
  };
}

export function filterFinanceTransactions(transactions = [], filters = {}) {
  const source = safeText(filters.source).toLowerCase();
  const category = safeText(filters.category).toLowerCase();
  const email = safeText(filters.userEmail).toLowerCase();

  return transactions.filter((entry) => {
    if (source && safeText(entry.source).toLowerCase() !== source) return false;
    if (category && safeText(entry.category).toLowerCase() !== category) return false;
    if (email && !safeText(entry.userEmail).toLowerCase().includes(email)) return false;
    return true;
  });
}

export function findApplicableTaxRule(dateValue, rules = []) {
  const target = dateOnly(dateValue || new Date().toISOString());
  return (rules || [])
    .filter((rule) => {
      const from = safeText(rule.effective_from);
      const to = safeText(rule.effective_to);
      return from && from <= target && (!to || to >= target);
    })
    .sort((left, right) => safeText(right.effective_from).localeCompare(safeText(left.effective_from)))[0] || null;
}

export function calculateEstimatedTax(transactions = [], taxRules = []) {
  const total = (transactions || []).reduce((sum, entry) => {
    const rule = findApplicableTaxRule(entry.occurredAt, taxRules);
    const ratePercent = Number(rule?.rate_percent || 0);
    return sum + (Math.abs(safeInt(entry.amountIdr)) * ratePercent) / 100;
  }, 0);
  return Math.round(total);
}

export function buildFinanceSummary({ manualPayments = [], gatewayPayments = [], ledgerEntries = [], businessEntries = [], jobs = [], taxRules = [] } = {}) {
  const customerCashTransactions = [
    ...manualPayments.map((entry) => normalizeManualPaymentTransaction(entry)),
    ...gatewayPayments.filter((entry) => isSuccessfulGatewayPayment(entry)).map((entry) => normalizeGatewayPaymentTransaction(entry))
  ];

  const normalizedLedgerEntries = ledgerEntries.map((entry) => normalizeLedgerTransaction(entry, entry.user_email, entry.created_by_email));
  const normalizedBusinessEntries = businessEntries.map((entry) => normalizeBusinessLedgerTransaction(entry, entry.created_by_email));
  const normalizedJobs = jobs.map((entry) => normalizeJobUsageTransaction(entry));

  const customerCashRevenueIdr = customerCashTransactions.reduce((sum, entry) => sum + Math.abs(safeInt(entry.amountIdr)), 0);
  const nonRevenueCreditsIdr = normalizedLedgerEntries
    .filter((entry) => entry.includeInNonRevenueCredits === true && entry.signedAmountIdr > 0)
    .reduce((sum, entry) => sum + Math.abs(safeInt(entry.amountIdr)), 0);
  const ownerCapitalIdr = normalizedBusinessEntries
    .filter((entry) => entry.category === 'owner_capital' && entry.direction === 'in')
    .reduce((sum, entry) => sum + Math.abs(safeInt(entry.amountIdr)), 0);
  const operationalExpenseIdr = normalizedBusinessEntries
    .filter((entry) => entry.category === 'operational_expense' && entry.direction === 'out')
    .reduce((sum, entry) => sum + Math.abs(safeInt(entry.amountIdr)), 0);
  const taxableBaseIdr = customerCashRevenueIdr;
  const estimatedTaxIdr = calculateEstimatedTax(customerCashTransactions, taxRules);
  const jobValueIdr = normalizedJobs.reduce((sum, entry) => sum + Math.abs(safeInt(entry.amountIdr)), 0);
  const aiRedrawCount = jobs.filter((job) => safeText(job.input_mode) === 'ai_redraw').length;
  const readyTraceCount = jobs.filter((job) => safeText(job.input_mode) === 'ready_trace').length;
  const reviewRequiredCount = normalizedLedgerEntries.filter((entry) => entry.reviewRequired).length;

  return {
    customerCashRevenueIdr,
    nonRevenueCreditsIdr,
    ownerCapitalIdr,
    operationalExpenseIdr,
    taxableBaseIdr,
    estimatedTaxIdr,
    jobValueIdr,
    aiRedrawCount,
    readyTraceCount,
    reviewRequiredCount
  };
}

export function escapeCsvCell(value) {
  const text = String(value ?? '');
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

export function buildCsvContent(rows = []) {
  return rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(',')).join('\n');
}

export function buildFinanceCsv(section, payload = {}) {
  if (section === 'summary') {
    return buildCsvContent([
      ['metric', 'value'],
      ...Object.entries(payload.summary || {}).map(([key, value]) => [key, value])
    ]);
  }

  if (section === 'usage') {
    return buildCsvContent([
      ['occurred_at', 'user_email', 'project_name', 'production_type', 'input_mode', 'status', 'separation_film_count', 'price_idr'],
      ...(payload.jobs || []).map((job) => [
        job.created_at || '',
        job.user_email || '',
        job.project_name || '',
        job.production_type || '',
        job.input_mode || '',
        job.status || '',
        safeInt(job.separation_film_count),
        safeInt(job.price_idr)
      ])
    ]);
  }

  if (section === 'business-ledger') {
    return buildCsvContent([
      ['entry_date', 'entry_type', 'cash_direction', 'amount_idr', 'tax_treatment', 'counterparty', 'document_ref', 'note', 'created_by_email'],
      ...(payload.entries || []).map((entry) => [
        entry.entry_date || '',
        entry.entry_type || '',
        entry.cash_direction || '',
        safeInt(entry.amount_idr),
        entry.tax_treatment || '',
        entry.counterparty || '',
        entry.document_ref || '',
        entry.note || '',
        entry.created_by_email || ''
      ])
    ]);
  }

  return buildCsvContent([
    ['occurred_at', 'source', 'category', 'direction', 'amount_idr', 'taxable', 'review_required', 'user_email', 'reference', 'note', 'status'],
    ...(payload.transactions || []).map((entry) => [
      entry.occurredAt || '',
      entry.source || '',
      entry.category || '',
      entry.direction || '',
      safeInt(entry.amountIdr),
      entry.taxable ? 'yes' : 'no',
      entry.reviewRequired ? 'yes' : 'no',
      entry.userEmail || '',
      entry.reference || '',
      entry.note || '',
      entry.status || ''
    ])
  ]);
}
