import {
  ArrowLeft,
  Boxes,
  CalendarDays,
  ChevronRight,
  FilePlus2,
  History,
  LayoutDashboard,
  LogOut,
  PieChart,
  Receipt,
  ShoppingCart,
  Trash2,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
  Landmark,
  Zap,
} from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';

import { useAuth } from '@/app/AuthProvider';
import { COMPANY } from '@/core/branding';
import { formatDateShort, todayISO } from '@/core/format';
import { cn, useFeedback } from '@/ui';
import { BrandLockup, BrandMark } from './Brand';
import { OfflineBanner } from './pwa';

/** The three modules of the app. `items` drive the sidebar (desktop) and bottom tab bar (phones / tablets). */
export const MODULES = {
  sales: {
    title: 'Sales',
    icon: Receipt,
    home: '/sales/bill',
    items: [
      { to: '/sales/bill', label: 'Sales Bill', short: 'Bill', icon: FilePlus2 },
      { to: '/sales/history', label: 'Sales History', short: 'History', icon: History },
      { to: '/sales/add-customer', label: 'Add Customer', short: 'Add', icon: UserPlus },
      { to: '/sales/customers', label: 'Customer Details', short: 'Customers', icon: Users },
      { to: '/sales/bin', label: 'Recycle Bin', short: 'Bin', icon: Trash2 },
    ],
  },
  purchase: {
    title: 'Purchase',
    icon: ShoppingCart,
    home: '/purchase/bill',
    items: [
      { to: '/purchase/bill', label: 'Purchase Bill', short: 'Bill', icon: FilePlus2 },
      { to: '/purchase/history', label: 'Purchase History', short: 'History', icon: History },
      { to: '/purchase/add-supplier', label: 'Add Supplier', short: 'Add', icon: UserPlus },
      { to: '/purchase/suppliers', label: 'Supplier Details', short: 'Suppliers', icon: Users },
      { to: '/purchase/bin', label: 'Recycle Bin', short: 'Bin', icon: Trash2 },
    ],
  },
  overview: {
    title: 'Overview',
    icon: PieChart,
    home: '/overview/revenue',
    items: [
      { to: '/overview/revenue', label: 'Revenue', short: 'Revenue', icon: TrendingUp },
      { to: '/overview/statistics', label: 'Statistics', short: 'Stats', icon: PieChart },
      { to: '/overview/stocks', label: 'Stocks', short: 'Stocks', icon: Boxes },
      { to: '/overview/expenses', label: 'Expenses', short: 'Expenses', icon: Wallet },
      { to: '/overview/shortcuts', label: 'Shortcuts', short: 'Shortcuts', icon: Zap },
    ],
  },
  finance: {
    title: 'Finance',
    icon: Landmark,
    home: '/finance/records',
    items: [
      { to: '/finance/records', label: 'Finance Records', short: 'Records', icon: FilePlus2 },
      { to: '/finance/lenders', label: 'Lender Details', short: 'Lenders', icon: Users },
    ],
  },
};

function useLogout() {
  const { logout } = useAuth();
  const { confirm } = useFeedback();
  return async () => {
    const ok = await confirm({
      title: 'Logout',
      message: 'Are you sure you want to logout?',
      tone: 'danger',
      confirmText: 'Logout',
    });
    if (ok) await logout();
  };
}

const initial = (name) => (name?.trim()?.[0] ?? 'U').toUpperCase();

function UserCard({ onLogout }) {
  const { username } = useAuth();
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-2.5 ring-1 ring-white/10">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gold-sheen font-display text-base font-extrabold text-brand-900">
        {initial(username)}
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm font-semibold text-white">{username ?? 'User'}</div>
        <div className="text-[11px] text-brand-300">Signed in</div>
      </div>
      <button
        type="button"
        onClick={onLogout}
        aria-label="Logout"
        title="Logout"
        className="rounded-xl p-2 text-brand-300 transition hover:bg-red-500/20 hover:text-red-200"
      >
        <LogOut className="size-[18px]" />
      </button>
    </div>
  );
}

function SideLink({ to, icon: Icon, children, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition duration-150',
          isActive ? 'bg-white/10 text-white' : 'text-brand-200 hover:bg-white/5 hover:text-white',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              'absolute top-1/2 left-0 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-gold-gradient transition',
              isActive ? 'opacity-100' : 'opacity-0',
            )}
          />
          <Icon
            className={cn(
              'size-[18px] transition',
              isActive ? 'text-gold-300' : 'text-brand-300 group-hover:text-gold-300',
            )}
            aria-hidden
          />
          {children}
        </>
      )}
    </NavLink>
  );
}

function Sidebar({ module }) {
  const onLogout = useLogout();
  return (
    <aside className="no-print sticky top-0 hidden h-dvh w-72 shrink-0 flex-col border-r border-white/5 surface-ink lg:flex">
      <div className="px-5 pt-6 pb-5">
        <BrandLockup />
      </div>
      <div className="mx-5 h-px hairline-gold opacity-60" />

      <nav className="flex-1 scrollbar-thin space-y-6 overflow-y-auto px-3 py-5" aria-label="Main navigation">
        <div>
          <div className="mb-2 flex items-center gap-2 px-3.5 text-[11px] font-bold tracking-[0.18em] text-gold-400/90 uppercase">
            <module.icon className="size-3.5" aria-hidden /> {module.title}
          </div>
          <div className="space-y-0.5">
            {module.items.map(({ to, label, icon }) => (
              <SideLink key={to} to={to} icon={icon}>
                {label}
              </SideLink>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 px-3.5 text-[11px] font-bold tracking-[0.18em] text-brand-400 uppercase">
            Workspace
          </div>
          <div className="space-y-0.5">
            <SideLink to="/" end icon={LayoutDashboard}>
              Dashboard
            </SideLink>
            {Object.entries(MODULES)
              .filter(([, m]) => m !== module)
              .map(([key, m]) => (
                <SideLink key={key} to={m.home} icon={m.icon}>
                  {m.title}
                </SideLink>
              ))}
          </div>
        </div>
      </nav>

      <div className="space-y-3 p-3">
        <UserCard onLogout={onLogout} />
        <p className="px-2 pb-1 text-center text-[10px] tracking-wide text-brand-400">
          Powered by {COMPANY.displayName}
        </p>
      </div>
    </aside>
  );
}

/** Desktop top bar: breadcrumb, today's date, online dot. */
function TopBar({ module }) {
  const { pathname } = useLocation();
  const page = module.items.find((i) => pathname.startsWith(i.to));
  const label = page?.label ?? (pathname.includes('/edit/') ? 'Edit Purchase Bill' : module.title);
  return (
    <div className="no-print sticky top-0 z-20 hidden h-14 items-center justify-between border-b border-line glass px-8 lg:flex">
      <nav className="flex items-center gap-2 text-sm" aria-label="Breadcrumb">
        <module.icon className="size-4 text-gold-600" aria-hidden />
        <span className="font-medium text-slate-500">{module.title}</span>
        <ChevronRight className="size-3.5 text-slate-300" aria-hidden />
        <span className="font-semibold text-brand-800">{label}</span>
      </nav>
      <div className="flex items-center gap-2 rounded-full border border-line bg-white px-3.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
        <CalendarDays className="size-3.5 text-gold-600" aria-hidden />
        {formatDateShort(todayISO())}
      </div>
    </div>
  );
}

function MobileHeader({ module }) {
  const navigate = useNavigate();
  const onLogout = useLogout();
  return (
    <header className="no-print pt-safe h-app-header fixed inset-x-0 top-0 z-40 flex items-center gap-2.5 surface-ink px-3 text-white shadow-lift lg:hidden">
      <button
        type="button"
        onClick={() => navigate('/')}
        aria-label="Back to dashboard"
        className="rounded-xl p-2 text-brand-200 hover:bg-white/10"
      >
        <ArrowLeft className="size-5" />
      </button>
      <BrandMark size="sm" />
      <div className="min-w-0 flex-1 leading-tight">
        <h1 className="truncate font-display text-[15px] font-bold">{module.title}</h1>
        <p className="text-[10px] tracking-[0.2em] text-gold-400 uppercase">Brightlight Billing</p>
      </div>
      <button
        type="button"
        onClick={onLogout}
        aria-label="Logout"
        className="rounded-xl p-2 text-brand-200 hover:bg-white/10"
      >
        <LogOut className="size-5" />
      </button>
    </header>
  );
}

function BottomTabs({ module }) {
  return (
    <nav
      className="no-print pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-white/10 surface-ink shadow-[0_-10px_30px_-12px_rgb(12_16_34/0.55)] lg:hidden"
      aria-label={`${module.title} navigation`}
    >
      <ul className="mx-auto flex max-w-2xl px-1">
        {module.items.map(({ to, short, icon: Icon }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex min-h-[3.6rem] flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-semibold transition',
                  isActive ? 'text-gold-300' : 'text-brand-300',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'rounded-full px-4 py-1 transition',
                      isActive && 'bg-gold-sheen text-brand-900 shadow-gold',
                    )}
                  >
                    <Icon className="size-5" aria-hidden />
                  </span>
                  {short}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Shell of the Sales / Purchase / Overview modules: sidebar on desktop, header + bottom tabs on phones & tablets. */
export function ModuleLayout({ module: key }) {
  const module = MODULES[key];
  return (
    <div className="flex min-h-dvh">
      <Sidebar module={module} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* the phone header is fixed: this spacer keeps the content below it */}
        <div className="h-app-header lg:hidden" aria-hidden />
        <MobileHeader module={module} />
        <OfflineBanner />
        <TopBar module={module} />
        <main className="flex-1 pb-40 lg:pb-10">
          <Outlet />
        </main>
        <BottomTabs module={module} />
      </div>
    </div>
  );
}
