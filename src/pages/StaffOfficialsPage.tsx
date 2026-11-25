import {useCallback, useEffect, useState} from 'react';
import {Plus, Search, Trash2, X} from 'lucide-react';
import {apiRequest, ApiError} from '../lib/api';
import type {StaffOfficialRecord} from '../types/bdms';

interface StaffOfficialsPageProps {
  token: string;
}

const EMPTY_OFFICIAL = {
  fullName: '',
  position: 'Barangay Kagawad',
  tier: 2 as 1 | 2 | 3,
  committee: '',
  reportsTo: 'OFF-001',
  contactNumber: '',
  termStart: '2023-11-01',
  termEnd: '2026-11-30',
  status: 'Active' as 'Active' | 'Inactive',
};

export function StaffOfficialsPage({token}: StaffOfficialsPageProps) {
  const [officials, setOfficials] = useState<StaffOfficialRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<StaffOfficialRecord | null>(null);
  const [form, setForm] = useState(EMPTY_OFFICIAL);
  const [saving, setSaving] = useState(false);

  const fetchOfficials = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{staffOfficials: StaffOfficialRecord[]}>('/api/staff', {token});
      setOfficials(res.staffOfficials);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load staff & officials.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchOfficials();
  }, [fetchOfficials]);

  const filtered = officials.filter((o) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      o.fullName.toLowerCase().includes(q) ||
      o.position.toLowerCase().includes(q) ||
      o.committee.toLowerCase().includes(q) ||
      o.code.toLowerCase().includes(q)
    );
  });

  function openCreate() {
    setModalMode('create');
    setEditing(null);
    setForm(EMPTY_OFFICIAL);
  }

  function openEdit(o: StaffOfficialRecord) {
    setModalMode('edit');
    setEditing(o);
    setForm({
      fullName: o.fullName,
      position: o.position,
      tier: o.tier,
      committee: o.committee,
      reportsTo: o.reportsTo,
      contactNumber: o.contactNumber,
      termStart: o.termStart,
      termEnd: o.termEnd,
      status: o.status,
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (modalMode === 'create') {
        await apiRequest('/api/staff', {method: 'POST', token, body: form});
      } else if (modalMode === 'edit' && editing) {
        await apiRequest(`/api/staff/${editing.id}`, {method: 'PATCH', token, body: form});
      }
      setModalMode(null);
      await fetchOfficials();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save official.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(o: StaffOfficialRecord) {
    try {
      await apiRequest(`/api/staff/${o.id}`, {method: 'DELETE', token});
      await fetchOfficials();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete official.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Barangay Staff &amp; Officials</h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Maintain elected Sangguniang Barangay officials and administrative personnel
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-800 hover:bg-blue-900 rounded-lg whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add Official / Staff
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, position, or committee..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg"
          />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading personnel directory...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No officials or staff found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                  <th className="py-3 px-4 font-medium">Code</th>
                  <th className="py-3 px-4 font-medium">Full Name</th>
                  <th className="py-3 px-4 font-medium">Position</th>
                  <th className="py-3 px-4 font-medium">Committee / Unit</th>
                  <th className="py-3 px-4 font-medium">Term</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-mono-num text-xs text-slate-500">{o.code}</td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{o.fullName}</div>
                      {o.contactNumber && (
                        <div className="text-xs font-mono-num text-slate-500">
                          {o.contactNumber}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800">{o.position}</td>
                    <td className="py-3 px-4 text-slate-600 text-xs">{o.committee || '—'}</td>
                    <td className="py-3 px-4 font-mono-num text-xs text-slate-500 whitespace-nowrap">
                      {o.termStart || '—'} to {o.termEnd || '—'}
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <span
                        className={
                          o.status === 'Active'
                            ? 'font-semibold text-emerald-700'
                            : 'font-semibold text-red-700'
                        }
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(o)}
                          className="text-xs font-medium text-blue-800 hover:underline px-2 py-1"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(o)}
                          className="p-1 text-slate-400 hover:text-red-700"
                          title="Delete Official"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="bg-white w-full max-w-lg rounded-xl border border-slate-200 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-base font-semibold text-slate-900">
                {modalMode === 'create' ? 'Add Official or Staff' : 'Edit Official / Staff'}
              </h3>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={form.fullName}
                  onChange={(e) => setForm({...form, fullName: e.target.value})}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Position *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.position}
                    onChange={(e) => setForm({...form, position: e.target.value})}
                    placeholder="e.g. Barangay Kagawad"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Org Chart Tier
                  </label>
                  <select
                    value={form.tier}
                    onChange={(e) => setForm({...form, tier: Number(e.target.value) as 1 | 2 | 3})}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value={1}>Tier 1 — Punong Barangay (Executive)</option>
                    <option value={2}>Tier 2 — Sanggunian / Secretary / Treasurer</option>
                    <option value={3}>Tier 3 — Administrative Staff / Tanod</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Committee / Department
                </label>
                <input
                  type="text"
                  value={form.committee}
                  onChange={(e) => setForm({...form, committee: e.target.value})}
                  placeholder="e.g. Peace & Order, Finance"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Reports To
                  </label>
                  <select
                    value={form.reportsTo}
                    onChange={(e) => setForm({...form, reportsTo: e.target.value})}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">None (Top Executive)</option>
                    {officials
                      .filter((o) => o.id !== editing?.id)
                      .map((o) => (
                        <option key={o.id} value={o.code}>
                          {o.fullName} ({o.position})
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Contact Number
                  </label>
                  <input
                    type="text"
                    value={form.contactNumber}
                    onChange={(e) => setForm({...form, contactNumber: e.target.value})}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Term Start
                  </label>
                  <input
                    type="date"
                    value={form.termStart}
                    onChange={(e) => setForm({...form, termStart: e.target.value})}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Term End</label>
                  <input
                    type="date"
                    value={form.termEnd}
                    onChange={(e) => setForm({...form, termEnd: e.target.value})}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm({...form, status: e.target.value as 'Active' | 'Inactive'})
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
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
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-800 hover:bg-blue-900 rounded-lg"
                >
                  {saving ? 'Saving...' : 'Save Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
