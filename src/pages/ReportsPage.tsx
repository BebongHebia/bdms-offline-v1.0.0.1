import {useCallback, useEffect, useState} from 'react';
import {Download, Printer} from 'lucide-react';
import {BarangaySeal} from '../components/BarangaySeal';
import {apiRequest, ApiError, exportRowsToCsv, formatCurrencyPHP} from '../lib/api';
import type {
  BarangaySettings,
  PaymentRecord,
  ResidentRecord,
  TransactionRecord,
  UserRecord,
} from '../types/bdms';

interface ReportsResponse {
  residentSummary: {
    total: number;
    male: number;
    female: number;
    voters: number;
    pwd: number;
    seniors: number;
    byPurok: Array<{purok: string; count: number}>;
    records: ResidentRecord[];
  } | null;
  transactionSummary: {
    total: number;
    byStatus: Array<{status: string; count: number}>;
    byDocumentType: Array<{documentType: string; count: number}>;
    records: TransactionRecord[];
  };
  financialSummary: {
    totalCollected: number;
    totalRefunded: number;
    receiptCount: number;
    byMethod: Array<{method: string; amount: number}>;
    byDate: Array<{date: string; count: number; amount: number}>;
    records: PaymentRecord[];
  } | null;
}

interface ReportsPageProps {
  token: string;
  user: UserRecord;
}

type ReportTab = 'transactions' | 'residents' | 'financial';

export function ReportsPage({token, user}: ReportsPageProps) {
  const defaultTab: ReportTab = user.role === 'Treasurer' ? 'financial' : 'transactions';
  const [activeTab, setActiveTab] = useState<ReportTab>(defaultTab);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState('All');

  const [reportData, setReportData] = useState<ReportsResponse | null>(null);
  const [settings, setSettings] = useState<BarangaySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      if (docTypeFilter !== 'All') params.set('documentType', docTypeFilter);

      const [repRes, setRes] = await Promise.all([
        apiRequest<ReportsResponse>(`/api/reports?${params.toString()}`, {token}),
        apiRequest<{settings: BarangaySettings}>('/api/settings', {token}),
      ]);
      setReportData(repRes);
      setSettings(setRes.settings);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load reports.');
    } finally {
      setLoading(false);
    }
  }, [token, fromDate, toDate, docTypeFilter]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  function handleExportCsv() {
    if (!reportData) return;
    if (activeTab === 'residents' && reportData.residentSummary) {
      exportRowsToCsv(
        'barangay-ocho-residents-report.csv',
        ['Resident ID', 'Last Name', 'First Name', 'Middle Name', 'Sex', 'Age', 'Civil Status', 'Purok', 'Contact', 'Voter', 'PWD', 'Senior'],
        reportData.residentSummary.records.map((r) => [
          r.code,
          r.lastName,
          r.firstName,
          r.middleName,
          r.sex,
          r.age,
          r.civilStatus,
          r.purok,
          r.contactNumber,
          r.voterStatus ? 'Yes' : 'No',
          r.pwdStatus ? 'Yes' : 'No',
          r.seniorCitizenStatus ? 'Yes' : 'No',
        ]),
      );
    } else if (activeTab === 'financial' && reportData.financialSummary) {
      exportRowsToCsv(
        'barangay-ocho-financial-report.csv',
        ['OR Number', 'Payment ID', 'Transaction Ref', 'Payor', 'Document Type', 'Method', 'Date', 'Status', 'Amount (PHP)', 'Received By'],
        reportData.financialSummary.records.map((p) => [
          p.orNo,
          p.code,
          p.transactionCode,
          p.residentName,
          p.documentType,
          p.paymentMethod,
          p.paymentDate,
          p.paymentStatus,
          p.amount.toFixed(2),
          p.receivedBy,
        ]),
      );
    } else {
      exportRowsToCsv(
        'barangay-ocho-transactions-report.csv',
        ['Reference No', 'Resident ID', 'Resident Name', 'Document Type', 'Purpose Code', 'Purpose Type', 'Purpose', 'Date Requested', 'Payment Status', 'Status', 'Fee (PHP)'],
        reportData.transactionSummary.records.map((t) => [
          t.code,
          t.residentCode,
          t.residentName,
          t.documentType,
          t.purposeCode || '',
          t.purposeType || '',
          t.purpose,
          t.dateCreated,
          t.paymentStatus,
          t.status,
          t.feeAmount.toFixed(2),
        ]),
      );
    }
  }

  const availableTabs: Array<{id: ReportTab; label: string}> = [];
  if (user.role === 'Admin' || user.role === 'Staff') {
    availableTabs.push({id: 'transactions', label: 'Document Transactions'});
    availableTabs.push({id: 'residents', label: 'Resident Demographics'});
  }
  if (user.role === 'Admin' || user.role === 'Treasurer') {
    if (user.role === 'Treasurer') {
      availableTabs.push({id: 'financial', label: 'Financial Collections'});
      availableTabs.push({id: 'transactions', label: 'Document Transactions'});
    } else {
      availableTabs.push({id: 'financial', label: 'Financial Collections'});
    }
  }

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">System Reports</h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Generate, filter, print, and export official Barangay Ocho records
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!reportData}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-800 hover:bg-blue-900 rounded-lg whitespace-nowrap shrink-0"
          >
            <Printer className="w-4 h-4" />
            Print Report
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Report Tabs & Date Filters */}
      <div className="no-print bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
          {availableTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab !== 'residents' && (
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="flex items-center gap-1.5 text-slate-600">
              From
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-slate-800"
              />
            </label>
            <label className="flex items-center gap-1.5 text-slate-600">
              To
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-slate-800"
              />
            </label>
            <select
              value={docTypeFilter}
              onChange={(e) => setDocTypeFilter(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-800"
            >
              <option value="All">All Document Types</option>
              {reportData?.transactionSummary.byDocumentType.map((d) => (
                <option key={d.documentType} value={d.documentType}>
                  {d.documentType}
                </option>
              ))}
            </select>
            {(fromDate || toDate || docTypeFilter !== 'All') && (
              <button
                type="button"
                onClick={() => {
                  setFromDate('');
                  setToDate('');
                  setDocTypeFilter('All');
                }}
                className="text-blue-800 hover:underline font-medium"
              >
                Reset
              </button>
            )}
          </div>
        )}
      </div>

      {/* Printable Report Sheet */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 print-only-container space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <BarangaySeal size={48} />
            <div>
              <p className="text-[11px] uppercase tracking-wider text-slate-500">
                {settings?.barangayName || 'Barangay Ocho'},{' '}
                {settings?.cityMunicipal || 'Malaybalay City'}, {settings?.province || 'Bukidnon'}
              </p>
              <h3 className="text-lg font-bold text-slate-900">
                {activeTab === 'residents'
                  ? 'Official Resident Demographics Report'
                  : activeTab === 'financial'
                    ? 'Official Financial & Daily Collections Report'
                    : 'Official Document & Transaction Summary Report'}
              </h3>
            </div>
          </div>
          <div className="text-right text-xs text-slate-500">
            <p>Generated by: {user.fullName}</p>
            <p className="font-mono-num">{new Date().toISOString().slice(0, 10)}</p>
          </div>
        </div>

        {loading || !reportData ? (
          <div className="py-10 text-center text-sm text-slate-500">Generating report...</div>
        ) : activeTab === 'residents' && reportData.residentSummary ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
              {[
                {label: 'Total Residents', val: reportData.residentSummary.total},
                {label: 'Male', val: reportData.residentSummary.male},
                {label: 'Female', val: reportData.residentSummary.female},
                {label: 'Registered Voters', val: reportData.residentSummary.voters},
                {label: 'Senior Citizens', val: reportData.residentSummary.seniors},
                {label: 'PWD', val: reportData.residentSummary.pwd},
              ].map((stat) => (
                <div key={stat.label} className="border border-slate-200 rounded-lg p-3">
                  <p className="text-xs text-slate-500">{stat.label}</p>
                  <p className="text-xl font-bold font-mono-num text-slate-900 mt-1">{stat.val}</p>
                </div>
              ))}
            </div>

            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-2">Population by Purok</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {reportData.residentSummary.byPurok.map((p) => (
                  <div
                    key={p.purok}
                    className="border border-slate-200 rounded-lg px-3.5 py-2.5 flex justify-between text-sm"
                  >
                    <span className="text-slate-700">{p.purok}</span>
                    <span className="font-mono-num font-bold text-slate-900">{p.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="py-2.5 px-3 font-medium">Resident ID</th>
                    <th className="py-2.5 px-3 font-medium">Name</th>
                    <th className="py-2.5 px-3 font-medium">Sex / Age</th>
                    <th className="py-2.5 px-3 font-medium">Purok</th>
                    <th className="py-2.5 px-3 font-medium">Civil Status</th>
                    <th className="py-2.5 px-3 font-medium">Flags</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData.residentSummary.records.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2 px-3 font-mono-num">{r.code}</td>
                      <td className="py-2 px-3 font-medium text-slate-900">
                        {r.lastName}, {r.firstName} {r.middleName}
                      </td>
                      <td className="py-2 px-3 font-mono-num">
                        {r.sex} / {r.age}
                      </td>
                      <td className="py-2 px-3">{r.purok}</td>
                      <td className="py-2 px-3">{r.civilStatus}</td>
                      <td className="py-2 px-3 text-slate-600">
                        {[
                          r.voterStatus ? 'Voter' : null,
                          r.seniorCitizenStatus ? 'Senior' : null,
                          r.pwdStatus ? 'PWD' : null,
                        ]
                          .filter(Boolean)
                          .join(', ') || 'Regular'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : activeTab === 'financial' && reportData.financialSummary ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="border border-slate-200 rounded-lg p-4">
                <p className="text-xs text-slate-500">Total Collected (Paid ORs)</p>
                <p className="text-2xl font-bold font-mono-num text-emerald-700 mt-1">
                  {formatCurrencyPHP(reportData.financialSummary.totalCollected)}
                </p>
              </div>
              <div className="border border-slate-200 rounded-lg p-4">
                <p className="text-xs text-slate-500">Issued Official Receipts</p>
                <p className="text-2xl font-bold font-mono-num text-slate-900 mt-1">
                  {reportData.financialSummary.receiptCount}
                </p>
              </div>
              <div className="border border-slate-200 rounded-lg p-4">
                <p className="text-xs text-slate-500">Total Refunded</p>
                <p className="text-2xl font-bold font-mono-num text-red-700 mt-1">
                  {formatCurrencyPHP(reportData.financialSummary.totalRefunded)}
                </p>
              </div>
            </div>

            {reportData.financialSummary.byDate.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-slate-900 mb-2">
                  Daily Collection Breakdown
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {reportData.financialSummary.byDate.map((d) => (
                    <div
                      key={d.date}
                      className="border border-slate-200 rounded-lg px-3.5 py-2.5 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-mono-num font-semibold text-slate-900 block">
                          {d.date}
                        </span>
                        <span className="text-slate-500">{d.count} receipt(s)</span>
                      </div>
                      <span className="font-mono-num font-bold text-emerald-700">
                        {formatCurrencyPHP(d.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="py-2.5 px-3 font-medium">OR No.</th>
                    <th className="py-2.5 px-3 font-medium">Date</th>
                    <th className="py-2.5 px-3 font-medium">Payor</th>
                    <th className="py-2.5 px-3 font-medium">Document</th>
                    <th className="py-2.5 px-3 font-medium">Method</th>
                    <th className="py-2.5 px-3 font-medium">Status</th>
                    <th className="py-2.5 px-3 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData.financialSummary.records.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2 px-3 font-mono-num font-semibold">{p.orNo}</td>
                      <td className="py-2 px-3 font-mono-num">{p.paymentDate}</td>
                      <td className="py-2 px-3">{p.residentName}</td>
                      <td className="py-2 px-3">{p.documentType}</td>
                      <td className="py-2 px-3">{p.paymentMethod}</td>
                      <td className="py-2 px-3">{p.paymentStatus}</td>
                      <td className="py-2 px-3 text-right font-mono-num font-semibold">
                        {formatCurrencyPHP(p.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="border border-slate-200 rounded-lg p-3.5">
                <p className="text-xs text-slate-500">Total Requests</p>
                <p className="text-2xl font-bold font-mono-num text-slate-900 mt-1">
                  {reportData.transactionSummary.total}
                </p>
              </div>
              {reportData.transactionSummary.byStatus.slice(0, 3).map((s) => (
                <div key={s.status} className="border border-slate-200 rounded-lg p-3.5">
                  <p className="text-xs text-slate-500">{s.status}</p>
                  <p className="text-2xl font-bold font-mono-num text-slate-900 mt-1">{s.count}</p>
                </div>
              ))}
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="py-2.5 px-3 font-medium">Reference No.</th>
                    <th className="py-2.5 px-3 font-medium">Date</th>
                    <th className="py-2.5 px-3 font-medium">Resident</th>
                    <th className="py-2.5 px-3 font-medium">Document Type</th>
                    <th className="py-2.5 px-3 font-medium">Purpose</th>
                    <th className="py-2.5 px-3 font-medium">Payment</th>
                    <th className="py-2.5 px-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData.transactionSummary.records.map((t) => (
                    <tr key={t.id}>
                      <td className="py-2 px-3 font-mono-num font-semibold">{t.code}</td>
                      <td className="py-2 px-3 font-mono-num">{t.dateCreated}</td>
                      <td className="py-2 px-3">{t.residentName}</td>
                      <td className="py-2 px-3">{t.documentType}</td>
                      <td className="py-2 px-3 max-w-xs truncate">{t.purpose}</td>
                      <td className="py-2 px-3">{t.paymentStatus}</td>
                      <td className="py-2 px-3 font-medium">{t.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
