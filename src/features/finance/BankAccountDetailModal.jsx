import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Banknote,
  Building2,
  CalendarDays,
  Check,
  Copy,
  CreditCard,
  Edit,
  Landmark,
  Receipt,
  Search,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { formatCurrency, formatDateShort } from '@/core/format';
import { Badge, Button, EmptyState, IconButton, Modal } from '@/ui';
import { getAccountActivity } from './accountsLogic';

const rs = (n) => `₹${formatCurrency(n)}`;

function getTransactionBadgeStyle(item) {
  const t = item.type || '';
  if (t.startsWith('Sale')) return 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200/70';
  if (t.startsWith('Purchase')) return 'bg-rose-100 text-rose-800 ring-1 ring-rose-200/70';
  if (t.includes('Expense')) return 'bg-amber-100 text-amber-800 ring-1 ring-amber-200/70';
  if (t.includes('Repayment')) return 'bg-purple-100 text-purple-800 ring-1 ring-purple-200/70';
  if (t.includes('Loan')) return 'bg-teal-100 text-teal-800 ring-1 ring-teal-200/70';
  if (t.includes('Transfer In')) return 'bg-cyan-100 text-cyan-800 ring-1 ring-cyan-200/70';
  if (t.includes('Transfer Out')) return 'bg-orange-100 text-orange-800 ring-1 ring-orange-200/70';
  return item.direction === 'in'
    ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200/70'
    : 'bg-rose-100 text-rose-800 ring-1 ring-rose-200/70';
}

export default function BankAccountDetailModal({
  account,
  allData,
  onClose,
  onEdit,
  onTransfer,
}) {
  const [filterType, setFilterType] = useState('all'); // 'all' | 'in' | 'out'
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);

  const isCash = account?.id === 'cash';

  const activity = useMemo(() => {
    return getAccountActivity({
      account,
      salesInvoices: allData?.salesInvoices || [],
      purchaseBills: allData?.purchaseBills || [],
      expenses: allData?.expenses || [],
      financeRecords: allData?.financeRecords || [],
      accountTransactions: allData?.accountTransactions || [],
      bankAccounts: allData?.bankAccounts || [],
      salesPayments: allData?.salesPayments || [],
      purchasePayments: allData?.purchasePayments || [],
      salesReturns: allData?.salesReturns || [],
      purchaseReturns: allData?.purchaseReturns || [],
    });
  }, [account, allData]);

  const handleCopyAccNumber = () => {
    if (!account?.accountNumber) return;
    navigator.clipboard?.writeText?.(account.accountNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Filter transactions
  const filteredItems = useMemo(() => {
    return activity.items.filter((item) => {
      // Direction filter
      if (filterType === 'in' && item.direction !== 'in') return false;
      if (filterType === 'out' && item.direction !== 'out') return false;

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = item.title?.toLowerCase().includes(q);
        const matchSub = item.subtitle?.toLowerCase().includes(q);
        const matchType = item.type?.toLowerCase().includes(q);
        const matchAmt = String(item.amount).includes(q);
        if (!matchTitle && !matchSub && !matchType && !matchAmt) return false;
      }

      return true;
    });
  }, [activity.items, filterType, searchQuery]);

  if (!account) return null;

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-gold-100 text-brand-900 ring-1 ring-gold-200">
            {isCash ? <Banknote className="size-5" /> : <Building2 className="size-5" />}
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900 leading-tight">
              {account.accountName || (isCash ? 'Cash in Hand' : 'Bank Account Details')}
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-500 font-normal">
              <span>{isCash ? 'Physical Cash Drawer' : account.bankName || 'Bank Account'}</span>
              {!isCash && account.accountType && (
                <>
                  <span>•</span>
                  <Badge tone="brand">{account.accountType}</Badge>
                </>
              )}
            </div>
          </div>
        </div>
      }
      size="xl"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {onTransfer && (
              <Button
                variant="outline"
                size="sm"
                icon={ArrowRightLeft}
                onClick={onTransfer}
                className="text-xs"
              >
                Transfer Funds
              </Button>
            )}
            {onEdit && !isCash && (
              <Button
                variant="outline"
                size="sm"
                icon={Edit}
                onClick={onEdit}
                className="text-xs"
              >
                Edit Account
              </Button>
            )}
          </div>
          <Button variant="secondary" size="sm" onClick={onClose} className="text-xs">
            Close
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* TOP SUMMARY STATS */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-line bg-gradient-to-br from-brand-900 to-brand-950 p-4 text-white shadow-sm col-span-2 sm:col-span-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gold-300">
              Current Balance
            </div>
            <div className="mt-1 font-display text-2xl font-black text-white sm:text-3xl">
              {rs(account.currentBalance ?? activity.computedCurrentBalance)}
            </div>
            <div className="mt-2 text-[11px] text-brand-200 flex items-center justify-between">
              <span>Opening:</span>
              <span className="font-semibold text-white">{rs(activity.openingBalance)}</span>
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-emerald-50/60 p-4 ring-1 ring-emerald-200/50">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-emerald-800">
              <span>Total Inflows</span>
              <ArrowDownLeft className="size-4 text-emerald-600" />
            </div>
            <div className="mt-1 font-display text-xl font-extrabold text-emerald-700 sm:text-2xl">
              +{rs(activity.totalInflows)}
            </div>
            <div className="mt-2 text-[10px] text-emerald-600">
              Sales, Loans & Transfers In
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-rose-50/60 p-4 ring-1 ring-rose-200/50">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-rose-800">
              <span>Total Outflows</span>
              <ArrowUpRight className="size-4 text-rose-600" />
            </div>
            <div className="mt-1 font-display text-xl font-extrabold text-rose-700 sm:text-2xl">
              -{rs(activity.totalOutflows)}
            </div>
            <div className="mt-2 text-[10px] text-rose-600">
              Purchases, Exps & Transfers Out
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-slate-50 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              Net Movement
            </div>
            <div
              className={`mt-1 font-display text-xl font-extrabold sm:text-2xl ${
                activity.totalInflows - activity.totalOutflows >= 0
                  ? 'text-emerald-700'
                  : 'text-rose-700'
              }`}
            >
              {activity.totalInflows - activity.totalOutflows >= 0 ? '+' : ''}
              {rs(activity.totalInflows - activity.totalOutflows)}
            </div>
            <div className="mt-2 text-[10px] text-slate-500">
              {activity.items.length} total entries recorded
            </div>
          </div>
        </div>

        {/* ACCOUNT METADATA & QUICK INFO */}
        {!isCash && (
          <div className="rounded-2xl border border-line bg-slate-50/70 p-3.5 sm:p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
              <div>
                <span className="text-[10px] font-semibold uppercase text-slate-500">
                  Bank Name
                </span>
                <p className="mt-0.5 font-bold text-slate-800">
                  {account.bankName || 'Not Specified'}
                </p>
              </div>
              <div>
                <span className="text-[10px] font-semibold uppercase text-slate-500">
                  Account Number
                </span>
                <div className="mt-0.5 flex items-center gap-1.5 font-mono font-bold text-slate-800">
                  <span>{account.accountNumber || '—'}</span>
                  {account.accountNumber && (
                    <button
                      type="button"
                      onClick={handleCopyAccNumber}
                      title="Copy Account Number"
                      className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
                    >
                      {copied ? (
                        <Check className="size-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </div>
              <div>
                <span className="text-[10px] font-semibold uppercase text-slate-500">
                  Account Type
                </span>
                <p className="mt-0.5 font-bold text-slate-800">
                  {account.accountType || 'Current'}
                </p>
              </div>
              <div>
                <span className="text-[10px] font-semibold uppercase text-slate-500">
                  Notes
                </span>
                <p className="mt-0.5 text-slate-600 truncate" title={account.notes}>
                  {account.notes || 'No notes added'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* INFLOW / OUTFLOW BREAKDOWN PILLS */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-emerald-200/70 bg-gradient-to-br from-white to-emerald-50/20 p-3 shadow-sm">
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center justify-between">
              <span>Inflow Sources</span>
              <span className="font-extrabold text-emerald-700">+{rs(activity.totalInflows)}</span>
            </div>
            <div className="space-y-1.5 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Sales Collections (UPI/Bank):</span>
                <span className="font-bold text-emerald-700">
                  {rs(activity.breakdown.salesInflow)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Loans Borrowed (Finance):</span>
                <span className="font-bold text-teal-700">
                  {rs(activity.breakdown.loanInflow)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Transfers In (From Cash/Banks):</span>
                <span className="font-bold text-indigo-700">
                  {rs(activity.breakdown.transferInflow)}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-rose-200/70 bg-gradient-to-br from-white to-rose-50/20 p-3 shadow-sm">
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-rose-800 flex items-center justify-between">
              <span>Outflow Destinations</span>
              <span className="font-extrabold text-rose-700">-{rs(activity.totalOutflows)}</span>
            </div>
            <div className="space-y-1.5 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Purchase Payments:</span>
                <span className="font-bold text-rose-700">
                  {rs(activity.breakdown.purchaseOutflow)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Business Expenses:</span>
                <span className="font-bold text-amber-700">
                  {rs(activity.breakdown.expenseOutflow)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Loan Repayments:</span>
                <span className="font-bold text-purple-700">
                  {rs(activity.breakdown.loanRepayOutflow)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Transfers Out (To Cash/Banks):</span>
                <span className="font-bold text-orange-700">
                  {rs(activity.breakdown.transferOutflow)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* TRANSACTION ACTIVITY LEDGER */}
        <div>
          <div className="mb-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-display text-sm font-bold text-slate-800 sm:text-base">
                Transaction History ({filteredItems.length})
              </h3>
              <p className="text-[11px] text-slate-500">
                Itemized deposits, payouts, transfers and expense debits
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* FILTER BUTTONS */}
              <div className="flex items-center rounded-xl bg-slate-100 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setFilterType('all')}
                  className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                    filterType === 'all'
                      ? 'bg-white text-brand-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType('in')}
                  className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                    filterType === 'in'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  + Inflows
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType('out')}
                  className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                    filterType === 'out'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  - Outflows
                </button>
              </div>

              {/* SEARCH INPUT */}
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search entries..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 rounded-xl border border-line bg-white pl-8 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:border-brand-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {filteredItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center">
              <Building2 className="mx-auto size-8 text-slate-400" />
              <p className="mt-2 text-sm font-semibold text-slate-700">No transactions found</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {searchQuery || filterType !== 'all'
                  ? 'No entries match your search criteria.'
                  : 'No sales, purchases, loans or transfers recorded for this account yet.'}
              </p>
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto rounded-xl border border-line bg-white divide-y divide-slate-100 shadow-sm">
              {filteredItems.map((item) => {
                const isIn = item.direction === 'in';
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 transition hover:bg-slate-50/80"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex size-8 shrink-0 items-center justify-center rounded-xl ring-1 ${
                          isIn
                            ? 'bg-emerald-50 text-emerald-600 ring-emerald-200'
                            : 'bg-rose-50 text-rose-600 ring-rose-200'
                        }`}
                      >
                        {isIn ? (
                          <ArrowDownLeft className="size-4" />
                        ) : (
                          <ArrowUpRight className="size-4" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs sm:text-sm text-slate-900">
                            {item.title}
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${getTransactionBadgeStyle(
                              item,
                            )}`}
                          >
                            {item.type}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                          <span>{formatDateShort(item.date)}</span>
                          {item.subtitle && (
                            <>
                              <span>•</span>
                              <span>{item.subtitle}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div
                        className={`font-display text-sm sm:text-base font-extrabold tabular-nums ${
                          isIn ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {isIn ? '+' : '-'}
                        {rs(item.amount)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
