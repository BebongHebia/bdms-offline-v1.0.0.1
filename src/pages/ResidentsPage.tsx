import {useCallback, useEffect, useMemo, useState} from 'react';
import {AlertTriangle, FilePlus2, Plus, Search, Trash2, Users, X} from 'lucide-react';
import {apiRequest, ApiError, formatLongDate} from '../lib/api';
import type {ResidentRecord, TransactionRecord, UserRecord} from '../types/bdms';

interface ResidentsPageProps {
  token: string;
  user: UserRecord;
  onCreateRequestForResident: (residentCode: string) => void;
}

const PUROK_OPTIONS = [
  'All',
  'Purok 1',
  'Purok 2',
  'Purok 3',
  'Purok 4',
  'Purok 5',
  'Purok 6',
  'Purok 7',
  'Purok 8',
];

function computePreviewAge(bday: string): number {
  if (!bday) return 0;
  const dob = new Date(bday);
  if (Number.isNaN(dob.getTime())) return 0;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return Math.max(0, age);
}

const EMPTY_FORM = {
  firstName: '',
  middleName: '',
  lastName: '',
  suffix: '',
  sex: 'Male' as 'Male' | 'Female',
  bday: '',
  civilStatus: 'Single' as ResidentRecord['civilStatus'],
  bloodType: 'O+',
  purok: 'Purok 1',
  bldgNo: '',
  streetPurokSector: '',
  completeAddress: '',
  contactNumber: '',
  occupation: '',
  voterStatus: false,
  pwdStatus: false,
  seniorCitizenStatus: false,
};

export function ResidentsPage({token, user, onCreateRequestForResident}: ResidentsPageProps) {
  const [residents, setResidents] = useState<ResidentRecord[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [purokFilter, setPurokFilter] = useState('All');

  // Duplicate Scanner
  const [duplicateGroups, setDuplicateGroups] = useState<ResidentRecord[][] | null>(null);

  // Add / Edit Modal
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingResident, setEditingResident] = useState<ResidentRecord | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Profile Drawer / Modal
  const [viewingResident, setViewingResident] = useState<ResidentRecord | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [resRes, txnRes] = await Promise.all([
        apiRequest<{residents: ResidentRecord[]}>('/api/residents', {token}),
        apiRequest<{transactions: TransactionRecord[]}>('/api/transactions', {token}),
      ]);
      setResidents(resRes.residents);
      setTransactions(txnRes.transactions);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load residents.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredResidents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return residents.filter((r) => {
      if (purokFilter !== 'All' && r.purok !== purokFilter) return false;
      if (!q) return true;
      const full = `${r.firstName} ${r.middleName} ${r.lastName} ${r.suffix}`.toLowerCase();
      return (
        full.includes(q) ||
        r.code.toLowerCase().includes(q) ||
        r.purok.toLowerCase().includes(q) ||
        r.occupation.toLowerCase().includes(q)
      );
    });
  }, [residents, search, purokFilter]);

  // Live duplicate detector while typing in Create mode
  const livePossibleDuplicates = useMemo(() => {
    if (modalMode !== 'create') return [];
    const fn = form.firstName.trim().toLowerCase();
    const ln = form.lastName.trim().toLowerCase();
    if (!fn && !ln) return [];
    return residents.filter((r) => {
      const rfn = r.firstName.toLowerCase();
      const rln = r.lastName.toLowerCase();
      if (ln && fn) {
        return rln.includes(ln) && rfn.includes(fn);
      }
      if (ln.length >= 3) return rln === ln;
      return false;
    });
  }, [modalMode, form.firstName, form.lastName, residents]);

  async function handleCheckDuplicates() {
    try {
      const res = await apiRequest<{duplicateGroups: ResidentRecord[][]}>(
        '/api/residents/duplicates',
        {token},
      );
      setDuplicateGroups(res.duplicateGroups);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Duplicate scan failed.');
    }
  }

  function openCreateModal() {
    setModalMode('create');
    setEditingResident(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  function openEditModal(r: ResidentRecord) {
    setModalMode('edit');
    setEditingResident(r);
    setForm({
      firstName: r.firstName,
      middleName: r.middleName,
      lastName: r.lastName,
      suffix: r.suffix,
      sex: r.sex,
      bday: r.bday,
      civilStatus: r.civilStatus,
      bloodType: r.bloodType,
      purok: r.purok,
      bldgNo: r.bldgNo,
      streetPurokSector: r.streetPurokSector,
      completeAddress: r.completeAddress,
      contactNumber: r.contactNumber,
      occupation: r.occupation,
      voterStatus: r.voterStatus,
      pwdStatus: r.pwdStatus,
      seniorCitizenStatus: r.seniorCitizenStatus,
    });
    setFormError(null);
  }

  async function handleSaveResident(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      if (modalMode === 'create') {
        await apiRequest('/api/residents', {method: 'POST', token, body: form});
      } else if (modalMode === 'edit' && editingResident) {
        await apiRequest(`/api/residents/${editingResident.id}`, {
          method: 'PATCH',
          token,
          body: form,
        });
      }
      setModalMode(null);
      await fetchData();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to save resident record.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteResident(r: ResidentRecord) {
    try {
      await apiRequest(`/api/residents/${r.id}`, {method: 'DELETE', token});
      if (viewingResident?.id === r.id) setViewingResident(null);
      await fetchData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete resident.');
    }
  }

  const previewAge = computePreviewAge(form.bday);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Resident Directory</h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Centralized database of registered Barangay Ocho residents ({residents.length} total)
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleCheckDuplicates}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Users className="w-4 h-4" />
            Check Duplicates
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-800 hover:bg-blue-900 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            Register Resident
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Duplicate Scanner Panel */}
      {duplicateGroups !== null && (
        <div className="bg-white border border-amber-300 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
              <AlertTriangle className="w-4 h-4" />
              <span>
                Duplicate Record Scan:{' '}
                {duplicateGroups.length === 0
                  ? 'No potential duplicates detected'
                  : `${duplicateGroups.length} possible duplicate group(s) found`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setDuplicateGroups(null)}
              className="text-xs text-slate-500 hover:text-slate-800"
            >
              Close
            </button>
          </div>
          {duplicateGroups.length > 0 && (
            <div className="space-y-3">
              {duplicateGroups.map((group, idx) => (
                <div key={idx} className="border border-slate-200 rounded-lg p-3 bg-slate-50 text-xs">
                  <p className="font-semibold text-slate-700 mb-1.5">Possible Match Group #{idx + 1}</p>
                  <div className="space-y-1">
                    {group.map((r) => (
                      <div key={r.id} className="flex items-center justify-between">
                        <span>
                          <span className="font-mono-num font-medium">{r.code}</span> · {r.firstName}{' '}
                          {r.middleName} {r.lastName} · Birthdate: {r.bday} · {r.purok}
                        </span>
                        <button
                          type="button"
                          onClick={() => setViewingResident(r)}
                          className="text-blue-800 hover:underline font-medium"
                        >
                          Inspect
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Search & Purok Filter */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search resident by name, ID, or occupation..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-800/20 focus:border-blue-800"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0">
          <span className="text-xs font-medium text-slate-500 whitespace-nowrap">Purok:</span>
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {PUROK_OPTIONS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPurokFilter(p)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  purokFilter === p
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Residents Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading resident directory...</div>
        ) : filteredResidents.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm text-slate-600">No residents found matching your criteria.</p>
            <button
              type="button"
              onClick={openCreateModal}
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-800 hover:bg-blue-900 rounded-lg"
            >
              <Plus className="w-4 h-4" />
              Register First Resident
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                  <th className="py-3 px-4 font-medium">Resident ID</th>
                  <th className="py-3 px-4 font-medium">Full Name</th>
                  <th className="py-3 px-4 font-medium">Sex / Age</th>
                  <th className="py-3 px-4 font-medium">Purok &amp; Address</th>
                  <th className="py-3 px-4 font-medium">Classification</th>
                  <th className="py-3 px-4 font-medium">Contact</th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredResidents.map((r) => {
                  const classifications = [
                    r.voterStatus ? 'Voter' : null,
                    r.seniorCitizenStatus ? 'Senior' : null,
                    r.pwdStatus ? 'PWD' : null,
                  ].filter(Boolean);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono-num text-xs font-medium text-slate-700 whitespace-nowrap">
                        {r.code}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => setViewingResident(r)}
                          className="font-semibold text-slate-900 hover:text-blue-800 text-left"
                        >
                          {r.lastName}, {r.firstName} {r.middleName ? `${r.middleName.charAt(0)}.` : ''}{' '}
                          {r.suffix}
                        </button>
                        <div className="text-xs text-slate-500">
                          {r.civilStatus} · {r.occupation || 'Unspecified occupation'}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700 whitespace-nowrap">
                        {r.sex} · <span className="font-mono-num font-medium">{r.age} yrs</span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-xs font-medium text-slate-800">{r.purok}</div>
                        <div className="text-xs text-slate-500 max-w-xs truncate">
                          {r.completeAddress}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        {classifications.length > 0 ? classifications.join(' · ') : 'Regular'}
                      </td>
                      <td className="py-3 px-4 font-mono-num text-xs text-slate-600 whitespace-nowrap">
                        {r.contactNumber || '—'}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onCreateRequestForResident(r.code)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-800 hover:underline px-1.5 py-1"
                            title="Create Document Request"
                          >
                            <FilePlus2 className="w-3.5 h-3.5" />
                            Request
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(r)}
                            className="text-xs font-medium text-slate-700 hover:text-slate-900 px-1.5 py-1"
                          >
                            Edit
                          </button>
                          {user.role === 'Admin' && (
                            <button
                              type="button"
                              onClick={() => handleDeleteResident(r)}
                              className="p-1 text-slate-400 hover:text-red-700 transition-colors"
                              title="Delete Resident"
                            >
                              <Trash2 className="w-4 h-4" />
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

      {/* Add / Edit Resident Modal */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-xl border border-slate-200 shadow-xl overflow-hidden my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-base font-semibold text-slate-900">
                {modalMode === 'create'
                  ? 'Register New Resident'
                  : `Edit Resident · ${editingResident?.code}`}
              </h3>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveResident} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {formError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  {formError}
                </div>
              )}

              {/* Live duplicate warning when creating */}
              {livePossibleDuplicates.length > 0 && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
                  <p className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-700" />
                    Possible existing resident record(s) found:
                  </p>
                  <ul className="mt-1 space-y-0.5 pl-5 list-disc">
                    {livePossibleDuplicates.slice(0, 3).map((dup) => (
                      <li key={dup.id}>
                        {dup.code} — {dup.firstName} {dup.middleName} {dup.lastName} ({dup.purok},{' '}
                        Birthdate: {dup.bday})
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-1">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    First Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.firstName}
                    onChange={(e) => setForm({...form, firstName: e.target.value})}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-1">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Middle Name
                  </label>
                  <input
                    type="text"
                    value={form.middleName}
                    onChange={(e) => setForm({...form, middleName: e.target.value})}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-1">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.lastName}
                    onChange={(e) => setForm({...form, lastName: e.target.value})}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-1">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Suffix</label>
                  <input
                    type="text"
                    placeholder="Jr., III"
                    value={form.suffix}
                    onChange={(e) => setForm({...form, suffix: e.target.value})}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Sex *</label>
                  <select
                    value={form.sex}
                    onChange={(e) => setForm({...form, sex: e.target.value as 'Male' | 'Female'})}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Birthdate * {form.bday ? `(Age ${previewAge})` : ''}
                  </label>
                  <input
                    type="date"
                    required
                    value={form.bday}
                    onChange={(e) => {
                      const bday = e.target.value;
                      const autoSenior = computePreviewAge(bday) >= 60;
                      setForm({
                        ...form,
                        bday,
                        seniorCitizenStatus: autoSenior || form.seniorCitizenStatus,
                      });
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Civil Status
                  </label>
                  <select
                    value={form.civilStatus}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        civilStatus: e.target.value as ResidentRecord['civilStatus'],
                      })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Single">Single</option>
                    <option value="Married">Married</option>
                    <option value="Widowed">Widowed</option>
                    <option value="Separated">Separated</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Blood Type</label>
                  <select
                    value={form.bloodType}
                    onChange={(e) => setForm({...form, bloodType: e.target.value})}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map((bt) => (
                      <option key={bt} value={bt}>
                        {bt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Purok *</label>
                  <select
                    value={form.purok}
                    onChange={(e) => setForm({...form, purok: e.target.value})}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {PUROK_OPTIONS.filter((p) => p !== 'All').map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    House / Bldg No.
                  </label>
                  <input
                    type="text"
                    value={form.bldgNo}
                    onChange={(e) => setForm({...form, bldgNo: e.target.value})}
                    placeholder="e.g. Blk 2 Lot 5"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Street / Sector
                  </label>
                  <input
                    type="text"
                    value={form.streetPurokSector}
                    onChange={(e) => setForm({...form, streetPurokSector: e.target.value})}
                    placeholder="e.g. Rizal St."
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Complete Address (Barangay Ocho, Malaybalay City, Bukidnon)
                </label>
                <input
                  type="text"
                  value={form.completeAddress}
                  onChange={(e) => setForm({...form, completeAddress: e.target.value})}
                  placeholder="House/Lot, Street, Purok"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Contact Number
                  </label>
                  <input
                    type="text"
                    value={form.contactNumber}
                    onChange={(e) => setForm({...form, contactNumber: e.target.value})}
                    placeholder="09XX-XXX-XXXX"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Occupation</label>
                  <input
                    type="text"
                    value={form.occupation}
                    onChange={(e) => setForm({...form, occupation: e.target.value})}
                    placeholder="e.g. Farmer, Teacher, Student"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="pt-2 flex flex-wrap gap-6 text-sm text-slate-700">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.voterStatus}
                    onChange={(e) => setForm({...form, voterStatus: e.target.checked})}
                    className="rounded border-slate-300 text-blue-800"
                  />
                  Registered Voter
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.pwdStatus}
                    onChange={(e) => setForm({...form, pwdStatus: e.target.checked})}
                    className="rounded border-slate-300 text-blue-800"
                  />
                  Person with Disability (PWD)
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.seniorCitizenStatus}
                    onChange={(e) => setForm({...form, seniorCitizenStatus: e.target.checked})}
                    className="rounded border-slate-300 text-blue-800"
                  />
                  Senior Citizen
                </label>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-800 hover:bg-blue-900 disabled:opacity-60 rounded-lg"
                >
                  {saving
                    ? 'Saving...'
                    : modalMode === 'create'
                      ? 'Save Resident'
                      : 'Update Resident'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Individual Resident Profile Modal */}
      {viewingResident && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-xl border border-slate-200 shadow-xl overflow-hidden my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div>
                <p className="text-xs font-mono-num text-slate-500">{viewingResident.code}</p>
                <h3 className="text-lg font-bold text-slate-900">
                  {viewingResident.firstName} {viewingResident.middleName}{' '}
                  {viewingResident.lastName} {viewingResident.suffix}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setViewingResident(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-xs text-slate-500 block">Sex &amp; Age</span>
                  <span className="font-medium text-slate-900">
                    {viewingResident.sex} · {viewingResident.age} years old
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Birthdate</span>
                  <span className="font-medium text-slate-900">
                    {formatLongDate(viewingResident.bday)}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Civil Status &amp; Blood Type</span>
                  <span className="font-medium text-slate-900">
                    {viewingResident.civilStatus} · {viewingResident.bloodType}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-xs text-slate-500 block">Address</span>
                  <span className="font-medium text-slate-900">
                    {viewingResident.completeAddress}, {viewingResident.purok},{' '}
                    {viewingResident.barangay}, {viewingResident.cityMunicipal}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Contact Number</span>
                  <span className="font-mono-num text-slate-900">
                    {viewingResident.contactNumber || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Occupation</span>
                  <span className="font-medium text-slate-900">
                    {viewingResident.occupation || '—'}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-xs text-slate-500 block">Special Classifications</span>
                  <span className="font-medium text-slate-900">
                    {[
                      viewingResident.voterStatus ? 'Registered Voter' : null,
                      viewingResident.pwdStatus ? 'PWD' : null,
                      viewingResident.seniorCitizenStatus ? 'Senior Citizen' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'None'}
                  </span>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-slate-900">
                    Document Request History
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      const code = viewingResident.code;
                      setViewingResident(null);
                      onCreateRequestForResident(code);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-800 hover:bg-blue-900 rounded-lg"
                  >
                    <FilePlus2 className="w-3.5 h-3.5" />
                    New Document Request
                  </button>
                </div>

                {transactions.filter((t) => t.residentCode === viewingResident.code).length === 0 ? (
                  <p className="text-xs text-slate-500 py-3">
                    No document transactions recorded for this resident yet.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg text-xs">
                    {transactions
                      .filter((t) => t.residentCode === viewingResident.code)
                      .map((t) => (
                        <div key={t.id} className="px-3.5 py-2.5 flex items-center justify-between">
                          <div>
                            <span className="font-mono-num font-semibold text-slate-900">
                              {t.code}
                            </span>{' '}
                            · <span className="font-medium text-slate-800">{t.documentType}</span>
                            <div className="text-slate-500 mt-0.5">{t.purpose}</div>
                          </div>
                          <div className="text-right">
                            <span className="font-medium text-slate-800 block">{t.status}</span>
                            <span className="font-mono-num text-slate-400">{t.dateCreated}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
