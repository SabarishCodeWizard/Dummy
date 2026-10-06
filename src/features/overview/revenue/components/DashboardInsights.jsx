import { useMemo } from 'react';
import { formatCurrency, toNum } from '@/core/format';
import { startOfDay, startOfWeek, startOfMonth, startOfQuarter, startOfYear, subDays, subMonths } from 'date-fns';

const rupees = (n) => `₹${formatCurrency(n)}`;

const isWithinRange = (dateString, start, end) => {
  if (!dateString) return false;
  const d = new Date(dateString).getTime();
  return d >= start.getTime() && d <= end.getTime();
};

export function DashboardInsights({ data, rangeKey, dateRanges }) {
  const range = dateRanges[rangeKey] ? dateRanges[rangeKey]() : { start: new Date(0), end: new Date(2100, 1, 1) };

  const { topCustomers, topSuppliers, topProducts } = useMemo(() => {
    const custMap = new Map();
    const supMap = new Map();
    const prodMap = new Map();

    data.salesBills.forEach(bill => {
      const d = bill.invoiceDate || bill.date || bill.timestamp;
      if (isWithinRange(d, range.start, range.end)) {
        // Customer aggregation
        if (bill.customerName) {
          const c = custMap.get(bill.customerName) || { name: bill.customerName, sales: 0, paid: 0, invoices: 0 };
          c.sales += toNum(bill.grandTotal);
          c.paid += toNum(bill.amountPaid);
          c.invoices++;
          custMap.set(bill.customerName, c);
        }

        // Product aggregation
        if (bill.products && Array.isArray(bill.products)) {
          bill.products.forEach(p => {
            if (!p.description) return;
            const pd = prodMap.get(p.description) || { name: p.description, qty: 0, revenue: 0, profit: 0 };
            pd.qty += toNum(p.qty);
            pd.revenue += toNum(p.amount);
            pd.profit += toNum(p.totalProfit || 0); // Assuming line items have totalProfit
            prodMap.set(p.description, pd);
          });
        }
      }
    });

    data.purchaseBills.forEach(bill => {
      const d = bill.invoiceDate || bill.date || bill.timestamp;
      if (isWithinRange(d, range.start, range.end)) {
        // Supplier aggregation
        if (bill.supplierName) {
          const s = supMap.get(bill.supplierName) || { name: bill.supplierName, purchases: 0, paid: 0, bills: 0 };
          s.purchases += toNum(bill.grandTotal);
          s.paid += toNum(bill.payment?.totalPaid || bill.amountPaid);
          s.bills++;
          supMap.set(bill.supplierName, s);
        }
      }
    });

    return {
      topCustomers: Array.from(custMap.values()).sort((a, b) => b.sales - a.sales).slice(0, 5),
      topSuppliers: Array.from(supMap.values()).sort((a, b) => b.purchases - a.purchases).slice(0, 5),
      topProducts: Array.from(prodMap.values()).sort((a, b) => b.qty - a.qty).slice(0, 5),
    };
  }, [data, range.start, range.end]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
      {/* Top Customers */}
      <div className="rounded-xl border border-line bg-surface p-4 shadow-sm flex flex-col">
        <h3 className="text-lg font-bold text-slate-800 mb-4">Top Customers</h3>
        <div className="flex-1 overflow-auto">
          {topCustomers.length === 0 ? (
            <p className="text-sm text-slate-500 italic">No customer data in this period.</p>
          ) : (
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-slate-500 border-b border-line">
                  <th className="pb-2 font-medium">Customer</th>
                  <th className="pb-2 font-medium text-right">Sales</th>
                </tr>
              </thead>
              <tbody>
                {topCustomers.map(c => (
                  <tr key={c.name} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 text-slate-700 font-medium">{c.name}</td>
                    <td className="py-2 text-slate-800 font-bold text-right">{rupees(c.sales)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Top Suppliers */}
      <div className="rounded-xl border border-line bg-surface p-4 shadow-sm flex flex-col">
        <h3 className="text-lg font-bold text-slate-800 mb-4">Top Suppliers</h3>
        <div className="flex-1 overflow-auto">
          {topSuppliers.length === 0 ? (
            <p className="text-sm text-slate-500 italic">No supplier data in this period.</p>
          ) : (
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-slate-500 border-b border-line">
                  <th className="pb-2 font-medium">Supplier</th>
                  <th className="pb-2 font-medium text-right">Purchases</th>
                </tr>
              </thead>
              <tbody>
                {topSuppliers.map(s => (
                  <tr key={s.name} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 text-slate-700 font-medium">{s.name}</td>
                    <td className="py-2 text-slate-800 font-bold text-right">{rupees(s.purchases)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Top Products */}
      <div className="rounded-xl border border-line bg-surface p-4 shadow-sm flex flex-col">
        <h3 className="text-lg font-bold text-slate-800 mb-4">Top Selling Products</h3>
        <div className="flex-1 overflow-auto">
          {topProducts.length === 0 ? (
            <p className="text-sm text-slate-500 italic">No product data in this period.</p>
          ) : (
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-slate-500 border-b border-line">
                  <th className="pb-2 font-medium">Product</th>
                  <th className="pb-2 font-medium text-right">Qty</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map(p => (
                  <tr key={p.name} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 text-slate-700 font-medium truncate max-w-[120px]">{p.name}</td>
                    <td className="py-2 text-slate-800 font-bold text-right">{p.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
