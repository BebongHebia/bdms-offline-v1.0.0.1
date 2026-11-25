import {useState} from 'react';
import {Eye, EyeOff, Lock, ShieldCheck, User} from 'lucide-react';
import {BarangaySeal} from '../components/BarangaySeal';
import {apiRequest, ApiError} from '../lib/api';
import type {AuthBootstrapStatus, AuthSession} from '../types/bdms';

interface LoginPageProps {
  bootstrapStatus: AuthBootstrapStatus;
  onAuthenticated: (session: AuthSession) => void;
}

export function LoginPage({bootstrapStatus, onAuthenticated}: LoginPageProps) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // First-run initial administrator setup state
  const [adminFullName, setAdminFullName] = useState('');
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminConfirm, setAdminConfirm] = useState('');
  const [includeSampleData, setIncludeSampleData] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!identifier.trim() || !password) {
      setError('Please enter both your username or email and password.');
      return;
    }

    setSubmitting(true);
    try {
      const session = await apiRequest<AuthSession>('/api/auth/login', {
        method: 'POST',
        body: {identifier: identifier.trim(), password},
      });
      onAuthenticated(session);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleBootstrapSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!adminFullName.trim() || !adminUsername.trim()) {
      setError('Administrator full name and username are required.');
      return;
    }
    if (adminPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (adminPassword !== adminConfirm) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const session = await apiRequest<AuthSession>('/api/auth/bootstrap', {
        method: 'POST',
        body: {
          fullName: adminFullName.trim(),
          username: adminUsername.trim(),
          email: adminEmail.trim(),
          password: adminPassword,
          includeSampleData,
        },
      });
      onAuthenticated(session);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Setup failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Left Civic Identity Column */}
      <div className="lg:w-5/12 bg-slate-900 text-white p-8 sm:p-12 lg:p-14 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-4">
            <BarangaySeal size={60} className="shrink-0" />
            <div>
              <p className="text-xs text-slate-400 tracking-wide">
                Republic of the Philippines · {bootstrapStatus.province}
              </p>
              <h1 className="text-xl font-bold tracking-tight text-white">
                {bootstrapStatus.barangayName}, {bootstrapStatus.cityMunicipal}
              </h1>
            </div>
          </div>

          <div className="mt-14 max-w-md">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white [text-wrap:balance]">
              Barangay Document Management System
            </h2>
            <p className="mt-4 text-base text-slate-300 leading-relaxed">
              Centralized local network workspace for resident records, automated official
              document issuance, transaction tracking, and barangay treasury collections.
            </p>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-slate-800 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="font-semibold text-white">Admin</p>
              <p className="text-xs text-slate-400 mt-1">
                Users, templates, officials, org chart &amp; reports
              </p>
            </div>
            <div>
              <p className="font-semibold text-white">Staff / Clerk</p>
              <p className="text-xs text-slate-400 mt-1">
                Resident intake, document requests &amp; printing
              </p>
            </div>
            <div>
              <p className="font-semibold text-white">Treasurer</p>
              <p className="text-xs text-slate-400 mt-1">
                Payment recording, OR receipts &amp; collections
              </p>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Local Server Mode · Operates offline without external internet dependency
          </p>
        </div>
      </div>

      {/* Right Authentication Column */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8">
          {bootstrapStatus.needsInitialSetup ? (
            <>
              <div className="flex items-center gap-2 text-blue-800 mb-2">
                <ShieldCheck className="w-5 h-5" />
                <span className="text-sm font-semibold">First-Time System Setup</span>
              </div>
              <h2 className="text-2xl font-bold text-slate-900">
                Create Administrator Account
              </h2>
              <p className="mt-1.5 text-sm text-slate-600">
                Set up the initial System Administrator credentials for {bootstrapStatus.barangayName}{' '}
                BDMS. Once created, you can add Staff and Treasurer accounts in Users.
              </p>

              {error && (
                <div
                  role="alert"
                  className="mt-5 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700"
                >
                  {error}
                </div>
              )}

              <form onSubmit={handleBootstrapSubmit} className="mt-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={adminFullName}
                    onChange={(e) => setAdminFullName(e.target.value)}
                    placeholder="e.g. Elena G. Dumlao"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-800/20 focus:border-blue-800"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Username
                    </label>
                    <input
                      type="text"
                      required
                      value={adminUsername}
                      onChange={(e) => setAdminUsername(e.target.value)}
                      placeholder="admin"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-800/20 focus:border-blue-800"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Email (optional)
                    </label>
                    <input
                      type="email"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder="admin@brgy8.local"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-800/20 focus:border-blue-800"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      className="w-full pl-3.5 pr-10 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-800/20 focus:border-blue-800"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Confirm Password
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={adminConfirm}
                    onChange={(e) => setAdminConfirm(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-800/20 focus:border-blue-800"
                  />
                </div>

                <label className="flex items-start gap-2.5 pt-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeSampleData}
                    onChange={(e) => setIncludeSampleData(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-blue-800 focus:ring-blue-800"
                  />
                  <span className="text-xs text-slate-600">
                    Load initial Barangay Ocho directory, Purok residents, and sample transactions
                    for immediate evaluation
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-900 disabled:opacity-60 rounded-lg transition-colors"
                >
                  {submitting ? 'Initializing System...' : 'Complete Setup & Sign In'}
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-slate-900">Sign In</h2>
              <p className="mt-1.5 text-sm text-slate-600">
                Enter your registered barangay personnel credentials to continue.
              </p>

              {error && (
                <div
                  role="alert"
                  className="mt-5 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700"
                >
                  {error}
                </div>
              )}

              <form onSubmit={handleLoginSubmit} className="mt-6 space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Username or Email
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      autoComplete="username"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="Enter username or email"
                      className="w-full pl-10 pr-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-800/20 focus:border-blue-800"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password"
                      className="w-full pl-10 pr-10 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-800/20 focus:border-blue-800"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-blue-800 hover:bg-blue-900 disabled:opacity-60 rounded-lg transition-colors"
                >
                  {submitting ? 'Signing In...' : 'Sign In'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
