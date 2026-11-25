import {useCallback, useEffect, useMemo, useState} from 'react';
import {KeyRound, Plus, Search, Trash2, UserCheck, UserX, X} from 'lucide-react';
import {apiRequest, ApiError} from '../lib/api';
import type {AccountStatus, UserRecord, UserRole} from '../types/bdms';

interface UsersPageProps {
  token: string;
  currentUser: UserRecord;
}

export function UsersPage({token, currentUser}: UsersPageProps) {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'All' | UserRole>('All');

  // Create / Edit modal state
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('Staff');
  const [status, setStatus] = useState<AccountStatus>('Active');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset Password modal state
  const [resetTarget, setResetTarget] = useState<UserRecord | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{users: UserRecord[]}>('/api/users', {token});
      setUsers(res.users);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'All' && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        u.fullName.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.code.toLowerCase().includes(q)
      );
    });
  }, [users, search, roleFilter]);

  function openCreateModal() {
    setModalMode('create');
    setEditingUser(null);
    setFullName('');
    setUsername('');
    setEmail('');
    setRole('Staff');
    setStatus('Active');
    setPassword('');
    setFormError(null);
  }

  function openEditModal(u: UserRecord) {
    setModalMode('edit');
    setEditingUser(u);
    setFullName(u.fullName);
    setUsername(u.username);
    setEmail(u.email);
    setRole(u.role);
    setStatus(u.status);
    setPassword('');
    setFormError(null);
  }

  async function handleSaveUser(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      if (modalMode === 'create') {
        await apiRequest('/api/users', {
          method: 'POST',
          token,
          body: {fullName, username, email, role, status, password},
        });
      } else if (modalMode === 'edit' && editingUser) {
        await apiRequest(`/api/users/${editingUser.id}`, {
          method: 'PATCH',
          token,
          body: {fullName, username, email, role, status},
        });
      }
      setModalMode(null);
      await fetchUsers();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Unable to save user.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus(u: UserRecord) {
    const nextStatus: AccountStatus = u.status === 'Active' ? 'Inactive' : 'Active';
    try {
      await apiRequest(`/api/users/${u.id}`, {
        method: 'PATCH',
        token,
        body: {status: nextStatus},
      });
      await fetchUsers();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update account status.');
    }
  }

  async function handleDeleteUser(u: UserRecord) {
    try {
      await apiRequest(`/api/users/${u.id}`, {method: 'DELETE', token});
      await fetchUsers();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete user.');
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetTarget) return;
    setResetError(null);
    if (newPassword.length < 6) {
      setResetError('New password must be at least 6 characters.');
      return;
    }
    setSaving(true);
    try {
      await apiRequest(`/api/users/${resetTarget.id}`, {
        method: 'PATCH',
        token,
        body: {newPassword},
      });
      setResetTarget(null);
      setNewPassword('');
    } catch (err) {
      setResetError(err instanceof ApiError ? err.message : 'Failed to reset password.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">System Users &amp; Roles</h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Manage Admin, Barangay Staff, and Treasurer access accounts
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-800 hover:bg-blue-900 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add User Account
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Search and Role Filter */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by full name, username, or ID..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-800/20 focus:border-blue-800"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
          {(['All', 'Admin', 'Staff', 'Treasurer'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRoleFilter(r)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                roleFilter === r
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading user accounts...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No user accounts match your current filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                  <th className="py-3 px-4 font-medium">User Code</th>
                  <th className="py-3 px-4 font-medium">Full Name</th>
                  <th className="py-3 px-4 font-medium">Username</th>
                  <th className="py-3 px-4 font-medium">Role</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium">Date Created</th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono-num text-xs text-slate-600">{u.code}</td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{u.fullName}</div>
                      {u.email && <div className="text-xs text-slate-500">{u.email}</div>}
                    </td>
                    <td className="py-3 px-4 font-mono-num text-xs text-slate-800">{u.username}</td>
                    <td className="py-3 px-4 font-medium text-slate-800">{u.role}</td>
                    <td className="py-3 px-4 text-xs">
                      <span
                        className={
                          u.status === 'Active'
                            ? 'font-semibold text-emerald-700'
                            : 'font-semibold text-red-700'
                        }
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono-num text-xs text-slate-500">
                      {u.dateCreated}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(u)}
                          className="text-xs font-medium text-blue-800 hover:underline px-2 py-1"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setResetTarget(u);
                            setNewPassword('');
                            setResetError(null);
                          }}
                          className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-900 px-2 py-1"
                          title="Reset Password"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          Reset
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(u)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 px-2 py-1"
                          title={u.status === 'Active' ? 'Deactivate' : 'Activate'}
                        >
                          {u.status === 'Active' ? (
                            <UserX className="w-3.5 h-3.5 text-amber-700" />
                          ) : (
                            <UserCheck className="w-3.5 h-3.5 text-emerald-700" />
                          )}
                        </button>
                        {u.id !== currentUser.id && (
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(u)}
                            className="p-1 text-slate-400 hover:text-red-700 transition-colors"
                            title="Delete Account"
                          >
                            <Trash2 className="w-4 h-4" />
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

      {/* Create / Edit User Modal */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="bg-white w-full max-w-lg rounded-xl border border-slate-200 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-base font-semibold text-slate-900">
                {modalMode === 'create' ? 'Create User Account' : 'Edit User Account'}
              </h3>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Maricel V. Quinto"
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-800/20 focus:border-blue-800"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="staff.maricel"
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-800/20 focus:border-blue-800"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Email (optional)
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@brgy8.local"
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-800/20 focus:border-blue-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-800/20 focus:border-blue-800"
                  >
                    <option value="Admin">Admin (System Administrator)</option>
                    <option value="Staff">Staff (Barangay Clerk)</option>
                    <option value="Treasurer">Treasurer (Barangay Treasurer)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Account Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as AccountStatus)}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-800/20 focus:border-blue-800"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>

              {modalMode === 'create' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Initial Password
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-800/20 focus:border-blue-800"
                  />
                </div>
              )}

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-800 hover:bg-blue-900 disabled:opacity-60 rounded-lg transition-colors"
                >
                  {saving ? 'Saving...' : modalMode === 'create' ? 'Create Account' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="bg-white w-full max-w-md rounded-xl border border-slate-200 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-base font-semibold text-slate-900">
                Reset Password · {resetTarget.username}
              </h3>
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleResetPassword} className="p-6 space-y-4">
              {resetError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  {resetError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  New Password for {resetTarget.fullName}
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-800/20 focus:border-blue-800"
                />
              </div>
              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setResetTarget(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-800 hover:bg-blue-900 rounded-lg"
                >
                  {saving ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
