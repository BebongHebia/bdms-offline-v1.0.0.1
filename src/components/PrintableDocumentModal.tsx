import {Printer, X} from 'lucide-react';
import type {
  BarangaySettings,
  DocumentTemplateRecord,
  PaymentRecord,
  ResidentRecord,
  TransactionRecord,
} from '../types/bdms';
import {formatCurrencyPHP, formatLongDate} from '../lib/api';
import {BarangaySeal} from './BarangaySeal';

interface PrintableDocumentModalProps {
  transaction: TransactionRecord;
  resident?: ResidentRecord;
  template?: DocumentTemplateRecord;
  payment?: PaymentRecord;
  settings: BarangaySettings;
  onClose: () => void;
}

export function renderDocumentBody(
  transaction: TransactionRecord,
  resident: ResidentRecord | undefined,
  template: DocumentTemplateRecord | undefined,
  settings: BarangaySettings,
  payment?: PaymentRecord,
): string {
  const raw =
    template?.bodyTemplate ||
    'TO WHOM IT MAY CONCERN:\n\nTHIS IS TO CERTIFY that {{fullName}}, resident of {{barangay}}, {{cityMunicipal}}, {{province}}, requested this document for {{purpose}}.';

  const fullName = transaction.residentName.toUpperCase();
  const age = resident ? String(resident.age) : 'legal';
  const civilStatus = resident?.civilStatus || 'Filipino';
  const purok = resident?.purok || 'Barangay Ocho';
  const completeAddress = resident?.completeAddress || `${purok}, ${settings.barangayName}`;
  const birthdate = resident?.bday ? formatLongDate(resident.bday) : 'N/A';
  const bloodType = resident?.bloodType || 'N/A';
  const dateIssued = formatLongDate(transaction.issueDate || transaction.dateCreated);

  const patientClause =
    transaction.extraFields?.patientName || transaction.extraFields?.authorized
      ? `\n\nPatient / Beneficiary: ${transaction.extraFields.patientName || transaction.residentName}${
          transaction.extraFields.authorized
            ? ` · Authorized Representative: ${transaction.extraFields.authorized}`
            : ''
        }${transaction.extraFields.isWithPatient ? ' (Accompanied by patient)' : ''}.`
      : '';

  const ftjsClause = transaction.extraFields?.isFTJS
    ? '\n\nIssued free of charge pursuant to Republic Act No. 11261 (First Time Jobseekers Assistance Act).'
    : '';

  const attestationClause =
    transaction.extraFields?.monthlyEarning !== undefined ||
    transaction.extraFields?.totalAmountExpenses !== undefined
      ? `\n\nDeclared Monthly Earning: ${formatCurrencyPHP(
          transaction.extraFields.monthlyEarning || 0,
        )} · Declared Monthly Household Expenses: ${formatCurrencyPHP(
          transaction.extraFields.totalAmountExpenses || 0,
        )}.`
      : '';

  const businessClause = transaction.extraFields?.businessName
    ? `${transaction.extraFields.businessName} located at ${
        transaction.extraFields.businessAddress || completeAddress
      }${
        transaction.extraFields.closureDate
          ? ` (Recorded Closure Date: ${formatLongDate(transaction.extraFields.closureDate)})`
          : ''
      }`
    : `the commercial establishment at ${completeAddress}`;

  const replacements: Record<string, string> = {
    '{{fullName}}': fullName,
    '{{age}}': age,
    '{{civilStatus}}': civilStatus,
    '{{purok}}': purok,
    '{{completeAddress}}': completeAddress,
    '{{barangay}}': settings.barangayName,
    '{{cityMunicipal}}': settings.cityMunicipal,
    '{{province}}': settings.province,
    '{{purpose}}': transaction.purpose,
    '{{dateIssued}}': dateIssued,
    '{{birthdate}}': birthdate,
    '{{bloodType}}': bloodType,
    '{{residentCode}}': transaction.residentCode,
    '{{orNo}}': payment?.orNo || 'N/A',
    '{{punongBarangay}}': settings.punongBarangay,
    '{{patientClause}}': patientClause,
    '{{ftjsClause}}': ftjsClause,
    '{{attestationClause}}': attestationClause,
    '{{businessClause}}': businessClause,
  };

  let result = raw;
  for (const [token, value] of Object.entries(replacements)) {
    result = result.split(token).join(value);
  }
  return result;
}

export function PrintableDocumentModal({
  transaction,
  resident,
  template,
  payment,
  settings,
  onClose,
}: PrintableDocumentModalProps) {
  const renderedBody = renderDocumentBody(transaction, resident, template, settings, payment);
  const headerTitle = template?.headerTitle || transaction.documentType.toUpperCase();
  const signatoryName = template?.signatoryName || transaction.signedBy || settings.punongBarangay;
  const signatoryTitle = template?.signatoryTitle || 'Punong Barangay';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-4xl rounded-xl border border-slate-200 shadow-2xl overflow-hidden print-only-container">
        <div className="no-print flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Official Document Preview
            </h3>
            <p className="text-xs text-slate-500">
              {transaction.code} · {transaction.documentType}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-800 hover:bg-blue-900 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Printer className="w-4 h-4" />
              Print Document
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-200 transition-colors"
              aria-label="Close document preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-10 md:p-14 bg-white text-slate-900">
          {/* Official Republic / Barangay Header */}
          <div className="flex items-center justify-between gap-6 pb-6 border-b-2 border-slate-900">
            <BarangaySeal size={84} className="shrink-0" />
            <div className="text-center flex-1">
              <p className="text-xs tracking-wider uppercase text-slate-600">
                Republic of the Philippines
              </p>
              <p className="text-sm font-semibold text-slate-800">
                Province of {settings.province} · City of {settings.cityMunicipal}
              </p>
              <h1 className="text-2xl font-bold text-blue-900 tracking-tight mt-0.5">
                OFFICE OF THE PUNONG BARANGAY
              </h1>
              <p className="text-sm font-semibold text-slate-900">
                {settings.barangayName}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">{settings.officeAddress}</p>
            </div>
            <div className="w-[84px] text-right shrink-0">
              <div className="border border-slate-300 rounded p-2 text-center">
                <p className="text-[10px] text-slate-500 uppercase">Ref No.</p>
                <p className="text-[11px] font-mono-num font-semibold text-slate-900 break-all">
                  {transaction.code}
                </p>
              </div>
            </div>
          </div>

          {/* Document Title */}
          <div className="my-8 text-center">
            <h2 className="text-2xl font-bold tracking-wide text-slate-900 underline decoration-slate-400 underline-offset-8">
              {headerTitle}
            </h2>
          </div>

          {/* Document Body */}
          <div className="space-y-4 text-[15px] leading-relaxed text-slate-800 whitespace-pre-line font-serif">
            {renderedBody}
          </div>

          {/* Signature & Thumbmark Section */}
          <div className="mt-12 grid grid-cols-2 gap-8 items-end pt-6">
            <div className="space-y-4">
              <div className="w-36 h-24 border border-slate-400 rounded flex items-end justify-center p-2">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                  Right Thumbmark
                </span>
              </div>
              <div className="pt-4 border-t border-slate-400 w-60">
                <p className="text-xs font-semibold text-slate-900 uppercase">
                  {transaction.residentName}
                </p>
                <p className="text-[11px] text-slate-500">Applicant Signature</p>
              </div>
            </div>

            <div className="text-right flex flex-col items-end">
              <p className="text-xs text-slate-500 mb-10">Approved &amp; Certified By:</p>
              <div className="border-t border-slate-900 pt-2 w-64 text-center">
                <p className="text-sm font-bold text-slate-900 uppercase">{signatoryName}</p>
                <p className="text-xs text-slate-600">{signatoryTitle}</p>
              </div>
            </div>
          </div>

          {/* Official Footer Metadata */}
          <div className="mt-10 pt-4 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-slate-600">
            <div>
              <span className="text-slate-400 block">Resident ID</span>
              <span className="font-mono-num text-slate-800">{transaction.residentCode}</span>
            </div>
            <div>
              <span className="text-slate-400 block">OR Number</span>
              <span className="font-mono-num text-slate-800">
                {payment?.orNo || (transaction.paymentStatus === 'Waived' ? 'FEE WAIVED' : 'UNPAID')}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">Date Issued</span>
              <span className="font-mono-num text-slate-800">
                {transaction.issueDate || transaction.dateCreated}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">Validity</span>
              <span className="text-slate-800">{transaction.validity}</span>
            </div>
          </div>
          <p className="mt-4 text-[11px] text-slate-400 text-center">
            Not valid without official Barangay Dry Seal · Generated by {settings.barangayName} BDMS
          </p>
        </div>
      </div>
    </div>
  );
}
