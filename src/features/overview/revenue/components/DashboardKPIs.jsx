import { TrendingUp, TrendingDown } from 'lucide-react';
import { formatCurrency } from '@/core/format';
import { StatCard, cn } from '@/ui';

const rupees = (n) => `₹${formatCurrency(n).replace(/\.00$/, '')}`;

function KpiTrend({ current, previous, inverse = false }) {
  if (!previous || previous === 0) return null;
  const diff = current - previous;
  const percent = (diff / previous) * 100;
  
  const isPositive = percent > 0;
  // If inverse is true (like expenses), positive is bad.
  const isGood = inverse ? !isPositive : isPositive;

  return (
    <div className={cn("flex items-center gap-1 text-xs font-semibold mt-1", isGood ? "text-emerald-600" : "text-red-500")}>
      {isPositive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      <span>{Math.abs(percent).toFixed(1)}% vs previous</span>
    </div>
  );
}

export function DashboardKPIs({ data }) {
  const { current, previous, customerOutstanding, customersWithDues, suppliersOutstanding, suppliersWithDues } = data;

  const profitMargin = current.salesAmount > 0 ? ((current.profitAmount / current.salesAmount) * 100).toFixed(1) : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
      <div className="rounded-xl border border-line bg-surface p-4 shadow-sm flex flex-col justify-between overflow-hidden">
        <div>
          <h3 className="text-sm font-medium text-slate-500 truncate">Total Sales</h3>
          <p className="mt-1 text-xl sm:text-2xl font-bold text-slate-800 truncate tracking-tight" title={rupees(current.salesAmount)}>{rupees(current.salesAmount)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 mt-2">{current.salesCount} Invoices</p>
          <KpiTrend current={current.salesAmount} previous={previous?.salesAmount} />
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface p-4 shadow-sm flex flex-col justify-between overflow-hidden">
        <div>
          <h3 className="text-sm font-medium text-slate-500 truncate">Total Purchases</h3>
          <p className="mt-1 text-xl sm:text-2xl font-bold text-slate-800 truncate tracking-tight" title={rupees(current.purchasesAmount)}>{rupees(current.purchasesAmount)}</p>
        </div>
        <div className="mt-2">
          <KpiTrend current={current.purchasesAmount} previous={previous?.purchasesAmount} inverse />
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface p-4 shadow-sm flex flex-col justify-between overflow-hidden">
        <div>
          <h3 className="text-sm font-medium text-slate-500 truncate">Gross Profit</h3>
          <p className={cn("mt-1 text-xl sm:text-2xl font-bold truncate tracking-tight", current.profitAmount >= 0 ? "text-emerald-600" : "text-red-600")} title={rupees(current.profitAmount)}>{rupees(current.profitAmount)}</p>
        </div>
        <div>
          <p className="text-xs text-emerald-700 font-medium mt-2">{profitMargin}% Margin</p>
          <KpiTrend current={current.profitAmount} previous={previous?.profitAmount} />
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface p-4 shadow-sm flex flex-col justify-between overflow-hidden">
        <div>
          <h3 className="text-sm font-medium text-slate-500 truncate">Total Expenses</h3>
          <p className="mt-1 text-xl sm:text-2xl font-bold text-slate-800 truncate tracking-tight" title={rupees(current.expensesAmount)}>{rupees(current.expensesAmount)}</p>
        </div>
        <div className="mt-2">
          <KpiTrend current={current.expensesAmount} previous={previous?.expensesAmount} inverse />
        </div>
      </div>

      <div className="rounded-xl border border-line bg-surface p-4 shadow-sm flex flex-col justify-between overflow-hidden">
        <div>
          <h3 className="text-sm font-medium text-slate-500 truncate">Customer Outstanding</h3>
          <p className="mt-1 text-xl sm:text-2xl font-bold text-orange-600 truncate tracking-tight" title={rupees(customerOutstanding)}>{rupees(customerOutstanding)}</p>
        </div>
        <p className="text-xs text-slate-500 mt-2 truncate">From {customersWithDues} customers</p>
      </div>

      <div className="rounded-xl border border-line bg-surface p-4 shadow-sm flex flex-col justify-between overflow-hidden">
        <div>
          <h3 className="text-sm font-medium text-slate-500 truncate">Supplier Outstanding</h3>
          <p className="mt-1 text-xl sm:text-2xl font-bold text-red-600 truncate tracking-tight" title={rupees(suppliersOutstanding)}>{rupees(suppliersOutstanding)}</p>
        </div>
        <p className="text-xs text-slate-500 mt-2 truncate">To {suppliersWithDues} suppliers</p>
      </div>
    </div>
  );
}
