import {useCallback, useEffect, useMemo, useState} from 'react';
import {CheckCircle2, Printer, RotateCcw, Search, X} from 'lucide-react';
import {PrintableReceiptModal} from '../components/PrintableReceiptModal';
import {apiRequest, ApiError, formatCurrencyPHP} from '../lib/api';
import type {
  BarangaySettings,
  PaymentMethod,
  PaymentRecord,
  TransactionRecord,
} from '../types/bdms';

interface PaymentsPageProps {
  token: string;
}

export function PaymentsPage({token}: PaymentsPageProps) {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [awaitingPayment, setAwaitingPayment] = useState<TransactionRecord[]>([]);
  const [settings, setSettings] = useState<BarangaySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Paid' | 'Refunded'>('All');

  // Record Payment Modal
  const [recordingTxn, setRecordingTxn] = useState<TransactionRecord | null>(null);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [orNo, setOrNo] = useState('');
  const [cedulaNo, setCedulaNo] = useState('');
  const [remarks, setRemarks] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Print Receipt Modal
  const [printingReceipt, setPrintingReceipt] = useState<PaymentRecord | null>(null);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const [payRes, setRes] = await Promise.all([
        apiRequest<{payments: PaymentRecord[]; awaitingPayment: TransactionRecord[]}>(
          '/api/payments',
          {token},
        ),
        apiRequest<{settings: BarangaySettings}>('/api/settings', {token}),
      ]);
      setPayments(payRes.payments);
      setAwaitingPayment(payRes.awaitingPayment);
      setSettings(setRes.settings);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load payments.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const today = new Date().toISOString().slice(0, 10);
  const paidPayments = useMemo(
    () => payments.filter((p) => p.paymentStatus === 'Paid'),
    [payments],
  );
  const todayCollected = useMemo(
    () => paidPayments.filter((p) => p.paymentDate === today).reduce((s, p) => s + p.amount, 0),
    [paidPayments, today],
  );
  const totalCollected = useMemo(
    () => paidPayments.reduce((s, p) => s + p.amount, 0),
    [paidPayments],
  );

  const filteredPayments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payments.filter((p) => {
      if (statusFilter !== 'All' && p.paymentStatus !== statusFilter) return false;
      if (!q) return true;
      return (
        p.orNo.toLowerCase().includes(q) ||
        p.transactionCode.toLowerCase().includes(q) ||
        p.residentName.toLowerCase().includes(q) ||
        p.documentType.toLowerCase().includes(q)
      );
    });
  }, [payments, statusFilter, search]);

  function openRecordPayment(txn: TransactionRecord) {
    setRecordingTxn(txn);
    setAmount(String(txn.feeAmount));
    setPaymentMethod('Cash');
    setOrNo('');
    setCedulaNo('');
    setRemarks('');
    setFormError(null);
  }

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!recordingTxn) return;
    setFormError(null);
    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      setFormError('Please enter a valid positive payment amount.');
      return;
    }

    setSaving(true);
    try {
      const res = await apiRequest<{payment: PaymentRecord}>('/api/payments', {
        method: 'POST',
        token,
        body: {
          transactionCode: recordingTxn.code,
          amount: numAmount,
          paymentMethod,
          orNo: orNo.trim(),
          cedulaNo: cedulaNo.trim(),
          remarks: remarks.trim(),
        },
      });
      setRecordingTxn(null);
      await fetchPayments();
      setPrintingReceipt(res.payment);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Unable to record payment.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRefund(p: PaymentRecord) {
    try {
      await apiRequest(`/api/payments/${p.id}/refund`, {
        method: 'POST',
        token,
        body: {remarks: 'Refunded via Barangay Treasury'},
      });
      await fetchPayments();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to process refund.');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Treasury &amp; Payments</h2>
        <p className="text-sm text-slate-600 mt-0.5">
          Record collections, issue Official Receipts (OR), and monitor daily Barangay Ocho revenues
        </p>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Treasury Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Today&apos;s Collections ({today})</p>
          <p className="mt-2 text-2xl font-bold text-emerald-700 font-mono-num">
            {formatCurrencyPHP(todayCollected)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {paidPayments.filter((p) => p.paymentDate === today).length} official receipt(s) today
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Total Collected Revenue</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 font-mono-num">
            {formatCurrencyPHP(totalCollected)}
          </p>
          <p className="mt-1 text-xs text-slate-500">{paidPayments.length} settled payments</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Pending Payment Queue</p>
          <p className="mt-2 text-2xl font-bold text-amber-700 font-mono-num">
            {awaitingPayment.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">Document requests awaiting settlement</p>
        </div>
      </div>

      {/* Queue: Document Requests Requiring Payment */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="text-base font-semibold text-slate-900">
            Document Requests Requiring Payment
          </h3>
          <p className="text-xs text-slate-500">
            Select a request below to collect fee and generate an Official Receipt
          </p>
        </div>
        {awaitingPayment.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">
            All active fee-bearing document requests have been settled.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                  <th className="py-2.5 px-4 font-medium">Ref No.</th>
                  <th className="py-2.5 px-4 font-medium">Resident</th>
                  <th className="py-2.5 px-4 font-medium">Document Type</th>
                  <th className="py-2.5 px-4 font-medium">Requested</th>
                  <th className="py-2.5 px-4 font-medium text-right">Amount Due</th>
                  <th className="py-2.5 px-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {awaitingPayment.map((txn) => (
                  <tr key={txn.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-mono-num text-xs font-semibold text-slate-900">
                      {txn.code}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900">{txn.residentName}</td>
                    <td className="py-3 px-4 text-slate-700">{txn.documentType}</td>
                    <td className="py-3 px-4 font-mono-num text-xs text-slate-500">
                      {txn.dateCreated}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-num font-semibold text-slate-900">
                      {formatCurrencyPHP(txn.feeAmount)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => openRecordPayment(txn)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-800 hover:bg-blue-900 rounded-lg whitespace-nowrap"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Record Payment
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payment History & Search */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Payment History &amp; Receipts</h3>
            <p className="text-xs text-slate-500">Official Receipt ledger</p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search OR no., ref, or resident..."
                className="pl-9 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
              {(['All', 'Paid', 'Refunded'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1 text-xs font-medium rounded-md ${
                    statusFilter === st
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading payment records...</div>
        ) : filteredPayments.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No payment records found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                  <th className="py-3 px-4 font-medium">OR Number</th>
                  <th className="py-3 px-4 font-medium">Transaction Ref</th>
                  <th className="py-3 px-4 font-medium">Resident</th>
                  <th className="py-3 px-4 font-medium">Document Type</th>
                  <th className="py-3 px-4 font-medium">Method</th>
                  <th className="py-3 px-4 font-medium">Date</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Amount</th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-mono-num text-xs font-semibold text-slate-900">
                      {p.orNo}
                    </td>
                    <td className="py-3 px-4 font-mono-num text-xs text-slate-600">
                      {p.transactionCode}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900">{p.residentName}</td>
                    <td className="py-3 px-4 text-slate-600">{p.documentType}</td>
                    <td className="py-3 px-4 text-xs text-slate-700">{p.paymentMethod}</td>
                    <td className="py-3 px-4 font-mono-num text-xs text-slate-500">
                      {p.paymentDate}
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <span
                        className={
                          p.paymentStatus === 'Paid'
                            ? 'text-emerald-700 font-semibold'
                            : 'text-red-700 font-semibold'
                        }
                      >
                        {p.paymentStatus}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono-num font-semibold text-slate-900">
                      {formatCurrencyPHP(p.amount)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPrintingReceipt(p)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-blue-800 hover:underline px-2 py-1"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          Receipt
                        </button>
                        {p.paymentStatus === 'Paid' && (
                          <button
                            type="button"
                            onClick={() => handleRefund(p)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:underline px-1.5 py-1"
                            title="Mark as Refunded"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Refund
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Payment Modal */}
      {recordingTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="bg-white w-full max-w-md rounded-xl border border-slate-200 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Record Payment</h3>
                <p className="text-xs text-slate-500 font-mono-num">{recordingTxn.code}</p>
              </div>
              <button
                type="button"
                onClick={() => setRecordingTxn(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
                <p className="font-semibold text-slate-900">{recordingTxn.residentName}</p>
                <p className="text-slate-600">{recordingTxn.documentType}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Amount Collected (PHP) *
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Payment Method *
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Cash">Cash</option>
                    <option value="GCash">GCash</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Check">Check</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    OR Number (auto if blank)
                  </label>
                  <input
                    type="text"
                    value={orNo}
                    onChange={(e) => setOrNo(e.target.value)}
                    placeholder="OR-2026-XXXX"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Cedula / CTC No.
                  </label>
                  <input
                    type="text"
                    value={cedulaNo}
                    onChange={(e) => setCedulaNo(e.target.value)}
                    placeholder="Optional"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-num"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Remarks (optional)
                </label>
                <input
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Counter payment notes"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRecordingTxn(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-800 hover:bg-blue-900 disabled:opacity-60 rounded-lg"
                >
                  {saving ? 'Recording...' : 'Confirm & Issue Receipt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {printingReceipt && settings && (
        <PrintableReceiptModal
          payment={printingReceipt}
          settings={settings}
          onClose={() => setPrintingReceipt(null)}
        />
      )}
    </div>
  );
}
