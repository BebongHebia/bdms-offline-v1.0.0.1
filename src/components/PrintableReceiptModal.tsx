import {Printer, X} from 'lucide-react';
import type {BarangaySettings, PaymentRecord} from '../types/bdms';
import {formatCurrencyPHP, formatLongDate} from '../lib/api';
import {BarangaySeal} from './BarangaySeal';

interface PrintableReceiptModalProps {
  payment: PaymentRecord;
  settings: BarangaySettings;
  onClose: () => void;
}

export function PrintableReceiptModal({payment, settings, onClose}: PrintableReceiptModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-xl rounded-xl border border-slate-200 shadow-2xl overflow-hidden print-only-container">
        <div className="no-print flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Official Payment Receipt</h3>
            <p className="text-xs text-slate-500">
              {payment.orNo} · {payment.transactionCode}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-800 hover:bg-blue-900 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Printer className="w-4 h-4" />
              Print Receipt
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-200 transition-colors"
              aria-label="Close receipt preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-8 bg-white text-slate-900">
          <div className="flex items-center gap-4 pb-4 border-b-2 border-slate-900">
            <BarangaySeal size={56} className="shrink-0" />
            <div className="flex-1">
              <p className="text-[11px] uppercase tracking-wider text-slate-500">
                Republic of the Philippines · Province of {settings.province}
              </p>
              <h2 className="text-lg font-bold text-slate-900">
                {settings.barangayName}, {settings.cityMunicipal}
              </h2>
              <p className="text-xs font-semibold text-blue-900 uppercase">
                Office of the Barangay Treasurer — Official Receipt
              </p>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between text-sm">
            <div>
              <span className="text-xs text-slate-500 block">Official Receipt No.</span>
              <span className="font-mono-num text-lg font-bold text-slate-900">{payment.orNo}</span>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-500 block">Payment Date</span>
              <span className="font-medium text-slate-900">{formatLongDate(payment.paymentDate)}</span>
            </div>
          </div>

          <div className="mt-6 border border-slate-300 rounded-lg divide-y divide-slate-200 text-sm">
            <div className="flex justify-between px-4 py-3">
              <span className="text-slate-500">Payor / Resident</span>
              <span className="font-semibold text-slate-900">{payment.residentName}</span>
            </div>
            <div className="flex justify-between px-4 py-3">
              <span className="text-slate-500">Resident ID</span>
              <span className="font-mono-num text-slate-800">{payment.resCode}</span>
            </div>
            <div className="flex justify-between px-4 py-3">
              <span className="text-slate-500">Transaction Ref.</span>
              <span className="font-mono-num text-slate-800">{payment.transactionCode}</span>
            </div>
            <div className="flex justify-between px-4 py-3">
              <span className="text-slate-500">Document / Fee Nature</span>
              <span className="font-medium text-slate-900">{payment.documentType}</span>
            </div>
            <div className="flex justify-between px-4 py-3">
              <span className="text-slate-500">Payment Method</span>
              <span className="text-slate-900">{payment.paymentMethod}</span>
            </div>
            {payment.cedulaNo && (
              <div className="flex justify-between px-4 py-3">
                <span className="text-slate-500">CTC / Cedula No.</span>
                <span className="font-mono-num text-slate-800">{payment.cedulaNo}</span>
              </div>
            )}
            <div className="flex justify-between px-4 py-3 bg-slate-50 font-semibold">
              <span className="text-slate-700">Total Amount Paid</span>
              <span className="font-mono-num text-base text-slate-900">
                {formatCurrencyPHP(payment.amount)}
              </span>
            </div>
            <div className="flex justify-between px-4 py-3">
              <span className="text-slate-500">Status</span>
              <span
                className={
                  payment.paymentStatus === 'Paid'
                    ? 'font-semibold text-emerald-700'
                    : 'font-semibold text-red-700'
                }
              >
                {payment.paymentStatus}
              </span>
            </div>
          </div>

          <div className="mt-8 flex items-end justify-between pt-4">
            <div className="text-xs text-slate-500">
              <p>Payment ID: <span className="font-mono-num">{payment.code}</span></p>
              {payment.remarks && <p className="mt-1">Remarks: {payment.remarks}</p>}
            </div>
            <div className="text-center border-t border-slate-800 pt-2 w-56">
              <p className="text-sm font-semibold text-slate-900 uppercase">{payment.receivedBy}</p>
              <p className="text-xs text-slate-500">Collecting Officer / Barangay Treasurer</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
