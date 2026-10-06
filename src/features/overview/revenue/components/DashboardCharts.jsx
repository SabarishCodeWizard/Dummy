import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { formatCurrency, toNum } from '@/core/format';
import { isSameDay, format, startOfWeek, startOfMonth, startOfYear, parseISO, startOfDay } from 'date-fns';

const rupees = (n) => `₹${formatCurrency(n)}`;

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-slate-200 p-3 rounded-lg shadow-lg">
        <p className="font-bold text-slate-700 mb-2">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} className="text-sm font-medium" style={{ color: entry.color }}>
            {entry.name}: {rupees(entry.value)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export function DashboardCharts({ data, rangeKey }) {
  const chartData = useMemo(() => {
    // Group data by date depending on rangeKey
    const map = new Map();
    
    let formatStr = 'dd MMM yyyy';
    let getGroupingKey = (d) => startOfDay(d).toISOString();
    
    if (rangeKey === 'thisYear' || rangeKey === 'lastMonth' || rangeKey === 'thisQuarter') {
      formatStr = 'MMM yyyy';
      getGroupingKey = (d) => startOfMonth(d).toISOString();
    } else if (rangeKey === 'today' || rangeKey === 'yesterday' || rangeKey === 'thisWeek' || rangeKey === 'thisMonth') {
      formatStr = 'dd MMM';
      getGroupingKey = (d) => startOfDay(d).toISOString();
    }

    const addData = (type, list, dateField, amountField) => {
      list.forEach(item => {
        const d = new Date(item[dateField] || item.date || item.timestamp || 0);
        const groupKey = getGroupingKey(d);
        if (!map.has(groupKey)) {
          map.set(groupKey, { groupKey, dateObj: d, Sales: 0, Purchases: 0, Profit: 0, Expenses: 0 });
        }
        const obj = map.get(groupKey);
        obj[type] += toNum(item[amountField]);
        if (type === 'Sales') {
           obj.Profit += toNum(item.profit || 0);
        }
      });
    };

    addData('Sales', data.salesBills, 'invoiceDate', 'grandTotal');
    addData('Purchases', data.purchaseBills, 'invoiceDate', 'grandTotal');
    addData('Expenses', data.expenses, 'date', 'amount');

    const result = Array.from(map.values()).sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
    return result.map(r => ({
      ...r,
      name: format(r.dateObj, formatStr)
    }));
  }, [data, rangeKey]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      {/* Area Chart: Sales vs Purchases vs Profit */}
      <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
        <h3 className="text-lg font-bold text-slate-800 mb-4">Sales Performance</h3>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorPurchases" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickMargin={10} />
              <YAxis stroke="#64748b" fontSize={12} tickFormatter={(val) => `₹${val/1000}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend verticalAlign="top" height={36}/>
              <Area type="monotone" dataKey="Sales" stroke="#0ea5e9" fillOpacity={1} fill="url(#colorSales)" />
              <Area type="monotone" dataKey="Purchases" stroke="#f59e0b" fillOpacity={1} fill="url(#colorPurchases)" />
              <Area type="monotone" dataKey="Profit" stroke="#10b981" fillOpacity={1} fill="url(#colorProfit)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bar Chart: Revenue vs Expenses */}
      <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
        <h3 className="text-lg font-bold text-slate-800 mb-4">Revenue vs Expenses</h3>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickMargin={10} />
              <YAxis stroke="#64748b" fontSize={12} tickFormatter={(val) => `₹${val/1000}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend verticalAlign="top" height={36}/>
              <Bar dataKey="Sales" fill="#0ea5e9" radius={[4, 4, 0, 0]} name="Revenue" />
              <Bar dataKey="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} name="Expenses" />
              <Bar dataKey="Profit" fill="#10b981" radius={[4, 4, 0, 0]} name="Profit" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
