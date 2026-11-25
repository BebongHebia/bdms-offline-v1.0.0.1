import {useCallback, useEffect, useState} from 'react';
import {Download, Plus, Save, Trash2, X} from 'lucide-react';
import {apiRequest, ApiError, formatCurrencyPHP} from '../lib/api';
import type {
  BarangaySettings,
  DocumentCategory,
  DocumentTemplateRecord,
} from '../types/bdms';

interface SettingsTemplatesPageProps {
  token: string;
}

const PLACEHOLDER_TOKENS = [
  '{{fullName}}',
  '{{age}}',
  '{{civilStatus}}',
  '{{purok}}',
  '{{completeAddress}}',
  '{{barangay}}',
  '{{cityMunicipal}}',
  '{{province}}',
  '{{purpose}}',
  '{{dateIssued}}',
  '{{orNo}}',
  '{{punongBarangay}}',
];

const EMPTY_TEMPLATE = {
  name: '',
  category: 'Custom' as DocumentCategory,
  defaultFee: 50,
  requiresPayment: true,
  validityDays: 180,
  headerTitle: '',
  bodyTemplate:
    'TO WHOM IT MAY CONCERN:\n\nTHIS IS TO CERTIFY that {{fullName}}, {{age}} years old, {{civilStatus}}, and a resident of {{purok}}, {{barangay}}, {{cityMunicipal}}, {{province}}, is issued this document for {{purpose}}.\n\nIssued this {{dateIssued}}.',
  signatoryName: 'Hon. Roberto M. Villareal',
  signatoryTitle: 'Punong Barangay',
  isActive: true,
  description: '',
};

interface StorageStatusInfo {
  driver: 'json' | 'mysql';
  mysqlConfigured: boolean;
  mysqlTarget: string;
  mysqlError: string | null;
}

export function SettingsTemplatesPage({token}: SettingsTemplatesPageProps) {
  const [activeTab, setActiveTab] = useState<'templates' | 'settings'>('templates');
  const [templates, setTemplates] = useState<DocumentTemplateRecord[]>([]);
  const [settings, setSettings] = useState<BarangaySettings | null>(null);
  const [storageStatus, setStorageStatus] = useState<StorageStatusInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Template editor modal
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingTpl, setEditingTpl] = useState<DocumentTemplateRecord | null>(null);
  const [tplForm, setTplForm] = useState(EMPTY_TEMPLATE);
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [tplRes, setRes, storRes] = await Promise.all([
        apiRequest<{templates: DocumentTemplateRecord[]}>('/api/templates', {token}),
        apiRequest<{settings: BarangaySettings}>('/api/settings', {token}),
        apiRequest<StorageStatusInfo>('/api/system/storage', {token}),
      ]);
      setTemplates(tplRes.templates);
      setSettings(setRes.settings);
      setStorageStatus(storRes);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load configuration.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  function openCreateTemplate() {
    setModalMode('create');
    setEditingTpl(null);
    setTplForm({
      ...EMPTY_TEMPLATE,
      signatoryName: settings?.punongBarangay || EMPTY_TEMPLATE.signatoryName,
    });
  }

  function openEditTemplate(tpl: DocumentTemplateRecord) {
    setModalMode('edit');
    setEditingTpl(tpl);
    setTplForm({
      name: tpl.name,
      category: tpl.category,
      defaultFee: tpl.defaultFee,
      requiresPayment: tpl.requiresPayment,
      validityDays: tpl.validityDays,
      headerTitle: tpl.headerTitle,
      bodyTemplate: tpl.bodyTemplate,
      signatoryName: tpl.signatoryName,
      signatoryTitle: tpl.signatoryTitle,
      isActive: tpl.isActive,
      description: tpl.description,
    });
  }

  async function handleSaveTemplate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (modalMode === 'create') {
        await apiRequest('/api/templates', {method: 'POST', token, body: tplForm});
      } else if (modalMode === 'edit' && editingTpl) {
        await apiRequest(`/api/templates/${editingTpl.id}`, {
          method: 'PATCH',
          token,
          body: tplForm,
        });
      }
      setModalMode(null);
      setMessage('Document template saved.');
      await fetchAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save template.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTemplate(tpl: DocumentTemplateRecord) {
    try {
      await apiRequest(`/api/templates/${tpl.id}`, {method: 'DELETE', token});
      setMessage(`Removed template "${tpl.name}".`);
      await fetchAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete template.');
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiRequest<{settings: BarangaySettings}>('/api/settings', {
        method: 'PATCH',
        token,
        body: settings,
      });
      setSettings(res.settings);
      setMessage('Barangay system settings updated.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update settings.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDownloadBackup() {
    try {
      const data = await apiRequest<Record<string, unknown>>('/api/backup/export', {token});
      const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `barangay-ocho-bdms-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to export backup.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            Settings &amp; Document Templates
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Configure barangay-issued document types, automated template wording, and local
            system details
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleDownloadBackup}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4" />
            Export Local Backup
          </button>
          {activeTab === 'templates' && (
            <button
              type="button"
              onClick={openCreateTemplate}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-800 hover:bg-blue-900 rounded-lg whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              New Document Type
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-center justify-between">
          <span>{message}</span>
          <button type="button" onClick={() => setMessage(null)} className="text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Segmented View Switcher */}
      <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('templates')}
          className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
            activeTab === 'templates'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Document Templates ({templates.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
            activeTab === 'settings'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Barangay System Settings
        </button>
      </div>

      {loading ? (
        <div className="p-8 bg-white border border-slate-200 rounded-xl text-center text-sm text-slate-500">
          Loading settings...
        </div>
      ) : activeTab === 'templates' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-mono-num">{tpl.code} · {tpl.category}</span>
                  <span
                    className={
                      tpl.isActive
                        ? 'font-semibold text-emerald-700'
                        : 'font-semibold text-slate-400'
                    }
                  >
                    {tpl.isActive ? 'Active' : 'Disabled'}
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 mt-1.5">{tpl.name}</h3>
                <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                  {tpl.description || tpl.headerTitle}
                </p>

                <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400 block">Standard Fee</span>
                    <span className="font-mono-num font-semibold text-slate-900">
                      {tpl.requiresPayment && tpl.defaultFee > 0
                        ? formatCurrencyPHP(tpl.defaultFee)
                        : 'Free / Exempt'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Validity</span>
                    <span className="font-mono-num font-medium text-slate-800">
                      {tpl.validityDays} days
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => openEditTemplate(tpl)}
                  className="text-xs font-semibold text-blue-800 hover:underline"
                >
                  Edit Template
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteTemplate(tpl)}
                  className="p-1 text-slate-400 hover:text-red-700"
                  title="Delete Template"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        settings && (
          <div className="space-y-6 max-w-3xl">
            {storageStatus && (
              <div className="bg-white border border-slate-200 rounded-xl p-5 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">
                      Active Database Storage
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {storageStatus.driver === 'mysql'
                        ? `Connected to MySQL (${storageStatus.mysqlTarget})`
                        : 'Using local JSON database (data/bdms-store.json)'}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-semibold ${
                      storageStatus.driver === 'mysql' ? 'text-emerald-700' : 'text-blue-800'
                    }`}
                  >
                    {storageStatus.driver === 'mysql' ? 'MySQL Active' : 'JSON Active'}
                  </span>
                </div>
                {storageStatus.mysqlError && (
                  <p className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                    MySQL fallback reason: {storageStatus.mysqlError}
                  </p>
                )}
                {!storageStatus.mysqlConfigured && (
                  <p className="mt-3 text-xs text-slate-600">
                    To switch to local MySQL when running offline, configure{' '}
                    <span className="font-mono-num">MYSQL_HOST</span>,{' '}
                    <span className="font-mono-num">MYSQL_PORT</span>,{' '}
                    <span className="font-mono-num">MYSQL_USER</span>,{' '}
                    <span className="font-mono-num">MYSQL_PASSWORD</span>, and{' '}
                    <span className="font-mono-num">MYSQL_DATABASE</span> in your local{' '}
                    <span className="font-mono-num">.env</span> file and restart the server.
                  </p>
                )}
              </div>
            )}

            <form
              onSubmit={handleSaveSettings}
              className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
            >
            <h3 className="text-base font-semibold text-slate-900">
              Barangay Header &amp; Signatory Configuration
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Barangay Name
                </label>
                <input
                  type="text"
                  value={settings.barangayName}
                  onChange={(e) => setSettings({...settings, barangayName: e.target.value})}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  City / Municipality
                </label>
                <input
                  type="text"
                  value={settings.cityMunicipal}
                  onChange={(e) => setSettings({...settings, cityMunicipal: e.target.value})}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Province</label>
                <input
                  type="text"
                  value={settings.province}
                  onChange={(e) => setSettings({...settings, province: e.target.value})}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Region</label>
                <input
                  type="text"
                  value={settings.region}
                  onChange={(e) => setSettings({...settings, region: e.target.value})}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Punong Barangay
                </label>
                <input
                  type="text"
                  value={settings.punongBarangay}
                  onChange={(e) => setSettings({...settings, punongBarangay: e.target.value})}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Barangay Secretary
                </label>
                <input
                  type="text"
                  value={settings.secretaryName}
                  onChange={(e) => setSettings({...settings, secretaryName: e.target.value})}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Barangay Treasurer
                </label>
                <input
                  type="text"
                  value={settings.treasurerName}
                  onChange={(e) => setSettings({...settings, treasurerName: e.target.value})}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Resident ID Prefix
                </label>
                <input
                  type="text"
                  value={settings.resPrefix}
                  onChange={(e) => setSettings({...settings, resPrefix: e.target.value})}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Transaction Ref Prefix
                </label>
                <input
                  type="text"
                  value={settings.txnPrefix}
                  onChange={(e) => setSettings({...settings, txnPrefix: e.target.value})}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-num"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Official Receipt Prefix
                </label>
                <input
                  type="text"
                  value={settings.orPrefix}
                  onChange={(e) => setSettings({...settings, orPrefix: e.target.value})}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-num"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Barangay Hall Address
              </label>
              <input
                type="text"
                value={settings.officeAddress}
                onChange={(e) => setSettings({...settings, officeAddress: e.target.value})}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-800 hover:bg-blue-900 rounded-lg"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>
          </div>
        )
      )}

      {/* Template Editor Modal */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-3xl rounded-xl border border-slate-200 shadow-xl overflow-hidden my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-base font-semibold text-slate-900">
                {modalMode === 'create'
                  ? 'Create Document Template'
                  : `Edit Template · ${editingTpl?.code}`}
              </h3>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleSaveTemplate}
              className="p-6 space-y-4 max-h-[82vh] overflow-y-auto"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Document Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={tplForm.name}
                    onChange={(e) => setTplForm({...tplForm, name: e.target.value})}
                    placeholder="e.g. Barangay Good Moral Certificate"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Official Header Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={tplForm.headerTitle}
                    onChange={(e) => setTplForm({...tplForm, headerTitle: e.target.value})}
                    placeholder="e.g. CERTIFICATE OF GOOD MORAL CHARACTER"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
                  <select
                    value={tplForm.category}
                    onChange={(e) =>
                      setTplForm({...tplForm, category: e.target.value as DocumentCategory})
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Clearance">Clearance</option>
                    <option value="Indigency">Indigency</option>
                    <option value="Residency">Residency</option>
                    <option value="Certification">Certification</option>
                    <option value="Identification">Identification</option>
                    <option value="Business">Business</option>
                    <option value="Custom">Custom</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Default Fee (PHP)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={tplForm.defaultFee}
                    onChange={(e) =>
                      setTplForm({...tplForm, defaultFee: Number(e.target.value) || 0})
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Validity (Days)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={tplForm.validityDays}
                    onChange={(e) =>
                      setTplForm({...tplForm, validityDays: Number(e.target.value) || 180})
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-num"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-700">
                    Template Body Text *
                  </label>
                  <span className="text-[11px] text-slate-500">
                    Click a variable to append it
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {PLACEHOLDER_TOKENS.map((tok) => (
                    <button
                      key={tok}
                      type="button"
                      onClick={() =>
                        setTplForm({...tplForm, bodyTemplate: `${tplForm.bodyTemplate} ${tok}`})
                      }
                      className="px-2 py-1 text-[11px] font-mono-num bg-slate-100 hover:bg-slate-200 text-slate-700 rounded border border-slate-200"
                    >
                      {tok}
                    </button>
                  ))}
                </div>
                <textarea
                  required
                  rows={7}
                  value={tplForm.bodyTemplate}
                  onChange={(e) => setTplForm({...tplForm, bodyTemplate: e.target.value})}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-serif leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Signatory Name
                  </label>
                  <input
                    type="text"
                    value={tplForm.signatoryName}
                    onChange={(e) => setTplForm({...tplForm, signatoryName: e.target.value})}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Signatory Title
                  </label>
                  <input
                    type="text"
                    value={tplForm.signatoryTitle}
                    onChange={(e) => setTplForm({...tplForm, signatoryTitle: e.target.value})}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={tplForm.description}
                  onChange={(e) => setTplForm({...tplForm, description: e.target.value})}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex flex-wrap gap-6 text-xs text-slate-700">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tplForm.requiresPayment}
                    onChange={(e) => setTplForm({...tplForm, requiresPayment: e.target.checked})}
                    className="rounded border-slate-300 text-blue-800"
                  />
                  Requires Treasury Payment
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tplForm.isActive}
                    onChange={(e) => setTplForm({...tplForm, isActive: e.target.checked})}
                    className="rounded border-slate-300 text-blue-800"
                  />
                  Template Active for Issuance
                </label>
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
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
                  {saving ? 'Saving...' : 'Save Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
