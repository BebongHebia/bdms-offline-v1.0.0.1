import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  AlertTriangle,
  Camera,
  FilePlus2,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
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

function getInitials(r: Pick<ResidentRecord, 'firstName' | 'lastName'>): string {
  const f = r.firstName?.trim().charAt(0) || '';
  const l = r.lastName?.trim().charAt(0) || '';
  return `${f}${l}`.toUpperCase() || 'R';
}

function ResidentAvatar({
  resident,
  size = 'sm',
}: {
  resident: Pick<ResidentRecord, 'firstName' | 'lastName' | 'photoUrl'>;
  size?: 'sm' | 'lg';
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const dims = size === 'lg' ? 'w-20 h-20 text-xl' : 'w-9 h-9 text-xs';

  useEffect(() => {
    setImgFailed(false);
  }, [resident.photoUrl]);

  if (resident.photoUrl && !imgFailed) {
    return (
      <img
        src={resident.photoUrl}
        alt={`${resident.firstName} ${resident.lastName}`}
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className={`${dims} rounded-full object-cover border border-slate-200 bg-slate-100 shrink-0`}
      />
    );
  }

  return (
    <div
      aria-label={`${resident.firstName} ${resident.lastName} initials`}
      className={`${dims} rounded-full border border-slate-200 bg-slate-100 text-slate-600 font-semibold flex items-center justify-center shrink-0`}
    >
      {getInitials(resident)}
    </div>
  );
}

async function resizeImageFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read selected image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Unsupported or corrupted image file.'));
      img.onload = () => {
        const maxSide = 480;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
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
  const [sexFilter, setSexFilter] = useState<'All' | 'Male' | 'Female'>('All');
  const [classificationFilter, setClassificationFilter] = useState<
    'All' | 'Voter' | 'Senior' | 'PWD' | 'Regular'
  >('All');

  // Bulk selection state (Admin)
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Add / Edit Modal
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingResident, setEditingResident] = useState<ResidentRecord | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [photoDataUrl, setPhotoDataUrl] = useState<string>('');
  const [removePhoto, setRemovePhoto] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Camera Capture state
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Profile Drawer / Modal
  const [viewingResident, setViewingResident] = useState<ResidentRecord | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraOpen(false);
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [resRes, txnRes] = await Promise.all([
        apiRequest<{residents: ResidentRecord[]}>('/api/residents', {token}),
        apiRequest<{transactions: TransactionRecord[]}>('/api/transactions', {token}),
      ]);
      setResidents(resRes.residents);
      setTransactions(txnRes.transactions);
      setSelectedIds((prev) => prev.filter((id) => resRes.residents.some((r) => r.id === id)));
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
      if (sexFilter !== 'All' && r.sex !== sexFilter) return false;
      if (classificationFilter !== 'All') {
        if (classificationFilter === 'Voter' && !r.voterStatus) return false;
        if (classificationFilter === 'Senior' && !r.seniorCitizenStatus) return false;
        if (classificationFilter === 'PWD' && !r.pwdStatus) return false;
        if (
          classificationFilter === 'Regular' &&
          (r.voterStatus || r.seniorCitizenStatus || r.pwdStatus)
        ) {
          return false;
        }
      }
      if (!q) return true;
      const full = `${r.firstName} ${r.middleName} ${r.lastName} ${r.suffix}`.toLowerCase();
      return (
        full.includes(q) ||
        r.code.toLowerCase().includes(q) ||
        r.purok.toLowerCase().includes(q) ||
        r.occupation.toLowerCase().includes(q)
      );
    });
  }, [residents, search, purokFilter, sexFilter, classificationFilter]);

  // Automatic duplicate detection while adding OR editing
  const livePossibleDuplicates = useMemo(() => {
    if (!modalMode) return [];
    const fn = form.firstName.trim().toLowerCase();
    const ln = form.lastName.trim().toLowerCase();
    const bday = form.bday.trim();
    if (!fn && !ln) return [];

    return residents.filter((r) => {
      if (modalMode === 'edit' && editingResident && r.id === editingResident.id) {
        return false;
      }
      const rfn = r.firstName.trim().toLowerCase();
      const rln = r.lastName.trim().toLowerCase();
      const nameMatch = Boolean(fn && ln && rfn === fn && rln === ln);
      const lastAndBdayMatch = Boolean(ln && bday && rln === ln && r.bday === bday);
      const partialMatch = Boolean(fn.length >= 2 && ln.length >= 2 && rln.includes(ln) && rfn.includes(fn));
      return nameMatch || lastAndBdayMatch || partialMatch;
    });
  }, [modalMode, editingResident, form.firstName, form.lastName, form.bday, residents]);

  const allFilteredSelected =
    filteredResidents.length > 0 && filteredResidents.every((r) => selectedIds.includes(r.id));

  function toggleSelectAllFiltered() {
    if (allFilteredSelected) {
      const filteredSet = new Set(filteredResidents.map((r) => r.id));
      setSelectedIds((prev) => prev.filter((id) => !filteredSet.has(id)));
    } else {
      const next = new Set(selectedIds);
      filteredResidents.forEach((r) => next.add(r.id));
      setSelectedIds(Array.from(next));
    }
  }

  function toggleSelectRow(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  function openCreateModal() {
    stopCamera();
    setModalMode('create');
    setEditingResident(null);
    setForm(EMPTY_FORM);
    setPhotoDataUrl('');
    setRemovePhoto(false);
    setCameraError(null);
    setFormError(null);
  }

  function openEditModal(r: ResidentRecord) {
    stopCamera();
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
    setPhotoDataUrl('');
    setRemovePhoto(false);
    setCameraError(null);
    setFormError(null);
  }

  function closeModal() {
    stopCamera();
    setModalMode(null);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCameraError(null);
    setFormError(null);
    try {
      const dataUrl = await resizeImageFileToDataUrl(file);
      setPhotoDataUrl(dataUrl);
      setRemovePhoto(false);
      stopCamera();
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : 'Unable to process uploaded image.');
    } finally {
      e.target.value = '';
    }
  }

  async function startCamera() {
    setCameraError(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Device camera is not supported in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {facingMode: 'user', width: {ideal: 640}, height: {ideal: 480}},
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      setCameraError(
        'Camera permission was denied or no camera device was found. You can upload a photo file instead.',
      );
    }
  }

  function captureCameraPhoto() {
    const video = videoRef.current;
    if (!video) return;
    const w = video.videoWidth || 480;
    const h = video.videoHeight || 360;
    const maxSide = 480;
    const scale = Math.min(1, maxSide / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
    setPhotoDataUrl(dataUrl);
    setRemovePhoto(false);
    stopCamera();
  }

  async function handleSaveResident(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      if (modalMode === 'create') {
        await apiRequest('/api/residents', {
          method: 'POST',
          token,
          body: {...form, photoDataUrl: photoDataUrl || undefined},
        });
      } else if (modalMode === 'edit' && editingResident) {
        await apiRequest(`/api/residents/${editingResident.id}`, {
          method: 'PATCH',
          token,
          body: {
            ...form,
            photoDataUrl: photoDataUrl || undefined,
            removePhoto,
          },
        });
      }
      stopCamera();
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

  async function handleBulkDeleteConfirm() {
    if (selectedIds.length === 0) return;
    setBulkDeleting(true);
    try {
      await apiRequest('/api/residents/bulk-delete', {
        method: 'POST',
        token,
        body: {ids: selectedIds},
      });
      setSelectedIds([]);
      setConfirmBulkDelete(false);
      await fetchData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete selected residents.');
      setConfirmBulkDelete(false);
    } finally {
      setBulkDeleting(false);
    }
  }

  const previewAge = computePreviewAge(form.bday);
  const currentModalPhotoSrc = removePhoto
    ? ''
    : photoDataUrl || (modalMode === 'edit' ? editingResident?.photoUrl || '' : '');

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
          {user.role === 'Admin' && selectedIds.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmBulkDelete(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-700 hover:bg-red-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Trash2 className="w-4 h-4" />
              {allFilteredSelected && selectedIds.length === residents.length
                ? `Delete All (${selectedIds.length})`
                : `Delete Selected (${selectedIds.length})`}
            </button>
          )}
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

      {/* Search & Dropdown Filters (Purok, Sex, Classification) */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-600 mb-1">Search Resident</label>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, ID, or occupation..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-800/20 focus:border-blue-800"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Purok</label>
          <select
            value={purokFilter}
            onChange={(e) => setPurokFilter(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-800/20 focus:border-blue-800"
          >
            {PUROK_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p === 'All' ? 'All Puroks' : p}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Sex</label>
          <select
            value={sexFilter}
            onChange={(e) => setSexFilter(e.target.value as 'All' | 'Male' | 'Female')}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-800/20 focus:border-blue-800"
          >
            <option value="All">All Sexes</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Classification</label>
          <select
            value={classificationFilter}
            onChange={(e) =>
              setClassificationFilter(
                e.target.value as 'All' | 'Voter' | 'Senior' | 'PWD' | 'Regular',
              )
            }
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-800/20 focus:border-blue-800"
          >
            <option value="All">All Classifications</option>
            <option value="Voter">Registered Voter</option>
            <option value="Senior">Senior Citizen</option>
            <option value="PWD">PWD</option>
            <option value="Regular">Regular</option>
          </select>
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
                  {user.role === 'Admin' && (
                    <th className="py-3 pl-4 pr-2 font-medium w-10">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer" title="Select all rows for Delete All">
                        <input
                          type="checkbox"
                          checked={allFilteredSelected}
                          onChange={toggleSelectAllFiltered}
                          aria-label="Select all residents"
                          className="rounded border-slate-300 text-blue-800 focus:ring-blue-800"
                        />
                      </label>
                    </th>
                  )}
                  <th className="py-3 px-4 font-medium">Resident</th>
                  <th className="py-3 px-4 font-medium">Resident ID</th>
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
                  const isChecked = selectedIds.includes(r.id);
                  return (
                    <tr
                      key={r.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isChecked ? 'bg-blue-50/40' : ''
                      }`}
                    >
                      {user.role === 'Admin' && (
                        <td className="py-3 pl-4 pr-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelectRow(r.id)}
                            aria-label={`Select ${r.firstName} ${r.lastName}`}
                            className="rounded border-slate-300 text-blue-800 focus:ring-blue-800"
                          />
                        </td>
                      )}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <ResidentAvatar resident={r} size="sm" />
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => setViewingResident(r)}
                              className="font-semibold text-slate-900 hover:text-blue-800 text-left block"
                            >
                              {r.lastName}, {r.firstName}{' '}
                              {r.middleName ? `${r.middleName.charAt(0)}.` : ''} {r.suffix}
                            </button>
                            <div className="text-xs text-slate-500 truncate">
                              {r.civilStatus} · {r.occupation || 'Unspecified occupation'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono-num text-xs font-medium text-slate-700 whitespace-nowrap">
                        {r.code}
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
                            onClick={() => openEditModal(r)}
                            className="text-xs font-medium text-blue-800 hover:underline px-2 py-1"
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
                onClick={closeModal}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleSaveResident}
              className="p-6 space-y-4 max-h-[82vh] overflow-y-auto"
            >
              {formError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  {formError}
                </div>
              )}

              {/* Automatic duplicate recognition while adding or editing */}
              {livePossibleDuplicates.length > 0 && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
                  <p className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-700" />
                    Possible duplicate resident record(s) recognized:
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

              {/* Resident Photo Upload / Device Camera Capture */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <ResidentAvatar
                      resident={{
                        firstName: form.firstName || 'R',
                        lastName: form.lastName || '',
                        photoUrl: currentModalPhotoSrc,
                      }}
                      size="lg"
                    />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Resident Photo</p>
                      <p className="text-xs text-slate-500">
                        Upload an image file or take a picture using the device camera
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg cursor-pointer whitespace-nowrap">
                      <Upload className="w-3.5 h-3.5" />
                      Upload Photo
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleFileUpload}
                        className="sr-only"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={cameraOpen ? stopCamera : startCamera}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-800 hover:bg-blue-900 rounded-lg whitespace-nowrap"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      {cameraOpen ? 'Close Camera' : 'Take Picture'}
                    </button>
                    {currentModalPhotoSrc && (
                      <button
                        type="button"
                        onClick={() => {
                          setPhotoDataUrl('');
                          setRemovePhoto(true);
                        }}
                        className="px-2.5 py-1.5 text-xs font-medium text-red-700 hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>

                {cameraError && (
                  <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
                    {cameraError}
                  </p>
                )}

                {cameraOpen && (
                  <div className="pt-2 space-y-2">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full max-w-sm rounded-lg border border-slate-300 bg-slate-900 mx-auto"
                    />
                    <div className="flex justify-center gap-2">
                      <button
                        type="button"
                        onClick={captureCameraPhoto}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        Capture Photo
                      </button>
                      <button
                        type="button"
                        onClick={stopCamera}
                        className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
                      >
                        Cancel Camera
                      </button>
                    </div>
                  </div>
                )}
              </div>

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
                  onClick={closeModal}
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

      {/* Bulk Delete Confirmation Modal */}
      {confirmBulkDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="bg-white w-full max-w-md rounded-xl border border-slate-200 shadow-xl p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Confirm Resident Deletion
            </h3>
            <p className="text-sm text-slate-600">
              You are about to permanently delete{' '}
              <span className="font-semibold text-slate-900">{selectedIds.length}</span> selected
              resident record(s) and their stored local photos. This action cannot be undone.
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

      {/* Individual Resident Profile Modal */}
      {viewingResident && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-xl border border-slate-200 shadow-xl overflow-hidden my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-4">
                <ResidentAvatar resident={viewingResident} size="lg" />
                <div>
                  <p className="text-xs font-mono-num text-slate-500">{viewingResident.code}</p>
                  <h3 className="text-lg font-bold text-slate-900">
                    {viewingResident.firstName} {viewingResident.middleName}{' '}
                    {viewingResident.lastName} {viewingResident.suffix}
                  </h3>
                </div>
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
