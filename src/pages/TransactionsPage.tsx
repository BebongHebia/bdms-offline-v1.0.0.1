import {useCallback, useEffect, useMemo, useState} from 'react';
import {Eye, FileText, Plus, Printer, RotateCcw, Search, Trash2, X} from 'lucide-react';
import {PrintableDocumentModal} from '../components/PrintableDocumentModal';
import {apiRequest, ApiError, formatCurrencyPHP} from '../lib/api';
import type {
  BarangaySettings,
  DocumentExtraFields,
  DocumentTemplateRecord,
  PaymentRecord,
  ResidentRecord,
  TransactionRecord,
  TransactionStatus,
  UserRecord,
} from '../types/bdms';

interface TransactionsPageProps {
  token: string;
  user: UserRecord;
  preselectedResidentCode?: string | null;
  onClearPreselectedResident?: () => void;
  onNavigateToPayments?: () => void;
}

const STATUS_TABS: Array<'All' | TransactionStatus> = [
  'All',
  'Pending',
  'Processing',
  'For Payment',
  'Ready for Release',
  'Completed',
  'Cancelled',
];

function txnStatusStyle(status: TransactionStatus): string {
  switch (status) {
    case 'Completed':
      return 'text-emerald-700 font-semibold';
    case 'Ready for Release':
      return 'text-blue-800 font-semibold';
    case 'For Payment':
    case 'Pending':
      return 'text-amber-700 font-semibold';
    case 'Processing':
      return 'text-slate-800 font-semibold';
    case 'Cancelled':
      return 'text-red-700 font-semibold';
  }
}

export function TransactionsPage({
  token,
  user,
  preselectedResidentCode,
  onClearPreselectedResident,
  onNavigateToPayments,
}: TransactionsPageProps) {
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [residents, setResidents] = useState<ResidentRecord[]>([]);
  const [templates, setTemplates] = useState<DocumentTemplateRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [settings, setSettings] = useState<BarangaySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<'All' | TransactionStatus>('All');
  const [search, setSearch] = useState('');

  // Create Request Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [residentSearch, setResidentSearch] = useState('');
  const [selectedResidentCode, setSelectedResidentCode] = useState('');
  const [selectedTemplateCode, setSelectedTemplateCode] = useState('');
  const [purpose, setPurpose] = useState('');
  const [remarks, setRemarks] = useState('');
  const [isBypass, setIsBypass] = useState(false);
  const [extraFields, setExtraFields] = useState<DocumentExtraFields>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Detail & Print Modals
  const [detailTxn, setDetailTxn] = useState<TransactionRecord | null>(null);
  const [printingTxn, setPrintingTxn] = useState<TransactionRecord | null>(null);

  // Bulk delete & Undo Deletion state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [undoState, setUndoState] = useState<{undoId: string; count: number} | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const reqs: Array<Promise<unknown>> = [
        apiRequest<{transactions: TransactionRecord[]}>('/api/transactions', {token}),
        apiRequest<{residents: ResidentRecord[]}>('/api/residents', {token}),
        apiRequest<{templates: DocumentTemplateRecord[]}>('/api/templates', {token}),
        apiRequest<{settings: BarangaySettings}>('/api/settings', {token}),
      ];
      if (user.role === 'Admin' || user.role === 'Treasurer') {
        reqs.push(apiRequest<{payments: PaymentRecord[]}>('/api/payments', {token}));
      }

      const results = await Promise.all(reqs);
      const txns = (results[0] as {transactions: TransactionRecord[]}).transactions;
      setTransactions(txns);
      setSelectedIds((prev) => prev.filter((id) => txns.some((t) => t.id === id)));
      setResidents((results[1] as {residents: ResidentRecord[]}).residents);
      const tplList = (results[2] as {templates: DocumentTemplateRecord[]}).templates;
      setTemplates(tplList);
      setSettings((results[3] as {settings: BarangaySettings}).settings);
      if (results[4]) {
        setPayments((results[4] as {payments: PaymentRecord[]}).payments);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load transactions.');
    } finally {
      setLoading(false);
    }
  }, [token, user.role]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (preselectedResidentCode && residents.length > 0 && templates.length > 0) {
      setSelectedResidentCode(preselectedResidentCode);
      const activeTpl = templates.find((t) => t.isActive);
      if (activeTpl) setSelectedTemplateCode(activeTpl.code);
      setPurpose('');
      setRemarks('');
      setExtraFields({});
      setIsBypass(false);
      setFormError(null);
      setShowCreateModal(true);
      onClearPreselectedResident?.();
    }
  }, [preselectedResidentCode, residents, templates, onClearPreselectedResident]);

  const activeTemplates = useMemo(() => templates.filter((t) => t.isActive), [templates]);
  const selectedTemplate = useMemo(
    () => activeTemplates.find((t) => t.code === selectedTemplateCode),
    [activeTemplates, selectedTemplateCode],
  );

  const filteredResidentsForPicker = useMemo(() => {
    const q = residentSearch.trim().toLowerCase();
    if (!q) return residents.slice(0, 40);
    return residents.filter((r) => {
      const full = `${r.firstName} ${r.middleName} ${r.lastName} ${r.code} ${r.purok}`.toLowerCase();
      return full.includes(q);
    });
  }, [residents, residentSearch]);

  const filteredTransactions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((t) => {
      if (statusFilter !== 'All' && t.status !== statusFilter) return false;
      if (!q) return true;
      return (
        t.code.toLowerCase().includes(q) ||
        t.residentName.toLowerCase().includes(q) ||
        t.residentCode.toLowerCase().includes(q) ||
        t.documentType.toLowerCase().includes(q) ||
        t.purpose.toLowerCase().includes(q)
      );
    });
  }, [transactions, statusFilter, search]);

  function openCreateRequest() {
    setSelectedResidentCode(residents[0]?.code || '');
    setSelectedTemplateCode(activeTemplates[0]?.code || '');
    setResidentSearch('');
    setPurpose('');
    setRemarks('');
    setIsBypass(false);
    setExtraFields({});
    setFormError(null);
    setShowCreateModal(true);
  }

  async function handleCreateTransaction(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!selectedResidentCode || !selectedTemplateCode || !purpose.trim()) {
      setFormError('Please select a resident, document type, and enter the purpose.');
      return;
    }

    setSaving(true);
    try {
      const res = await apiRequest<{transaction: TransactionRecord}>('/api/transactions', {
        method: 'POST',
        token,
        body: {
          residentCode: selectedResidentCode,
          templateCode: selectedTemplateCode,
          purpose: purpose.trim(),
          remarks: remarks.trim(),
          isBypass,
          extraFields,
        },
      });
      setShowCreateModal(false);
      await fetchAll();
      setDetailTxn(res.transaction);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Unable to create document request.');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateStatus(txn: TransactionRecord, nextStatus: TransactionStatus) {
    try {
      const res = await apiRequest<{transaction: TransactionRecord}>(`/api/transactions/${txn.id}`, {
        method: 'PATCH',
        token,
        body: {status: nextStatus},
      });
      setDetailTxn(res.transaction);
      await fetchAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to update transaction status.');
    }
  }

  const canCreate = user.role === 'Admin' || user.role === 'Staff';
  const canDelete = user.role === 'Admin' || user.role === 'Staff';

  const allFilteredSelected =
    filteredTransactions.length > 0 &&
    filteredTransactions.every((t) => selectedIds.includes(t.id));

  function toggleSelectAllFiltered() {
    if (allFilteredSelected) {
      const filteredSet = new Set(filteredTransactions.map((t) => t.id));
      setSelectedIds((prev) => prev.filter((id) => !filteredSet.has(id)));
    } else {
      const next = new Set(selectedIds);
      filteredTransactions.forEach((t) => next.add(t.id));
      setSelectedIds(Array.from(next));
    }
  }

  function toggleSelectRow(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  async function handleBulkDeleteConfirm() {
    if (selectedIds.length === 0) return;
    setBulkDeleting(true);
    setNotice(null);
    try {
      const res = await apiRequest<{deletedCount: number; undoId: string}>(
        '/api/transactions/bulk-delete',
        {
          method: 'POST',
          token,
          body: {ids: selectedIds},
        },
      );
      setSelectedIds([]);
      setConfirmBulkDelete(false);
      setUndoState({undoId: res.undoId, count: res.deletedCount});
      await fetchAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to delete selected transactions.');
      setConfirmBulkDelete(false);
    } finally {
      setBulkDeleting(false);
    }
  }

  async function handleUndoDelete() {
    if (!undoState) return;
    setRestoring(true);
    setError(null);
    try {
      const res = await apiRequest<{restoredCount: number}>('/api/transactions/restore', {
        method: 'POST',
        token,
        body: {undoId: undoState.undoId},
      });
      setUndoState(null);
      setNotice(`Restored ${res.restoredCount} deleted transaction(s).`);
      await fetchAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to undo deletion.');
      setUndoState(null);
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Document Transactions</h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Create, monitor, generate, and release official Barangay Ocho documents
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {canDelete && selectedIds.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmBulkDelete(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-700 hover:bg-red-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Trash2 className="w-4 h-4" />
              {allFilteredSelected && selectedIds.length === transactions.length
                ? `Delete All (${selectedIds.length})`
                : `Delete Selected (${selectedIds.length})`}
            </button>
          )}
          {canCreate && (
            <button
              type="button"
              onClick={openCreateRequest}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-800 hover:bg-blue-900 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              New Document Request
            </button>
          )}
        </div>
      </div>

      {undoState && (
        <div className="p-3.5 rounded-lg bg-slate-900 text-white text-sm flex items-center justify-between gap-4">
          <span>
            Deleted <span className="font-semibold font-mono-num">{undoState.count}</span>{' '}
            transaction(s).
          </span>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleUndoDelete}
              disabled={restoring}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white text-slate-900 hover:bg-slate-100 disabled:opacity-60 rounded-md transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {restoring ? 'Restoring...' : 'Undo Delete'}
            </button>
            <button
              type="button"
              onClick={() => setUndoState(null)}
              className="p-1 text-slate-400 hover:text-white"
              aria-label="Dismiss undo notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {notice && (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-center justify-between">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Search & Status Filter */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reference no., resident, document, or purpose..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-800/20 focus:border-blue-800"
            />
          </div>

          <div className="text-xs text-slate-500 font-mono-num">
            Showing {filteredTransactions.length} of {transactions.length} transactions
          </div>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                statusFilter === tab
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading transactions...</div>
        ) : filteredTransactions.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm text-slate-600">No document transactions match your filter.</p>
            {canCreate && (
              <button
                type="button"
                onClick={openCreateRequest}
                className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-800 hover:bg-blue-900 rounded-lg"
              >
                <Plus className="w-4 h-4" />
                Create First Document Request
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                  {canDelete && (
                    <th className="py-3 pl-4 pr-2 font-medium w-10">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={toggleSelectAllFiltered}
                        aria-label="Select all transactions"
                        title="Select all rows"
                        className="rounded border-slate-300 text-blue-800 focus:ring-blue-800"
                      />
                    </th>
                  )}
                  <th className="py-3 px-4 font-medium">Reference No.</th>
                  <th className="py-3 px-4 font-medium">Resident</th>
                  <th className="py-3 px-4 font-medium">Document Type</th>
                  <th className="py-3 px-4 font-medium">Date Requested</th>
                  <th className="py-3 px-4 font-medium">Payment</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTransactions.map((txn) => {
                  const isChecked = selectedIds.includes(txn.id);
                  return (
                  <tr
                    key={txn.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      isChecked ? 'bg-blue-50/40' : ''
                    }`}
                  >
                    {canDelete && (
                      <td className="py-3 pl-4 pr-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectRow(txn.id)}
                          aria-label={`Select transaction ${txn.code}`}
                          className="rounded border-slate-300 text-blue-800 focus:ring-blue-800"
                        />
                      </td>
                    )}
                    <td className="py-3 px-4 font-mono-num text-xs font-semibold text-slate-900 whitespace-nowrap">
                      {txn.code}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{txn.residentName}</div>
                      <div className="text-xs text-slate-500 font-mono-num">{txn.residentCode}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-800">{txn.documentType}</div>
                      <div className="text-xs text-slate-500 max-w-xs truncate">{txn.purpose}</div>
                    </td>
                    <td className="py-3 px-4 font-mono-num text-xs text-slate-600 whitespace-nowrap">
                      {txn.dateCreated}
                    </td>
                    <td className="py-3 px-4 text-xs whitespace-nowrap">
                      <span
                        className={
                          txn.paymentStatus === 'Paid' || txn.paymentStatus === 'Waived'
                            ? 'text-emerald-700 font-medium'
                            : txn.paymentStatus === 'Refunded'
                              ? 'text-red-700 font-medium'
                              : 'text-amber-700 font-medium'
                        }
                      >
                        {txn.paymentStatus}
                      </span>
                      {txn.feeAmount > 0 && (
                        <span className="text-slate-500 font-mono-num ml-1.5">
                          ({formatCurrencyPHP(txn.feeAmount)})
                        </span>
                      )}
                    </td>
                    <td className={`py-3 px-4 text-xs whitespace-nowrap ${txnStatusStyle(txn.status)}`}>
                      {txn.status}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setDetailTxn(txn)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-900 px-2 py-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Details
                        </button>
                        {user.role !== 'Treasurer' && txn.status !== 'Cancelled' && (
                          <button
                            type="button"
                            onClick={() => setPrintingTxn(txn)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-800 hover:underline px-2 py-1"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            Generate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create New Document Request Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-xl border border-slate-200 shadow-xl overflow-hidden my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-base font-semibold text-slate-900">Create Document Request</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleCreateTransaction}
              className="p-6 space-y-4 max-h-[80vh] overflow-y-auto"
            >
              {formError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Search &amp; Select Resident *
                </label>
                <input
                  type="text"
                  value={residentSearch}
                  onChange={(e) => setResidentSearch(e.target.value)}
                  placeholder="Type resident name or ID to filter..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg mb-2"
                />
                <select
                  required
                  value={selectedResidentCode}
                  onChange={(e) => setSelectedResidentCode(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {filteredResidentsForPicker.length === 0 ? (
                    <option value="">No matching residents</option>
                  ) : (
                    filteredResidentsForPicker.map((r) => (
                      <option key={r.id} value={r.code}>
                        {r.code} — {r.lastName}, {r.firstName} {r.middleName} ({r.purok})
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Document Type *
                  </label>
                  <select
                    required
                    value={selectedTemplateCode}
                    onChange={(e) => {
                      setSelectedTemplateCode(e.target.value);
                      setExtraFields({});
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {activeTemplates.map((tpl) => (
                      <option key={tpl.id} value={tpl.code}>
                        {tpl.name} (
                        {tpl.requiresPayment && tpl.defaultFee > 0
                          ? formatCurrencyPHP(tpl.defaultFee)
                          : 'Free'}
                        )
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Applicable Fee
                  </label>
                  <div className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 font-mono-num text-slate-800">
                    {!selectedTemplate?.requiresPayment ||
                    selectedTemplate.defaultFee === 0 ||
                    extraFields.isFTJS ||
                    isBypass
                      ? 'PHP 0.00 (Waived)'
                      : formatCurrencyPHP(selectedTemplate.defaultFee)}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Purpose of Request *
                </label>
                <input
                  type="text"
                  required
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="e.g. Local Employment, Scholarship Requirement, Medical Assistance"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              {/* Dynamic ERD-backed document fields */}
              {selectedTemplate?.category === 'Indigency' && (
                <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 space-y-3">
                  <p className="text-xs font-semibold text-slate-700">
                    Indigency Additional Details
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">Patient Name</label>
                      <input
                        type="text"
                        value={extraFields.patientName || ''}
                        onChange={(e) =>
                          setExtraFields({...extraFields, patientName: e.target.value})
                        }
                        placeholder="If for medical assistance"
                        className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">
                        Authorized Representative
                      </label>
                      <input
                        type="text"
                        value={extraFields.authorized || ''}
                        onChange={(e) =>
                          setExtraFields({...extraFields, authorized: e.target.value})
                        }
                        placeholder="Representative name"
                        className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(extraFields.isWithPatient)}
                      onChange={(e) =>
                        setExtraFields({...extraFields, isWithPatient: e.target.checked})
                      }
                      className="rounded border-slate-300 text-blue-800"
                    />
                    Accompanied by Patient
                  </label>
                </div>
              )}

              {selectedTemplate?.category === 'Residency' && (
                <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 space-y-3">
                  <p className="text-xs font-semibold text-slate-700">
                    Residency &amp; First-Time Jobseeker Options
                  </p>
                  <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(extraFields.isFTJS)}
                      onChange={(e) => setExtraFields({...extraFields, isFTJS: e.target.checked})}
                      className="rounded border-slate-300 text-blue-800"
                    />
                    First Time Jobseeker (RA 11261 — waives barangay fee)
                  </label>
                </div>
              )}

              {selectedTemplate?.category === 'Certification' && (
                <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 space-y-3">
                  <p className="text-xs font-semibold text-slate-700">
                    Attestation Financial Declaration
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">
                        Monthly Earning (PHP)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={extraFields.monthlyEarning ?? ''}
                        onChange={(e) =>
                          setExtraFields({
                            ...extraFields,
                            monthlyEarning: Number(e.target.value) || 0,
                          })
                        }
                        className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white font-mono-num"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">
                        Total Monthly Expenses (PHP)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={extraFields.totalAmountExpenses ?? ''}
                        onChange={(e) =>
                          setExtraFields({
                            ...extraFields,
                            totalAmountExpenses: Number(e.target.value) || 0,
                          })
                        }
                        className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white font-mono-num"
                      />
                    </div>
                  </div>
                </div>
              )}

              {selectedTemplate?.category === 'Business' && (
                <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 space-y-3">
                  <p className="text-xs font-semibold text-slate-700">
                    Business Certificate / Closure Details
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">Business Name</label>
                      <input
                        type="text"
                        value={extraFields.businessName || ''}
                        onChange={(e) =>
                          setExtraFields({...extraFields, businessName: e.target.value})
                        }
                        placeholder="e.g. Ocho General Merchandise"
                        className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 mb-1">
                        Closure Date (if closure)
                      </label>
                      <input
                        type="date"
                        value={extraFields.closureDate || ''}
                        onChange={(e) =>
                          setExtraFields({...extraFields, closureDate: e.target.value})
                        }
                        className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Business Address</label>
                    <input
                      type="text"
                      value={extraFields.businessAddress || ''}
                      onChange={(e) =>
                        setExtraFields({...extraFields, businessAddress: e.target.value})
                      }
                      placeholder="Purok & Street inside Barangay Ocho"
                      className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Remarks (optional)
                </label>
                <input
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Processing notes or verification remarks"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              {user.role === 'Admin' && (
                <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isBypass}
                    onChange={(e) => setIsBypass(e.target.checked)}
                    className="rounded border-slate-300 text-blue-800"
                  />
                  Admin Fee Exemption / Bypass Payment Requirement
                </label>
              )}

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-800 hover:bg-blue-900 disabled:opacity-60 rounded-lg"
                >
                  {saving ? 'Submitting...' : 'Submit Document Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transaction Details & Workflow Modal */}
      {detailTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-xl rounded-xl border border-slate-200 shadow-xl overflow-hidden my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div>
                <p className="text-xs font-mono-num text-slate-500">{detailTxn.code}</p>
                <h3 className="text-base font-bold text-slate-900">{detailTxn.documentType}</h3>
              </div>
              <button
                type="button"
                onClick={() => setDetailTxn(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-xs text-slate-500 block">Resident</span>
                  <span className="font-semibold text-slate-900">{detailTxn.residentName}</span>
                  <span className="block text-xs font-mono-num text-slate-500">
                    {detailTxn.residentCode}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Transaction Status</span>
                  <span className={`text-sm ${txnStatusStyle(detailTxn.status)}`}>
                    {detailTxn.status}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-xs text-slate-500 block">Purpose</span>
                  <span className="text-slate-900">{detailTxn.purpose}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Payment Status</span>
                  <span className="font-medium text-slate-900">
                    {detailTxn.paymentStatus} ·{' '}
                    <span className="font-mono-num">
                      {detailTxn.feeAmount > 0 ? formatCurrencyPHP(detailTxn.feeAmount) : 'PHP 0.00'}
                    </span>
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Processed By</span>
                  <span className="text-slate-800">{detailTxn.processedBy}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Date Requested</span>
                  <span className="font-mono-num text-slate-800">{detailTxn.dateCreated}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Validity</span>
                  <span className="text-slate-800">{detailTxn.validity}</span>
                </div>
              </div>

              {detailTxn.remarks && (
                <div className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-700">
                  <span className="font-semibold">Remarks:</span> {detailTxn.remarks}
                </div>
              )}

              {/* Status Actions */}
              <div className="border-t border-slate-200 pt-4 space-y-3">
                <p className="text-xs font-semibold text-slate-700">Update Processing Status</p>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      'Pending',
                      'Processing',
                      'For Payment',
                      'Ready for Release',
                      'Completed',
                      'Cancelled',
                    ] as TransactionStatus[]
                  ).map((st) => {
                    const isCurrent = detailTxn.status === st;
                    return (
                      <button
                        key={st}
                        type="button"
                        disabled={isCurrent}
                        onClick={() => handleUpdateStatus(detailTxn, st)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                          isCurrent
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {st}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                {user.role === 'Treasurer' &&
                detailTxn.paymentStatus === 'Unpaid' &&
                detailTxn.status !== 'Cancelled' &&
                onNavigateToPayments ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDetailTxn(null);
                      onNavigateToPayments();
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
                  >
                    Proceed to Payment Counter
                  </button>
                ) : (
                  <div />
                )}

                {user.role !== 'Treasurer' && detailTxn.status !== 'Cancelled' && (
                  <button
                    type="button"
                    onClick={() => {
                      setPrintingTxn(detailTxn);
                      setDetailTxn(null);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-800 hover:bg-blue-900 rounded-lg"
                  >
                    <FileText className="w-4 h-4" />
                    Generate &amp; Print Document
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {confirmBulkDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="bg-white w-full max-w-md rounded-xl border border-slate-200 shadow-xl p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Confirm Transaction Deletion</h3>
            <p className="text-sm text-slate-600">
              Are you sure you want to delete{' '}
              <span className="font-semibold text-slate-900">{selectedIds.length}</span> selected
              transaction(s)? You can undo this immediately after deleting.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmBulkDelete(false)}
                disabled={bulkDeleting}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkDeleteConfirm}
                disabled={bulkDeleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-700 hover:bg-red-800 disabled:opacity-60 rounded-lg"
              >
                {bulkDeleting ? 'Deleting...' : `Delete (${selectedIds.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Official Document Modal */}
      {printingTxn && settings && (
        <PrintableDocumentModal
          transaction={printingTxn}
          resident={residents.find((r) => r.code === printingTxn.residentCode)}
          template={templates.find((t) => t.code === printingTxn.templateCode)}
          payment={payments.find(
            (p) => p.transactionCode === printingTxn.code && p.paymentStatus === 'Paid',
          )}
          settings={settings}
          onClose={() => setPrintingTxn(null)}
        />
      )}
    </div>
  );
}
