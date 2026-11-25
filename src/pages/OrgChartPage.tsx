import {useEffect, useState} from 'react';
import {Printer} from 'lucide-react';
import {BarangaySeal} from '../components/BarangaySeal';
import {apiRequest, ApiError} from '../lib/api';
import type {BarangaySettings, StaffOfficialRecord} from '../types/bdms';

interface OrgChartPageProps {
  token: string;
}

export function OrgChartPage({token}: OrgChartPageProps) {
  const [officials, setOfficials] = useState<StaffOfficialRecord[]>([]);
  const [settings, setSettings] = useState<BarangaySettings | null>(null);
  const [selected, setSelected] = useState<StaffOfficialRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      apiRequest<{staffOfficials: StaffOfficialRecord[]}>('/api/staff', {token}),
      apiRequest<{settings: BarangaySettings}>('/api/settings', {token}),
    ])
      .then(([staffRes, setRes]) => {
        if (active) {
          setOfficials(staffRes.staffOfficials.filter((o) => o.status === 'Active'));
          setSettings(setRes.settings);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof ApiError ? err.message : 'Failed to load org chart.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  const tier1 = officials.filter((o) => o.tier === 1);
  const tier2 = officials.filter((o) => o.tier === 2);
  const tier3 = officials.filter((o) => o.tier === 3);

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Organizational Chart</h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Official governance and operational hierarchy of Barangay Ocho
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-800 hover:bg-blue-900 rounded-lg whitespace-nowrap shrink-0"
        >
          <Printer className="w-4 h-4" />
          Print Organizational Chart
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-8 print-only-container">
        <div className="flex items-center justify-center gap-4 pb-6 border-b border-slate-200">
          <BarangaySeal size={56} />
          <div className="text-center">
            <p className="text-xs uppercase tracking-wider text-slate-500">
              Republic of the Philippines · {settings?.province || 'Bukidnon'}
            </p>
            <h3 className="text-xl font-bold text-slate-900">
              {settings?.barangayName || 'Barangay Ocho'},{' '}
              {settings?.cityMunicipal || 'Malaybalay City'}
            </h3>
            <p className="text-xs font-medium text-blue-800">
              Barangay Government Organizational Structure
            </p>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-slate-500">
            Loading organizational chart...
          </div>
        ) : officials.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">
            No active officials registered. Add personnel in Staff &amp; Officials.
          </div>
        ) : (
          <div className="mt-8 space-y-8">
            {/* Tier 1: Punong Barangay */}
            <div className="flex flex-col items-center">
              <p className="text-xs font-medium text-slate-500 mb-3">Executive Leadership</p>
              <div className="flex flex-wrap justify-center gap-4">
                {tier1.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setSelected(o)}
                    className="w-72 text-center border-2 border-blue-900 bg-slate-900 text-white rounded-xl p-4 hover:bg-slate-800 transition-colors"
                  >
                    <p className="text-xs text-blue-200 font-medium">{o.position}</p>
                    <p className="text-base font-bold mt-1">{o.fullName}</p>
                    {o.committee && <p className="text-xs text-slate-300 mt-1">{o.committee}</p>}
                  </button>
                ))}
              </div>
              {tier2.length > 0 && <div className="w-px h-8 bg-slate-300" />}
            </div>

            {/* Tier 2: Sangguniang Barangay & Executive Officers */}
            {tier2.length > 0 && (
              <div className="flex flex-col items-center">
                <p className="text-xs font-medium text-slate-500 mb-3">
                  Sangguniang Barangay &amp; Barangay Officers
                </p>
                <div className="w-full max-w-5xl border-t border-slate-300 pt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {tier2.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setSelected(o)}
                      className="text-left border border-slate-200 bg-slate-50 hover:border-blue-800 hover:bg-white rounded-xl p-4 transition-colors"
                    >
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span className="font-medium text-blue-800">{o.position}</span>
                        <span className="font-mono-num">{o.code}</span>
                      </div>
                      <p className="text-sm font-bold text-slate-900 mt-1">{o.fullName}</p>
                      {o.committee && (
                        <p className="text-xs text-slate-600 mt-1 line-clamp-2">{o.committee}</p>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Tier 3: Staff & Support Units */}
            {tier3.length > 0 && (
              <div className="flex flex-col items-center pt-2">
                <p className="text-xs font-medium text-slate-500 mb-3">
                  Operational Staff &amp; Peacekeeping Units
                </p>
                <div className="w-full max-w-4xl border-t border-dashed border-slate-300 pt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {tier3.map((o) => {
                    const supervisor = officials.find((sup) => sup.code === o.reportsTo);
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setSelected(o)}
                        className="text-left border border-slate-200 bg-white hover:border-blue-800 rounded-xl p-4 transition-colors"
                      >
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span className="font-medium text-slate-700">{o.position}</span>
                          <span className="font-mono-num">{o.code}</span>
                        </div>
                        <p className="text-sm font-semibold text-slate-900 mt-1">{o.fullName}</p>
                        {supervisor && (
                          <p className="text-[11px] text-slate-500 mt-1.5">
                            Reports to: {supervisor.fullName}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Selected Official Detail Bar */}
      {selected && (
        <div className="no-print bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs text-slate-500 font-mono-num">
              {selected.code} · Tier {selected.tier}
            </p>
            <h4 className="text-base font-bold text-slate-900">
              {selected.fullName} — {selected.position}
            </h4>
            <p className="text-xs text-slate-600 mt-0.5">
              Committee: {selected.committee || 'General'} · Contact:{' '}
              {selected.contactNumber || 'N/A'} · Term: {selected.termStart} to {selected.termEnd}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="text-xs font-medium text-slate-600 hover:text-slate-900 self-start sm:self-center"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
