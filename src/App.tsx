import {useEffect, useMemo, useState} from 'react';
import {
  BarChart3,
  Building2,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Network,
  Settings,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import {BarangaySeal} from './components/BarangaySeal';
import {apiRequest} from './lib/api';
import {DashboardPage, type AppPage} from './pages/DashboardPage';
import {LoginPage} from './pages/LoginPage';
import {OrgChartPage} from './pages/OrgChartPage';
import {PaymentsPage} from './pages/PaymentsPage';
import {ReportsPage} from './pages/ReportsPage';
import {ResidentsPage} from './pages/ResidentsPage';
import {SettingsTemplatesPage} from './pages/SettingsTemplatesPage';
import {StaffOfficialsPage} from './pages/StaffOfficialsPage';
import {TransactionsPage} from './pages/TransactionsPage';
import {UsersPage} from './pages/UsersPage';
import type {AuthBootstrapStatus, AuthSession, UserRole} from './types/bdms';

interface NavItem {
  id: AppPage;
  label: string;
  roles: UserRole[];
  icon: typeof LayoutDashboard;
}

const NAV_ITEMS: NavItem[] = [
  {id: 'dashboard', label: 'Dashboard', roles: ['Admin', 'Staff', 'Treasurer'], icon: LayoutDashboard},
  {id: 'users', label: 'Users', roles: ['Admin'], icon: UserCog},
  {id: 'residents', label: 'Residents', roles: ['Admin', 'Staff'], icon: Users},
  {id: 'transactions', label: 'Transactions', roles: ['Admin', 'Staff', 'Treasurer'], icon: FileText},
  {id: 'payments', label: 'Payments', roles: ['Treasurer'], icon: CreditCard},
  {id: 'staff', label: 'Staff & Officials', roles: ['Admin'], icon: Building2},
  {id: 'orgchart', label: 'Organizational Chart', roles: ['Admin'], icon: Network},
  {id: 'reports', label: 'Reports', roles: ['Admin', 'Staff', 'Treasurer'], icon: BarChart3},
  {id: 'settings', label: 'Settings & Templates', roles: ['Admin'], icon: Settings},
];

export default function App() {
  const [bootstrapStatus, setBootstrapStatus] = useState<AuthBootstrapStatus | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [activePage, setActivePage] = useState<AppPage>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [preselectedResidentCode, setPreselectedResidentCode] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest<AuthBootstrapStatus>('/api/auth/status').catch(() => ({
        needsInitialSetup: false,
        hasEnvPasscode: false,
        barangayName: 'Barangay Ocho',
        cityMunicipal: 'Malaybalay City',
        province: 'Bukidnon',
      })),
      apiRequest<AuthSession>('/api/auth/me').catch(() => null),
    ]).then(([statusRes, meRes]) => {
      if (!active) return;
      setBootstrapStatus(statusRes);
      if (meRes && meRes.user && meRes.token) {
        setSession(meRes);
      }
      setCheckingSession(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const allowedNavItems = useMemo(() => {
    if (!session) return [];
    return NAV_ITEMS.filter((item) => item.roles.includes(session.user.role));
  }, [session]);

  function handleAuthenticated(nextSession: AuthSession) {
    setSession(nextSession);
    setActivePage('dashboard');
  }

  async function handleSignOut() {
    try {
      await apiRequest('/api/auth/logout', {method: 'POST', token: session?.token});
    } catch {
      // Ignore network errors on logout
    }
    setSession(null);
    setActivePage('dashboard');
    apiRequest<AuthBootstrapStatus>('/api/auth/status')
      .then((res) => setBootstrapStatus(res))
      .catch(() => {});
  }

  if (!bootstrapStatus || checkingSession) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-500">
        Loading Barangay Ocho BDMS...
      </div>
    );
  }

  if (!session) {
    return <LoginPage bootstrapStatus={bootstrapStatus} onAuthenticated={handleAuthenticated} />;
  }

  const currentNav = allowedNavItems.find((n) => n.id === activePage) || allowedNavItems[0];
  const currentPageId: AppPage = currentNav ? currentNav.id : 'dashboard';

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="no-print hidden lg:flex lg:w-64 lg:flex-col bg-slate-900 text-slate-100 shrink-0 border-r border-slate-800">
        <div className="px-5 py-5 border-b border-slate-800 flex items-center gap-3">
          <BarangaySeal size={38} className="shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">Barangay Ocho</p>
            <p className="text-[11px] text-slate-400 truncate">Malaybalay City · BDMS</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {allowedNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPageId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActivePage(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-800 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="mb-3">
            <p className="text-xs font-semibold text-white truncate">{session.user.fullName}</p>
            <p className="text-[11px] text-slate-400">
              {session.user.role} · {session.user.username}
            </p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileMenuOpen && (
        <div className="no-print fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-64 max-w-full bg-slate-900 text-slate-100 flex flex-col z-10">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <BarangaySeal size={32} />
                <span className="text-sm font-bold text-white">Barangay Ocho</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {allowedNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentPageId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActivePage(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                      isActive
                        ? 'bg-blue-800 text-white'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-800">
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Workspace Top Bar */}
        <header className="no-print bg-white border-b border-slate-200 px-4 sm:px-8 h-14 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 text-slate-600 hover:text-slate-900 rounded-lg"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-500 truncate">
              <span className="font-semibold text-slate-900 whitespace-nowrap">
                Barangay Ocho BDMS
              </span>
              <span aria-hidden="true">/</span>
              <span className="text-slate-700 font-medium truncate">
                {currentNav?.label || 'Dashboard'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0 text-xs text-slate-600">
            <span className="hidden sm:inline whitespace-nowrap">
              {session.user.fullName} ({session.user.role})
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              className="lg:hidden text-xs font-medium text-slate-700 hover:text-slate-900 whitespace-nowrap"
            >
              Sign Out
            </button>
          </div>
        </header>

        {/* Active Page Viewport */}
        <main className="flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto">
          {currentPageId === 'dashboard' && (
            <DashboardPage
              token={session.token}
              user={session.user}
              onNavigate={(page) => setActivePage(page)}
            />
          )}
          {currentPageId === 'users' && session.user.role === 'Admin' && (
            <UsersPage token={session.token} currentUser={session.user} />
          )}
          {currentPageId === 'residents' &&
            (session.user.role === 'Admin' || session.user.role === 'Staff') && (
              <ResidentsPage
                token={session.token}
                user={session.user}
                onCreateRequestForResident={(code) => {
                  setPreselectedResidentCode(code);
                  setActivePage('transactions');
                }}
              />
            )}
          {currentPageId === 'transactions' && (
            <TransactionsPage
              token={session.token}
              user={session.user}
              preselectedResidentCode={preselectedResidentCode}
              onClearPreselectedResident={() => setPreselectedResidentCode(null)}
              onNavigateToPayments={() => setActivePage('payments')}
            />
          )}
          {currentPageId === 'payments' && session.user.role === 'Treasurer' && (
            <PaymentsPage token={session.token} />
          )}
          {currentPageId === 'staff' && session.user.role === 'Admin' && (
            <StaffOfficialsPage token={session.token} />
          )}
          {currentPageId === 'orgchart' && session.user.role === 'Admin' && (
            <OrgChartPage token={session.token} />
          )}
          {currentPageId === 'reports' && (
            <ReportsPage token={session.token} user={session.user} />
          )}
          {currentPageId === 'settings' && session.user.role === 'Admin' && (
            <SettingsTemplatesPage token={session.token} />
          )}
        </main>
      </div>
    </div>
  );
}
