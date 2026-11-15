import { Download, Landmark, RefreshCw, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  createAdminBusinessFinanceEntry,
  downloadAdminFinanceExport,
  getAdminFinanceSummary,
  getAdminFinanceUsage,
  listAdminBusinessFinanceEntries,
  listAdminFinanceTransactions,
  listAdminTaxRules,
  saveAdminTaxRule,
  toUserApiError
} from '../lib/api.js';
import { defaultAdminFinanceRange } from '../lib/adminFinance.js';
import { formatRupiah } from '../lib/pricing.js';

const sourceOptions = [
  ['', 'Semua sumber'],
  ['manual_payment', 'Pembayaran manual'],
  ['payment_gateway', 'Payment gateway'],
  ['credit_ledger', 'Credit ledger'],
  ['business_ledger', 'Ledger bisnis'],
  ['jobs', 'Jobs usage']
];

const categoryOptions = [
  ['', 'Semua kategori'],
  ['customer_cash_revenue', 'Omzet customer'],
  ['promo_bonus', 'Bonus promo'],
  ['internal_grant', 'Grant internal'],
  ['admin_adjustment', 'Adjustment admin'],
  ['owner_capital', 'Modal owner'],
  ['operational_expense', 'Biaya operasional'],
  ['tax_payment', 'Bayar pajak'],
  ['owner_withdrawal', 'Prive owner'],
  ['bank_fee', 'Biaya bank/admin'],
  ['usage_value', 'Nilai job internal']
];

const businessEntryTypeOptions = [
  ['owner_capital', 'Modal awal / tambahan modal'],
  ['operational_expense', 'Biaya operasional'],
  ['tax_payment', 'Bayar pajak'],
  ['owner_withdrawal', 'Penarikan owner'],
  ['bank_fee', 'Biaya admin / bank'],
  ['other', 'Lainnya']
];

const taxTreatmentOptions = [
  ['non_taxable', 'Non taxable'],
  ['deductible', 'Deductible'],
  ['tax_payment', 'Tax payment'],
  ['other', 'Other']
];

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

function displayDateTime(value) {
  return value ? new Date(value).toLocaleString('id-ID') : '-';
}

function displayDate(value) {
  return value ? new Date(`${value}T00:00:00.000Z`).toLocaleDateString('id-ID') : '-';
}

export default function AdminFinancePanel({ accessToken }) {
  const [range, setRange] = useState(() => defaultAdminFinanceRange());
  const [filters, setFilters] = useState({ source: '', category: '', userEmail: '' });
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [usage, setUsage] = useState({ summary: null, jobs: [] });
  const [businessEntries, setBusinessEntries] = useState([]);
  const [taxRules, setTaxRules] = useState([]);
  const [message, setMessage] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [entryDraft, setEntryDraft] = useState({
    entryDate: new Date().toISOString().slice(0, 10),
    entryType: 'owner_capital',
    cashDirection: 'in',
    amountIdr: '',
    counterparty: '',
    documentRef: '',
    note: '',
    taxTreatment: 'non_taxable'
  });
  const [taxRuleDraft, setTaxRuleDraft] = useState({
    id: '',
    taxCode: 'umkm_final_revenue',
    ratePercent: '0.5',
    effectiveFrom: range.from,
    effectiveTo: '',
    note: ''
  });

  async function loadFinanceData() {
    if (!accessToken) return;
    setIsBusy(true);
    setMessage('');
    try {
      const [summaryData, transactionData, usageData, businessData, taxRuleData] = await Promise.all([
        getAdminFinanceSummary(range, accessToken),
        listAdminFinanceTransactions({ ...range, ...filters }, accessToken),
        getAdminFinanceUsage(range, accessToken),
        listAdminBusinessFinanceEntries(range, accessToken),
        listAdminTaxRules(accessToken)
      ]);
      setSummary(summaryData.summary || null);
      setTransactions(transactionData.transactions || []);
      setUsage(usageData.usage || { summary: null, jobs: [] });
      setBusinessEntries(businessData.entries || []);
      setTaxRules(taxRuleData.rules || []);
    } catch (error) {
      setMessage(toUserApiError(error, 'Gagal memuat laporan keuangan.').message);
    } finally {
      setIsBusy(false);
    }
  }

  useEffect(() => {
    loadFinanceData();
  }, [accessToken, range.from, range.to, filters.source, filters.category, filters.userEmail]);

  async function submitBusinessEntry(event) {
    event.preventDefault();
    setIsBusy(true);
    setMessage('');
    try {
      await createAdminBusinessFinanceEntry(entryDraft, accessToken);
      setEntryDraft((current) => ({
        ...current,
        amountIdr: '',
        counterparty: '',
        documentRef: '',
        note: ''
      }));
      await loadFinanceData();
      setMessage('Entry ledger bisnis berhasil disimpan.');
    } catch (error) {
      setMessage(toUserApiError(error, 'Gagal menyimpan entry bisnis.').message);
    } finally {
      setIsBusy(false);
    }
  }

  async function submitTaxRule(event) {
    event.preventDefault();
    setIsBusy(true);
    setMessage('');
    try {
      await saveAdminTaxRule(taxRuleDraft, accessToken);
      setTaxRuleDraft((current) => ({
        ...current,
        id: '',
        effectiveTo: '',
        note: ''
      }));
      await loadFinanceData();
      setMessage('Aturan pajak berhasil disimpan.');
    } catch (error) {
      setMessage(toUserApiError(error, 'Gagal menyimpan aturan pajak.').message);
    } finally {
      setIsBusy(false);
    }
  }

  async function exportSection(section) {
    setIsBusy(true);
    setMessage('');
    try {
      const payload = {
        ...range,
        ...filters,
        section
      };
      const { blob, filename } = await downloadAdminFinanceExport(payload, accessToken);
      downloadBlob(blob, filename);
    } catch (error) {
      setMessage(toUserApiError(error, 'Gagal mengekspor laporan CSV.').message);
    } finally {
      setIsBusy(false);
    }
  }

  const summaryCards = [
    ['Omzet customer', formatRupiah(summary?.customerCashRevenueIdr || 0)],
    ['Credit non revenue', formatRupiah(summary?.nonRevenueCreditsIdr || 0)],
    ['Modal owner', formatRupiah(summary?.ownerCapitalIdr || 0)],
    ['Biaya operasional', formatRupiah(summary?.operationalExpenseIdr || 0)],
    ['Dasar omzet pajak', formatRupiah(summary?.taxableBaseIdr || 0)],
    ['Estimasi pajak', formatRupiah(summary?.estimatedTaxIdr || 0)],
    ['Nilai job internal', formatRupiah(summary?.jobValueIdr || 0)],
    ['AI redraw', summary?.aiRedrawCount || 0],
    ['Pecah warna & pola cutting sticker', summary?.readyTraceCount || 0]
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Landmark className="h-4 w-4" aria-hidden="true" />
            </div>
            <h3 className="text-base font-bold text-ink">Keuangan & pajak</h3>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Laporan ini memisahkan omzet customer, credit non-revenue, modal bisnis, biaya, dan usage generate AI agar lebih aman untuk pembukuan pajak UMKM.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => exportSection('summary')} disabled={isBusy} className="studio-btn-secondary !min-h-9 !rounded-xl !px-3 !py-1.5 !text-xs">
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Export ringkasan
          </button>
          <button type="button" onClick={() => exportSection('transactions')} disabled={isBusy} className="studio-btn-secondary !min-h-9 !rounded-xl !px-3 !py-1.5 !text-xs">
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Export transaksi
          </button>
          <button type="button" onClick={() => exportSection('usage')} disabled={isBusy} className="studio-btn-secondary !min-h-9 !rounded-xl !px-3 !py-1.5 !text-xs">
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Export usage
          </button>
          <button type="button" onClick={() => exportSection('business-ledger')} disabled={isBusy} className="studio-btn-secondary !min-h-9 !rounded-xl !px-3 !py-1.5 !text-xs">
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Export ledger bisnis
          </button>
          <button type="button" onClick={loadFinanceData} disabled={isBusy} className="studio-btn-secondary !min-h-9 !rounded-xl !px-3 !py-1.5 !text-xs">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Refresh
          </button>
        </div>
      </div>

      {message && (
        <p className="rounded-xl border border-indigo-200 bg-indigo-50/70 px-4 py-2.5 text-sm font-medium text-indigo-900">
          {message}
        </p>
      )}

      <div className="studio-subcard grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-[160px_160px_200px_220px_1fr]">
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-slate-700">Dari</span>
          <input type="date" value={range.from} onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))} className="studio-input" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-slate-700">Sampai</span>
          <input type="date" value={range.to} onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))} className="studio-input" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-slate-700">Sumber transaksi</span>
          <select value={filters.source} onChange={(event) => setFilters((current) => ({ ...current, source: event.target.value }))} className="studio-input">
            {sourceOptions.map(([value, label]) => (
              <option key={value || 'all'} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-slate-700">Kategori</span>
          <select value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))} className="studio-input">
            {categoryOptions.map(([value, label]) => (
              <option key={value || 'all'} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-slate-700">Cari email user</span>
          <input value={filters.userEmail} onChange={(event) => setFilters((current) => ({ ...current, userEmail: event.target.value }))} className="studio-input" placeholder="buyer@email.com" />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {summaryCards.map(([label, value]) => (
          <div key={label} className="studio-subcard p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
            <p className="mt-1.5 text-2xl font-extrabold tracking-tight text-ink">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.9fr)]">
        <div className="space-y-5">
          <div className="rounded-2xl border border-line bg-white p-4 sm:p-5">
            <h4 className="mb-3 text-sm font-bold text-ink">Transaksi customer dan audit non-omzet</h4>
            <div className="overflow-hidden rounded-xl border border-line">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-line text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="px-3 py-2.5">Waktu</th>
                      <th className="px-3 py-2.5">Sumber</th>
                      <th className="px-3 py-2.5">Kategori</th>
                      <th className="px-3 py-2.5">User</th>
                      <th className="px-3 py-2.5">Nominal</th>
                      <th className="px-3 py-2.5">Arah</th>
                      <th className="px-3 py-2.5">Pajak</th>
                      <th className="px-3 py-2.5">Ref</th>
                      <th className="px-3 py-2.5">Catatan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line bg-white">
                    {transactions.length === 0 ? (
                      <tr>
                        <td colSpan="9" className="px-4 py-6 text-center text-sm text-slate-500">Belum ada data transaksi untuk filter ini.</td>
                      </tr>
                    ) : (
                      transactions.map((entry) => (
                        <tr key={entry.id} className="align-top transition hover:bg-slate-50/70">
                          <td className="px-3 py-2.5 text-slate-600">{displayDateTime(entry.occurredAt)}</td>
                          <td className="px-3 py-2.5">{entry.source}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-col gap-1">
                              <span>{entry.category}</span>
                              {entry.reviewRequired && <span className="text-[11px] font-bold text-red-600">review_required</span>}
                            </div>
                          </td>
                          <td className="px-3 py-2.5">{entry.userEmail || '-'}</td>
                          <td className="px-3 py-2.5 font-bold text-ink">{formatRupiah(entry.amountIdr || 0)}</td>
                          <td className="px-3 py-2.5">{entry.direction}</td>
                          <td className="px-3 py-2.5">{entry.taxable ? 'Masuk omzet' : 'Bukan omzet'}</td>
                          <td className="px-3 py-2.5 font-mono text-xs">{entry.reference || '-'}</td>
                          <td className="px-3 py-2.5 text-slate-600">{entry.note || '-'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-white p-4 sm:p-5">
            <h4 className="mb-3 text-sm font-bold text-ink">Usage layanan / nilai generate</h4>
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <div className="studio-subcard p-3.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Nilai job</p>
                <p className="mt-1 text-lg font-extrabold text-ink">{formatRupiah(usage.summary?.jobValueIdr || 0)}</p>
              </div>
              <div className="studio-subcard p-3.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">AI redraw</p>
                <p className="mt-1 text-lg font-extrabold text-ink">{usage.summary?.aiRedrawCount || 0}</p>
              </div>
              <div className="studio-subcard p-3.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Pecah warna & pola cutting sticker</p>
                <p className="mt-1 text-lg font-extrabold text-ink">{usage.summary?.readyTraceCount || 0}</p>
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border border-line">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] border-collapse text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-line text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="px-3 py-2.5">Waktu</th>
                      <th className="px-3 py-2.5">User</th>
                      <th className="px-3 py-2.5">Project</th>
                      <th className="px-3 py-2.5">Produksi</th>
                      <th className="px-3 py-2.5">Input</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5">Nilai</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line bg-white">
                    {(usage.jobs || []).length === 0 ? (
                      <tr>
                        <td colSpan="7" className="px-4 py-6 text-center text-sm text-slate-500">Belum ada data usage pada periode ini.</td>
                      </tr>
                    ) : (
                      usage.jobs.map((job) => (
                        <tr key={job.id} className="transition hover:bg-slate-50/70">
                          <td className="px-3 py-2.5 text-slate-600">{displayDateTime(job.created_at)}</td>
                          <td className="px-3 py-2.5">{job.user_email || '-'}</td>
                          <td className="px-3 py-2.5 font-medium text-ink">{job.project_name || '-'}</td>
                          <td className="px-3 py-2.5">{job.production_type}</td>
                          <td className="px-3 py-2.5">{job.input_mode}</td>
                          <td className="px-3 py-2.5">{job.status}</td>
                          <td className="px-3 py-2.5 font-bold text-ink">{formatRupiah(job.price_idr || 0)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-2xl border border-line bg-white p-4 sm:p-5">
            <h4 className="mb-3 text-sm font-bold text-ink">Tambah ledger bisnis non-customer</h4>
            <form className="grid gap-3" onSubmit={submitBusinessEntry}>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-slate-700">Tanggal</span>
                  <input type="date" value={entryDraft.entryDate} onChange={(event) => setEntryDraft((current) => ({ ...current, entryDate: event.target.value }))} className="studio-input" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-slate-700">Jenis entry</span>
                  <select value={entryDraft.entryType} onChange={(event) => setEntryDraft((current) => ({ ...current, entryType: event.target.value }))} className="studio-input">
                    {businessEntryTypeOptions.map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-slate-700">Arah kas</span>
                  <select value={entryDraft.cashDirection} onChange={(event) => setEntryDraft((current) => ({ ...current, cashDirection: event.target.value }))} className="studio-input">
                    <option value="in">Kas masuk</option>
                    <option value="out">Kas keluar</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-slate-700">Nominal</span>
                  <input type="number" min="1" step="1000" value={entryDraft.amountIdr} onChange={(event) => setEntryDraft((current) => ({ ...current, amountIdr: event.target.value }))} className="studio-input font-mono" placeholder="100000" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-slate-700">Counterparty</span>
                  <input value={entryDraft.counterparty} onChange={(event) => setEntryDraft((current) => ({ ...current, counterparty: event.target.value }))} className="studio-input" placeholder="Owner / vendor / bank" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-slate-700">Ref dokumen</span>
                  <input value={entryDraft.documentRef} onChange={(event) => setEntryDraft((current) => ({ ...current, documentRef: event.target.value }))} className="studio-input" placeholder="INV-001 / mutasi bank" />
                </label>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-slate-700">Perlakuan pajak</span>
                <select value={entryDraft.taxTreatment} onChange={(event) => setEntryDraft((current) => ({ ...current, taxTreatment: event.target.value }))} className="studio-input">
                  {taxTreatmentOptions.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-slate-700">Catatan</span>
                <textarea value={entryDraft.note} onChange={(event) => setEntryDraft((current) => ({ ...current, note: event.target.value }))} className="studio-input min-h-24" />
              </label>
              <button type="submit" disabled={isBusy} className="studio-btn-primary w-fit">
                <Save className="h-4 w-4" aria-hidden="true" />
                Simpan entry bisnis
              </button>
            </form>
          </div>

          <div className="rounded-2xl border border-line bg-white p-4 sm:p-5">
            <h4 className="mb-3 text-sm font-bold text-ink">Ledger bisnis periode ini</h4>
            <div className="overflow-hidden rounded-xl border border-line">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-line text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="px-3 py-2.5">Tanggal</th>
                      <th className="px-3 py-2.5">Jenis</th>
                      <th className="px-3 py-2.5">Kas</th>
                      <th className="px-3 py-2.5">Nominal</th>
                      <th className="px-3 py-2.5">Pajak</th>
                      <th className="px-3 py-2.5">Ref</th>
                      <th className="px-3 py-2.5">Creator</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line bg-white">
                    {businessEntries.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="px-4 py-6 text-center text-sm text-slate-500">Belum ada entry bisnis pada periode ini.</td>
                      </tr>
                    ) : (
                      businessEntries.map((entry) => (
                        <tr key={entry.id} className="transition hover:bg-slate-50/70">
                          <td className="px-3 py-2.5 text-slate-600">{displayDate(entry.entry_date)}</td>
                          <td className="px-3 py-2.5">{entry.entry_type}</td>
                          <td className="px-3 py-2.5">{entry.cash_direction}</td>
                          <td className="px-3 py-2.5 font-bold text-ink">{formatRupiah(entry.amount_idr || 0)}</td>
                          <td className="px-3 py-2.5">{entry.tax_treatment}</td>
                          <td className="px-3 py-2.5 font-mono text-xs">{entry.document_ref || '-'}</td>
                          <td className="px-3 py-2.5 text-slate-600">{entry.created_by_email || '-'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-white p-4 sm:p-5">
            <h4 className="mb-3 text-sm font-bold text-ink">Aturan tarif pajak historis</h4>
            <form className="grid gap-3" onSubmit={submitTaxRule}>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-slate-700">Kode pajak</span>
                  <input value={taxRuleDraft.taxCode} onChange={(event) => setTaxRuleDraft((current) => ({ ...current, taxCode: event.target.value }))} className="studio-input" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-slate-700">Tarif persen</span>
                  <input type="number" min="0" step="0.001" value={taxRuleDraft.ratePercent} onChange={(event) => setTaxRuleDraft((current) => ({ ...current, ratePercent: event.target.value }))} className="studio-input font-mono" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-slate-700">Berlaku dari</span>
                  <input type="date" value={taxRuleDraft.effectiveFrom} onChange={(event) => setTaxRuleDraft((current) => ({ ...current, effectiveFrom: event.target.value }))} className="studio-input" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-slate-700">Berlaku sampai</span>
                  <input type="date" value={taxRuleDraft.effectiveTo} onChange={(event) => setTaxRuleDraft((current) => ({ ...current, effectiveTo: event.target.value }))} className="studio-input" />
                </label>
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-slate-700">Catatan</span>
                <textarea value={taxRuleDraft.note} onChange={(event) => setTaxRuleDraft((current) => ({ ...current, note: event.target.value }))} className="studio-input min-h-20" />
              </label>
              <button type="submit" disabled={isBusy} className="studio-btn-primary w-fit">
                <Save className="h-4 w-4" aria-hidden="true" />
                Simpan aturan pajak
              </button>
            </form>

            <div className="mt-4 overflow-hidden rounded-xl border border-line">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] border-collapse text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-line text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="px-3 py-2.5">Kode</th>
                      <th className="px-3 py-2.5">Tarif</th>
                      <th className="px-3 py-2.5">Dari</th>
                      <th className="px-3 py-2.5">Sampai</th>
                      <th className="px-3 py-2.5">Catatan</th>
                      <th className="px-3 py-2.5">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line bg-white">
                    {taxRules.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="px-4 py-6 text-center text-sm text-slate-500">Belum ada aturan pajak.</td>
                      </tr>
                    ) : (
                      taxRules.map((rule) => (
                        <tr key={rule.id} className="transition hover:bg-slate-50/70">
                          <td className="px-3 py-2.5 font-mono font-bold text-ink">{rule.tax_code}</td>
                          <td className="px-3 py-2.5">{rule.rate_percent}%</td>
                          <td className="px-3 py-2.5 text-slate-600">{displayDate(rule.effective_from)}</td>
                          <td className="px-3 py-2.5 text-slate-600">{rule.effective_to ? displayDate(rule.effective_to) : '-'}</td>
                          <td className="px-3 py-2.5 text-slate-600">{rule.note || '-'}</td>
                          <td className="px-3 py-2.5">
                            <button
                              type="button"
                              onClick={() =>
                                setTaxRuleDraft({
                                  id: rule.id,
                                  taxCode: rule.tax_code,
                                  ratePercent: String(rule.rate_percent),
                                  effectiveFrom: rule.effective_from,
                                  effectiveTo: rule.effective_to || '',
                                  note: rule.note || ''
                                })
                              }
                              className="studio-btn-secondary !min-h-8 !rounded-lg !px-2.5 !py-1 !text-xs"
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
