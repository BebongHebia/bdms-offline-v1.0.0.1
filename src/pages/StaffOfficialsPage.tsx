import {useCallback, useEffect, useRef, useState} from 'react';
import {Camera, Plus, Search, Trash2, Upload, X} from 'lucide-react';
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

function getInitials(name: string): string {
  const cleaned = name
    .replace(/^Hon\.\s+/i, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (cleaned.length === 0) return 'OF';
  if (cleaned.length === 1) return cleaned[0].slice(0, 2).toUpperCase();
  return `${cleaned[0].charAt(0)}${cleaned[cleaned.length - 1].charAt(0)}`.toUpperCase();
}

function OfficialAvatar({
  fullName,
  photoUrl,
  size = 'sm',
}: {
  fullName: string;
  photoUrl?: string;
  size?: 'sm' | 'lg';
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const dims = size === 'lg' ? 'w-20 h-20 text-lg' : 'w-10 h-10 text-xs';

  useEffect(() => {
    setImgFailed(false);
  }, [photoUrl]);

  if (photoUrl && !imgFailed) {
    return (
      <img
        src={photoUrl}
        alt={fullName}
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className={`${dims} rounded-full object-cover border border-slate-200 bg-slate-100 shrink-0`}
      />
    );
  }

  return (
    <div
      aria-label={`${fullName} initials`}
      className={`${dims} rounded-full border border-slate-200 bg-slate-100 text-slate-600 font-semibold flex items-center justify-center shrink-0`}
    >
      {getInitials(fullName)}
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

export function StaffOfficialsPage({token}: StaffOfficialsPageProps) {
  const [officials, setOfficials] = useState<StaffOfficialRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<StaffOfficialRecord | null>(null);
  const [form, setForm] = useState(EMPTY_OFFICIAL);
  const [photoDataUrl, setPhotoDataUrl] = useState<string>('');
  const [removePhoto, setRemovePhoto] = useState(false);
  const [saving, setSaving] = useState(false);

  // Camera capture state
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

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
    stopCamera();
    setModalMode('create');
    setEditing(null);
    setForm(EMPTY_OFFICIAL);
    setPhotoDataUrl('');
    setRemovePhoto(false);
    setCameraError(null);
  }

  function openEdit(o: StaffOfficialRecord) {
    stopCamera();
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
    setPhotoDataUrl('');
    setRemovePhoto(false);
    setCameraError(null);
  }

  function closeModal() {
    stopCamera();
    setModalMode(null);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCameraError(null);
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

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (modalMode === 'create') {
        await apiRequest('/api/staff', {
          method: 'POST',
          token,
          body: {...form, photoDataUrl: photoDataUrl || undefined},
        });
      } else if (modalMode === 'edit' && editing) {
        await apiRequest(`/api/staff/${editing.id}`, {
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

  const currentModalPhotoSrc = removePhoto
    ? ''
    : photoDataUrl || (modalMode === 'edit' ? editing?.photoUrl || '' : '');

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
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-xs underline">
            Dismiss
          </button>
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
                  <th className="py-3 px-4 font-medium">Official / Staff</th>
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
                    <td className="py-3 px-4 font-mono-num text-xs text-slate-500 whitespace-nowrap">
                      {o.code}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <OfficialAvatar fullName={o.fullName} photoUrl={o.photoUrl} size="sm" />
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900">{o.fullName}</div>
                          {o.contactNumber && (
                            <div className="text-xs font-mono-num text-slate-500">
                              {o.contactNumber}
                            </div>
                          )}
                        </div>
                      </div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-lg rounded-xl border border-slate-200 shadow-xl overflow-hidden my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-base font-semibold text-slate-900">
                {modalMode === 'create' ? 'Add Official or Staff' : 'Edit Official / Staff'}
              </h3>
              <button
                type="button"
                onClick={closeModal}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
              {/* Official Photo Upload / Camera Capture */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <OfficialAvatar
                      fullName={form.fullName || 'Official'}
                      photoUrl={currentModalPhotoSrc}
                      size="lg"
                    />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Official Photo</p>
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
                  onClick={closeModal}
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
