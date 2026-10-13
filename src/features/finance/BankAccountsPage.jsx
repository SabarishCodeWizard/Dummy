import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Banknote,
  Building2,
  CalendarDays,
  CreditCard,
  Edit,
  Eye,
  History,
  Landmark,
  Plus,
  RefreshCw,
  Sigma,
  Trash2,
  Wallet,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { db } from '@/core/db';
import { formatCurrency, formatDateShort } from '@/core/format';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { Badge, Button, DataTable, EmptyState, IconButton, Page, useFeedback } from '@/ui';

import FilterBar from '../overview/components/FilterBar';
import FloatingAddButton from '../overview/components/FloatingAddButton';
import InkStat from '../overview/components/InkStat';
import KpiRow from '../overview/components/KpiRow';
import RefreshButton from '../overview/components/RefreshButton';
import SkeletonRows from '../overview/components/SkeletonRows';

import { computeAccountBalances, getRecordTimestamp, toDateKey } from './accountsLogic';
import BankAccountModal from './BankAccountModal';
import BankAccountDetailModal from './BankAccountDetailModal';
import CashOpeningModal from './CashOpeningModal';
import FundTransferModal from './FundTransferModal';
import FinanceNavTabs from './FinanceNavTabs';

const rs = (n) => `₹${formatCurrency(n)}`;

export default function BankAccountsPage() {
  const { toast, confirm } = useFeedback();

  const [bankAccounts, setBankAccounts] = useState([]);
  const [cashSettings, setCashSettings] = useState({ openingBalance: 0 });
  const [salesInvoices, setSalesInvoices] = useState([]);
  const [purchaseBills, setPurchaseBills] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [financeRecords, setFinanceRecords] = useState([]);
  const [accountTransactions, setAccountTransactions] = useState([]);
  const [salesPayments, setSalesPayments] = useState([]);
  const [purchasePayments, setPurchasePayments] = useState([]);
  const [salesReturns, setSalesReturns] = useState([]);
  const [purchaseReturns, setPurchaseReturns] = useState([]);

  // Modals state
  const [editingAccount, setEditingAccount] = useState(null);
  const [viewingAccount, setViewingAccount] = useState(null);
  const [editingCash, setEditingCash] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('accounts'); // 'accounts' | 'transactions'
  const [txDateFilter, setTxDateFilter] = useState('');
  const [txSearchFilter, setTxSearchFilter] = useState('');

  const { loading, refreshing, refresh } = useFocusLoad(async () => {
    try {
      const [banks, cash, sales, purchases, exps, fin, txs, sPays, pPays, sRets, pRets] = await Promise.all([
        db.getAllBankAccounts(),
        db.getCashSettings(),
        db.getAllInvoices().catch(() => []),
        db.getAllPurchaseBills().catch(() => []),
        db.getAllExpenses().catch(() => []),
        db.getAllFinanceRecords().catch(() => []),
        db.getAllAccountTransactions().catch(() => []),
        db.getAllPayments().catch(() => []),
        db.getAllPurchasePayments().catch(() => []),
        db.getAllReturns().catch(() => []),
        db.getAllPurchaseReturns().catch(() => []),
      ]);

      setBankAccounts(banks || []);
      setCashSettings(cash || { openingBalance: 0 });
      setSalesInvoices(sales || []);
      setPurchaseBills(purchases || []);
      setExpenses(exps || []);
      setFinanceRecords(fin || []);
      setAccountTransactions(txs || []);
      setSalesPayments(sPays || []);
      setPurchasePayments(pPays || []);
      setSalesReturns(sRets || []);
      setPurchaseReturns(pRets || []);
    } catch (e) {
      console.error('Failed to load financial accounts:', e);
      toast('Error', 'Failed to load financial balances', 'error');
    }
  });

  // Calculate live balances
  const balances = useMemo(() => {
    return computeAccountBalances({
      bankAccounts,
      cashOpening: cashSettings?.openingBalance || 0,
      salesInvoices,
      purchaseBills,
      expenses,
      financeRecords,
      accountTransactions,
      salesPayments,
      purchasePayments,
      salesReturns,
      purchaseReturns,
    });
  }, [
    bankAccounts,
    cashSettings,
    salesInvoices,
    purchaseBills,
    expenses,
    financeRecords,
    accountTransactions,
    salesPayments,
    purchasePayments,
    salesReturns,
    purchaseReturns,
  ]);

  // Sort internal transfers descending (most recent first at top)
  const sortedAccountTransactions = useMemo(() => {
    return [...accountTransactions].sort((a, b) => {
      const dateA = toDateKey(a.date || a.createdAt);
      const dateB = toDateKey(b.date || b.createdAt);
      if (dateB !== dateA) return dateB.localeCompare(dateA);
      const timeB = getRecordTimestamp(b, b.date);
      const timeA = getRecordTimestamp(a, a.date);
      if (timeB !== timeA) return timeB - timeA;
      return String(b.id || '').localeCompare(String(a.id || ''));
    });
  }, [accountTransactions]);

  // Handle Save Bank Account
  const handleSaveAccount = async (accountData) => {
    setSaving(true);
    try {
      await db.saveBankAccount(accountData);
      setEditingAccount(null);
      toast('Success', 'Bank account saved successfully', 'success');
      refresh();
    } catch (err) {
      console.error(err);
      toast('Error', 'Failed to save bank account', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Handle Delete Bank Account
  const handleDeleteAccount = async (account) => {
    const ok = await confirm({
      title: 'Delete Bank Account?',
      message: `Are you sure you want to delete ${account.accountName}? Past transaction records will remain safe.`,
      tone: 'danger',
    });
    if (!ok) return;

    try {
      await db.deleteBankAccount(account.id);
      toast('Success', 'Bank account deleted', 'success');
      refresh();
    } catch (err) {
      console.error(err);
      toast('Error', 'Failed to delete bank account', 'error');
    }
  };

  // Handle Update Cash Opening
  const handleSaveCash = async (openingBalance) => {
    setSaving(true);
    try {
      await db.saveCashSettings({ openingBalance });
      setEditingCash(false);
      toast('Success', 'Cash in hand opening balance updated', 'success');
      refresh();
    } catch (err) {
      console.error(err);
      toast('Error', 'Failed to update cash balance', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Handle Record Fund Transfer
  const handleSaveTransfer = async (txData) => {
    setSaving(true);
    try {
      await db.saveAccountTransaction(txData);
      setShowTransfer(false);
      toast('Success', 'Transfer recorded successfully', 'success');
      refresh();
    } catch (err) {
      console.error(err);
      toast('Error', 'Failed to record transfer', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Account lookup helper
  const getAccountLabel = (id) => {
    if (id === 'cash') return 'Cash in Hand';
    const acc = bankAccounts.find((a) => a.id === id);
    return acc ? acc.accountName : id;
  };

  // Filtered internal transfers (datewise + keyword search)
  const filteredAccountTransactions = useMemo(() => {
    const q = txSearchFilter.trim().toLowerCase();
    return sortedAccountTransactions.filter((t) => {
      if (txDateFilter) {
        const itemDateKey = toDateKey(t.date || t.createdAt);
        if (itemDateKey !== txDateFilter) return false;
      }
      if (q) {
        const fromLabel = getAccountLabel(t.fromAccount).toLowerCase();
        const toLabel = getAccountLabel(t.toAccount).toLowerCase();
        const type = (t.type || '').toLowerCase();
        const notes = (t.notes || '').toLowerCase();
        const amt = String(t.amount || '');
        const dateShort = formatDateShort(t.date || t.createdAt).toLowerCase();
        const match =
          fromLabel.includes(q) ||
          toLabel.includes(q) ||
          type.includes(q) ||
          notes.includes(q) ||
          amt.includes(q) ||
          dateShort.includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [sortedAccountTransactions, txDateFilter, txSearchFilter, bankAccounts]);

  // Transactions columns definition
  const txColumns = [
    { key: 'date', header: 'Date', render: (t) => formatDateShort(t.date || t.createdAt) },
    {
      key: 'type',
      header: 'Type',
      render: (t) => (
        <Badge tone={t.type === 'Deposit' ? 'success' : t.type === 'Withdrawal' ? 'warning' : 'purple'}>
          {t.type}
        </Badge>
      ),
    },
    { key: 'from', header: 'From Account', render: (t) => <span className="font-medium text-slate-700">{getAccountLabel(t.fromAccount)}</span> },
    { key: 'to', header: 'To Account', render: (t) => <span className="font-bold text-slate-900">{getAccountLabel(t.toAccount)}</span> },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (t) => (
        <span
          className={`font-bold tabular-nums ${
            t.type === 'Deposit'
              ? 'text-emerald-700'
              : t.type === 'Withdrawal'
              ? 'text-amber-700'
              : 'text-indigo-700'
          }`}
        >
          {rs(t.amount)}
        </span>
      ),
    },
    { key: 'notes', header: 'Notes', render: (t) => t.notes || '-' },
    {
      key: 'actions',
      header: 'Actions',
      align: 'center',
      render: (t) => (
        <IconButton
          icon={Trash2}
          tone="danger"
          title="Delete transfer"
          onClick={async () => {
            const ok = await confirm({
              title: 'Delete Transfer?',
              message: 'This will reverse the effect on balances.',
              tone: 'danger',
            });
            if (ok) {
              await db.deleteAccountTransaction(t.id);
              refresh();
            }
          }}
        />
      ),
    },
  ];

  return (
    <Page
      title={
        <span>
          <span className="sm:hidden">Bank & Cash</span>
          <span className="hidden sm:inline">Bank & Cash Balances</span>
        </span>
      }
      icon={Landmark}
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={ArrowRightLeft}
            onClick={() => setShowTransfer(true)}
            className="bg-brand-900 hover:bg-brand-800 text-white font-semibold text-xs sm:text-sm shadow-sm"
          >
            <span className="hidden sm:inline">Transfer Funds</span>
            <span className="sm:hidden">Transfer</span>
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={() => setEditingAccount({})}
            className="max-sm:hidden text-xs sm:text-sm"
          >
            Add Bank Account
          </Button>
          <RefreshButton onClick={refresh} loading={refreshing} />
        </div>
      }

    >
      {/* ----------------- TOP TABS ----------------- */}
      <FinanceNavTabs />


      {/* ----------------- KPI ROW ----------------- */}
      <KpiRow cols={3} className="grid-cols-1 sm:grid-cols-3">
        <InkStat
          label="Total Available Funds"
          value={rs(balances.totalAvailableFunds)}
          icon={Sigma}
        />
        <div className="rounded-2xl border border-blue-200/70 bg-gradient-to-br from-white via-blue-50/20 to-blue-50/40 p-4 shadow-lift sm:p-5">
          <div className="text-xs font-bold text-blue-800 uppercase tracking-wider">
            Total in Bank Accounts
          </div>
          <div className="mt-2 font-display text-2xl font-extrabold text-blue-900 sm:text-3xl">
            {rs(balances.totalBankBalance)}
          </div>
          <div className="mt-1 text-xs font-semibold text-blue-700/80">
            Across {balances.bankAccounts.length} Account(s)
          </div>
        </div>
        <div className="rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-white via-emerald-50/20 to-emerald-50/40 p-4 shadow-lift sm:p-5">
          <div className="flex items-center justify-between text-xs font-bold text-emerald-800 uppercase tracking-wider">
            <span>Cash in Hand</span>
            <IconButton
              size="xs"
              icon={Edit}
              title="Edit Opening Cash"
              onClick={() => setEditingCash(true)}
            />
          </div>
          <div className="mt-2 font-display text-2xl font-extrabold text-emerald-700 sm:text-3xl">
            {rs(balances.cashBalance)}
          </div>
          <div className="mt-1 text-xs font-semibold text-emerald-700/80">
            Opening: {rs(balances.cashAccount.openingBalance)}
          </div>
        </div>
      </KpiRow>

      {/* ----------------- SUB-TABS: ACCOUNTS VS TRANSFERS ----------------- */}
      <div className="no-scrollbar -mx-4 mb-4 flex items-center gap-2 overflow-x-auto border-b border-line px-4 pb-2 sm:mx-0 sm:px-0">
        <button
          type="button"
          onClick={() => setActiveTab('accounts')}
          className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition sm:text-sm ${
            activeTab === 'accounts'
              ? 'bg-brand-900 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Building2 className="size-3.5 sm:size-4" />
          Accounts & Balances ({balances.bankAccounts.length + 1})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('transactions')}
          className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition sm:text-sm ${
            activeTab === 'transactions'
              ? 'bg-brand-900 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <History className="size-3.5 sm:size-4" />
          Internal Transfers ({accountTransactions.length})
        </button>
      </div>

      {loading ? (
        <SkeletonRows count={4} />
      ) : activeTab === 'accounts' ? (
        <div className="space-y-4">
          {/* BANK ACCOUNTS LIST */}
          <div className="grid gap-3.5 sm:grid-cols-2">
            {balances.bankAccounts.map((account) => (
              <div
                key={account.id}
                className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-line bg-white p-4 shadow-lift transition hover:shadow-pop sm:p-5"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 sm:gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-200 sm:size-10">
                        <Building2 className="size-4.5 sm:size-5" />
                      </div>
                      <div>
                        <h4 className="font-display text-sm font-bold text-slate-900 sm:text-base">
                          {account.accountName}
                        </h4>
                        <p className="text-[11px] font-semibold text-blue-700 sm:text-xs">
                          {account.bankName || 'Bank'} {account.accountNumber ? `(• • • • ${account.accountNumber})` : ''}
                        </p>
                      </div>
                    </div>
                    <Badge tone="brand">{account.accountType}</Badge>
                  </div>

                  <div className="mt-4 rounded-xl bg-gradient-to-br from-blue-50/70 via-slate-50 to-blue-50/30 p-3 sm:mt-5 sm:p-3.5 border border-blue-200/60">
                    <div className="text-[10px] font-bold text-blue-800 uppercase tracking-wider sm:text-xs">
                      Current Balance
                    </div>
                    <div className="mt-0.5 font-display text-xl font-extrabold text-blue-900 sm:text-2xl">
                      {rs(account.currentBalance)}
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-blue-200/60 pt-2 text-[11px] text-slate-600 sm:text-xs">
                      <span>Opening: <strong className="text-slate-800">{rs(account.openingBalance)}</strong></span>
                      <span className="font-semibold text-emerald-700">Total Inflows: +{rs(account.inflows)}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-3.5 flex flex-wrap items-center justify-end gap-1.5 border-t border-slate-100 pt-3 sm:mt-4 sm:gap-2">
                  <Button
                    variant="ghost"
                    size="xs"
                    icon={Eye}
                    onClick={() => setViewingAccount(account)}
                    className="rounded-lg border-0 shadow-none text-slate-700 hover:text-brand-900 hover:bg-slate-100 font-semibold px-2.5 py-1 text-xs"
                  >
                    View Details
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    icon={Edit}
                    onClick={() => setEditingAccount(account)}
                    className="rounded-lg border-0 shadow-none text-blue-600 hover:text-blue-800 hover:bg-blue-50 font-semibold px-2.5 py-1 text-xs"
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    icon={Trash2}
                    onClick={() => handleDeleteAccount(account)}
                    className="rounded-lg border-0 shadow-none text-red-600 hover:text-red-800 hover:bg-red-50 font-semibold px-2.5 py-1 text-xs"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {balances.bankAccounts.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center sm:p-8">
              <Building2 className="mx-auto size-9 text-slate-400 sm:size-10" />
              <h3 className="mt-2 text-sm font-bold text-slate-700 sm:text-base">No Bank Accounts Added Yet</h3>
              <p className="mt-1 text-xs text-slate-500 sm:text-sm">
                Add your business bank accounts (SBI, HDFC, Canara, etc.) to track live bank balances with sales and purchases.
              </p>
              <Button
                variant="primary"
                size="sm"
                icon={Plus}
                onClick={() => setEditingAccount({})}
                className="mt-3.5 sm:mt-4"
              >
                Add Your First Bank Account
              </Button>
            </div>
          )}

          {/* CASH IN HAND CARD */}
          <div className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-line bg-white p-4 shadow-lift transition hover:shadow-pop sm:p-5">
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 sm:gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200 sm:size-10">
                    <Banknote className="size-4.5 sm:size-5" />
                  </div>
                  <div>
                    <h4 className="font-display text-sm font-bold text-slate-900 sm:text-base">
                      Cash in Hand
                    </h4>
                    <p className="text-[11px] text-slate-500 sm:text-xs">
                      Physical Cash Drawer • Sales, Loans, Purchases & Expenses
                    </p>
                  </div>
                </div>
                <Badge tone="success">Drawer</Badge>
              </div>

              <div className="mt-4 rounded-xl bg-gradient-to-br from-emerald-50/70 via-teal-50/30 to-emerald-50/30 p-3 sm:mt-5 sm:p-3.5 border border-emerald-200/70">
                <div className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider sm:text-xs">
                  Current Balance
                </div>
                <div className="mt-0.5 font-display text-xl font-extrabold text-emerald-700 sm:text-2xl">
                  {rs(balances.cashBalance)}
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-emerald-200/70 pt-2 text-[11px] text-emerald-800 sm:text-xs">
                  <span>Opening: <strong className="text-slate-800">{rs(balances.cashAccount.openingBalance)}</strong></span>
                  <span>Net Flow: <strong className={balances.cashBalance - balances.cashAccount.openingBalance >= 0 ? 'text-emerald-700 font-bold' : 'text-rose-700 font-bold'}>{balances.cashBalance - balances.cashAccount.openingBalance >= 0 ? '+' : ''}{rs(balances.cashBalance - balances.cashAccount.openingBalance)}</strong></span>
                </div>
              </div>
            </div>

            <div className="mt-3.5 flex flex-wrap items-center justify-end gap-1.5 border-t border-slate-100 pt-3 sm:mt-4 sm:gap-2">
              <Button
                variant="ghost"
                size="xs"
                icon={Eye}
                onClick={() => setViewingAccount(balances.cashAccount)}
                className="rounded-lg border-0 shadow-none text-slate-700 hover:text-brand-900 hover:bg-slate-100 font-semibold px-2.5 py-1 text-xs"
              >
                View Details
              </Button>
              <Button
                variant="ghost"
                size="xs"
                icon={Edit}
                onClick={() => setEditingCash(true)}
                className="rounded-lg border-0 shadow-none text-blue-600 hover:text-blue-800 hover:bg-blue-50 font-semibold px-2.5 py-1 text-xs"
              >
                Adjust Opening
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* TRANSACTIONS / AUDIT TABLE */
        <div className="space-y-4">
          <FilterBar
            date={txDateFilter}
            onDateChange={setTxDateFilter}
            text={txSearchFilter}
            onTextChange={setTxSearchFilter}
            textPlaceholder="Search transfers by account, type, note or amount..."
            onClear={() => {
              setTxDateFilter('');
              setTxSearchFilter('');
            }}
          />

          {sortedAccountTransactions.length === 0 ? (
            <EmptyState
              title="No Internal Transfers Recorded"
              message="Record cash deposits to bank, cash withdrawals, or bank-to-bank transfers."
              action={
                <Button
                  variant="primary"
                  size="sm"
                  icon={ArrowRightLeft}
                  onClick={() => setShowTransfer(true)}
                >
                  Record Transfer
                </Button>
              }
            />
          ) : filteredAccountTransactions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center bg-white shadow-sm">
              <CalendarDays className="mx-auto size-8 text-slate-400" />
              <p className="mt-2 text-sm font-semibold text-slate-700">No transfers match your filters</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Try selecting a different date or search query.
              </p>
              <Button
                variant="outline"
                size="xs"
                onClick={() => {
                  setTxDateFilter('');
                  setTxSearchFilter('');
                }}
                className="mt-3"
              >
                Clear Filters
              </Button>
            </div>
          ) : (
            <DataTable
              columns={txColumns}
              rows={filteredAccountTransactions}
              rowKey={(t) => t.id}
              renderCard={(t) => (
                <div className="flex flex-col gap-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge tone="brand">{t.type}</Badge>
                        <span className="text-xs text-slate-500">
                          {formatDateShort(t.date || t.createdAt)}
                        </span>
                      </div>
                      <div className="mt-2 text-xs font-semibold text-slate-700">
                        {getAccountLabel(t.fromAccount)} → {getAccountLabel(t.toAccount)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-display text-base font-extrabold text-emerald-600">
                        {rs(t.amount)}
                      </div>
                      <IconButton
                        icon={Trash2}
                        tone="danger"
                        title="Delete transfer"
                        size="xs"
                        className="mt-1 ml-auto"
                        onClick={async () => {
                          const ok = await confirm({
                            title: 'Delete Transfer?',
                            message: 'This will reverse the effect on balances.',
                            tone: 'danger',
                          });
                          if (ok) {
                            await db.deleteAccountTransaction(t.id);
                            refresh();
                          }
                        }}
                      />
                    </div>
                  </div>
                  {t.notes && <div className="text-xs text-slate-500 italic mt-0.5">{t.notes}</div>}
                </div>
              )}
            />
          )}
        </div>
      )}

      {/* Floating Add for mobile */}
      <FloatingAddButton
        onClick={() => setEditingAccount({})}
        title="Add Bank Account"
      />

      {/* MODALS */}
      {viewingAccount && (
        <BankAccountDetailModal
          account={viewingAccount}
          allData={{
            salesInvoices,
            purchaseBills,
            expenses,
            financeRecords,
            accountTransactions,
            bankAccounts,
            salesPayments,
            purchasePayments,
            salesReturns,
            purchaseReturns,
          }}
          onClose={() => setViewingAccount(null)}
          onEdit={() => {
            const acc = viewingAccount;
            setViewingAccount(null);
            setEditingAccount(acc);
          }}
          onTransfer={() => {
            setViewingAccount(null);
            setShowTransfer(true);
          }}
        />
      )}

      {editingAccount && (
        <BankAccountModal
          account={editingAccount.id ? editingAccount : null}
          saving={saving}
          onClose={() => setEditingAccount(null)}
          onSave={handleSaveAccount}
        />
      )}

      {editingCash && (
        <CashOpeningModal
          currentOpening={cashSettings?.openingBalance || 0}
          saving={saving}
          onClose={() => setEditingCash(false)}
          onSave={handleSaveCash}
        />
      )}

      {showTransfer && (
        <FundTransferModal
          accounts={bankAccounts}
          saving={saving}
          onClose={() => setShowTransfer(false)}
          onSave={handleSaveTransfer}
        />
      )}
    </Page>
  );
}
