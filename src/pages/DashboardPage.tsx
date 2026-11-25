import {useEffect, useState} from 'react';
import {ArrowRight} from 'lucide-react';
import {apiRequest, formatCurrencyPHP} from '../lib/api';
import type {
  ActivityLogRecord,
  PaymentRecord,
  TransactionRecord,
  UserRecord,
} from '../types/bdms';

export type AppPage =
  | 'dashboard'
  | 'users'
  | 'residents'
  | 'transactions'
  | 'payments'
  | 'staff'
  | 'orgchart'
  | 'reports'
  | 'settings';

interface DashboardData {
  stats: {
    totalResidents: number;
    totalTransactions: number;
    pendingCount: number;
    processingCount: number;
    forPaymentCount: number;
    readyForReleaseCount: number;
    completedCount: number;
    cancelledCount: number;
    totalPaymentsCollected: number;
    todayCollections: number;
    unpaidRequestsCount: number;
    activeOfficialsCount: number;
  };
  docTypeBreakdown: Array<{documentType: string; count: number}>;
  purokBreakdown: Array<{purok: string; count: number}>;
  recentTransactions: TransactionRecord[];
  recentPayments: PaymentRecord[];
  activityLogs: ActivityLogRecord[];
}

interface DashboardPageProps {
  token: string;
  user: UserRecord;
  onNavigate: (page: AppPage) => void;
}

function statusTextClass(status: TransactionRecord['status']): string {
  switch (status) {
    case 'Completed':
      return 'text-emerald-700 font-medium';
    case 'Ready for Release':
      return 'text-blue-800 font-medium';
    case 'For Payment':
    case 'Pending':
      return 'text-amber-700 font-medium';
    case 'Processing':
      return 'text-slate-800 font-medium';
    case 'Cancelled':
      return 'text-red-700 font-medium';
    default:
      return 'text-slate-700';
  }
}

export function DashboardPage({token, user, onNavigate}: DashboardPageProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiRequest<DashboardData>('/api/dashboard', {token})
      .then((res) => {
        if (active) {
          setData(res);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load dashboard.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-28 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-72 bg-white border border-slate-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-white border border-red-200 rounded-xl p-6 text-sm text-red-700">
        {error || 'Dashboard data is unavailable.'}
      </div>
    );
  }

  const {stats} = data;
  const maxDocCount = Math.max(1, ...data.docTypeBreakdown.map((d) => d.count));

  const kpis =
    user.role === 'Treasurer'
      ? [
          {
            label: 'Total Payments Collected',
            value: formatCurrencyPHP(stats.totalPaymentsCollected),
            sub: 'All settled official receipts',
            mono: true,
          },
          {
            label: "Today's Collections",
            value: formatCurrencyPHP(stats.todayCollections),
            sub: 'Current shift treasury receipts',
            mono: true,
          },
          {
            label: 'Awaiting Payment',
            value: String(stats.unpaidRequestsCount),
            sub: 'Document requests pending fee',
            mono: true,
          },
          {
            label: 'Completed Transactions',
            value: String(stats.completedCount),
            sub: `${stats.totalTransactions} total requests recorded`,
            mono: true,
          },
        ]
      : user.role === 'Staff'
        ? [
            {
              label: 'Registered Residents',
              value: String(stats.totalResidents),
              sub: 'Active Barangay Ocho directory',
              mono: true,
            },
            {
              label: 'Pending & Processing',
              value: String(stats.pendingCount + stats.processingCount),
              sub: `${stats.pendingCount} pending · ${stats.processingCount} processing`,
              mono: true,
            },
            {
              label: 'Ready for Release',
              value: String(stats.readyForReleaseCount),
              sub: `${stats.forPaymentCount} awaiting payment`,
              mono: true,
            },
            {
              label: 'Completed Documents',
              value: String(stats.completedCount),
              sub: `${stats.totalTransactions} total requests`,
              mono: true,
            },
          ]
        : [
            {
              label: 'Registered Residents',
              value: String(stats.totalResidents),
              sub: `${stats.activeOfficialsCount} active officials & staff`,
              mono: true,
            },
            {
              label: 'Total Document Requests',
              value: String(stats.totalTransactions),
              sub: `${stats.completedCount} completed · ${stats.readyForReleaseCount} ready`,
              mono: true,
            },
            {
              label: 'Pending / In-Process',
              value: String(stats.pendingCount + stats.processingCount + stats.forPaymentCount),
              sub: `${stats.pendingCount} pending · ${stats.forPaymentCount} for payment`,
              mono: true,
            },
            {
              label: 'Total Payments Collected',
              value: formatCurrencyPHP(stats.totalPaymentsCollected),
              sub: `Today: ${formatCurrencyPHP(stats.todayCollections)}`,
              mono: true,
            },
          ];

  return (
    <div className="space-y-6">
      {/* Role Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            {user.role} Overview
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Welcome back, {user.fullName} · Barangay Ocho Operations Summary
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {user.role === 'Treasurer' ? (
            <button
              type="button"
              onClick={() => onNavigate('payments')}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-800 hover:bg-blue-900 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Open Payments Counter
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onNavigate('transactions')}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-800 hover:bg-blue-900 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Manage Document Requests
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between"
          >
            <p className="text-xs font-medium text-slate-500">{kpi.label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-900 font-mono-num">{kpi.value}</p>
            <p className="mt-2 text-xs text-slate-500">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Middle Analytical Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Transactions Table */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Recent Transactions</h3>
              <p className="text-xs text-slate-500">Latest barangay document requests</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('transactions')}
              className="text-xs font-medium text-blue-800 hover:underline whitespace-nowrap shrink-0"
            >
              View All Transactions
            </button>
          </div>

          {data.recentTransactions.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No document requests recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                    <th className="py-2.5 px-4 font-medium">Reference</th>
                    <th className="py-2.5 px-4 font-medium">Resident</th>
                    <th className="py-2.5 px-4 font-medium">Document Type</th>
                    <th className="py-2.5 px-4 font-medium">Status</th>
                    <th className="py-2.5 px-4 font-medium text-right">Fee</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.recentTransactions.map((txn) => (
                    <tr key={txn.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-4 font-mono-num text-xs font-medium text-slate-900 whitespace-nowrap">
                        {txn.code}
                      </td>
                      <td className="py-2.5 px-4 text-slate-900 font-medium">{txn.residentName}</td>
                      <td className="py-2.5 px-4 text-slate-600">{txn.documentType}</td>
                      <td className={`py-2.5 px-4 text-xs whitespace-nowrap ${statusTextClass(txn.status)}`}>
                        {txn.status}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono-num text-xs text-slate-800 whitespace-nowrap">
                        {txn.feeAmount > 0 ? formatCurrencyPHP(txn.feeAmount) : 'Waived'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Document Request Statistics */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Document Request Statistics
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Volume by document template</p>

            <div className="mt-5 space-y-3.5">
              {data.docTypeBreakdown.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">
                  No document statistics available yet.
                </p>
              ) : (
                data.docTypeBreakdown.map((item) => (
                  <div key={item.documentType}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-700 font-medium truncate pr-2">
                        {item.documentType}
                      </span>
                      <span className="font-mono-num text-slate-900 font-semibold">
                        {item.count}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-800 rounded-full"
                        style={{width: `${Math.round((item.count / maxDocCount) * 100)}%`}}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[11px] text-slate-500">Pending</p>
              <p className="text-base font-bold font-mono-num text-amber-700">
                {stats.pendingCount}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-slate-500">Processing</p>
              <p className="text-base font-bold font-mono-num text-slate-900">
                {stats.processingCount}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-slate-500">Completed</p>
              <p className="text-base font-bold font-mono-num text-emerald-700">
                {stats.completedCount}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Role-Specific Bottom Section */}
      {user.role === 'Treasurer' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Recent Official Receipts</h3>
              <p className="text-xs text-slate-500">Latest recorded collections</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('payments')}
              className="text-xs font-medium text-blue-800 hover:underline"
            >
              View Payment Ledger
            </button>
          </div>
          {data.recentPayments.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">No payments recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                    <th className="py-2.5 px-4 font-medium">OR No.</th>
                    <th className="py-2.5 px-4 font-medium">Payor</th>
                    <th className="py-2.5 px-4 font-medium">Document</th>
                    <th className="py-2.5 px-4 font-medium">Date</th>
                    <th className="py-2.5 px-4 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.recentPayments.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2.5 px-4 font-mono-num text-xs font-semibold text-slate-900">
                        {p.orNo}
                      </td>
                      <td className="py-2.5 px-4 text-slate-900">{p.residentName}</td>
                      <td className="py-2.5 px-4 text-slate-600">{p.documentType}</td>
                      <td className="py-2.5 px-4 font-mono-num text-xs text-slate-500">
                        {p.paymentDate}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono-num font-semibold text-emerald-700">
                        {formatCurrencyPHP(p.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {user.role === 'Admin' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-900">
                Resident Distribution by Purok
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('residents')}
                className="text-xs font-medium text-blue-800 hover:underline"
              >
                Open Directory
              </button>
            </div>
            {data.purokBreakdown.length === 0 ? (
              <p className="text-sm text-slate-500 py-4">No registered residents yet.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {data.purokBreakdown.map((item) => (
                  <div
                    key={item.purok}
                    className="border border-slate-200 rounded-lg px-3.5 py-3 flex items-center justify-between"
                  >
                    <span className="text-sm text-slate-700 font-medium">{item.purok}</span>
                    <span className="font-mono-num text-base font-bold text-slate-900">
                      {item.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h3 className="text-base font-semibold text-slate-900 mb-4">Recent System Activity</h3>
            {data.activityLogs.length === 0 ? (
              <p className="text-sm text-slate-500 py-4">No activity logged yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
                {data.activityLogs.map((log) => (
                  <div key={log.id} className="py-2.5 flex items-start justify-between gap-4 text-xs">
                    <div>
                      <p className="font-medium text-slate-900">
                        {log.action} · <span className="text-slate-500 font-normal">{log.actor}</span>
                      </p>
                      <p className="text-slate-600 mt-0.5">{log.details}</p>
                    </div>
                    <span className="font-mono-num text-slate-400 shrink-0">
                      {new Date(log.timestamp).toLocaleTimeString('en-PH', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
