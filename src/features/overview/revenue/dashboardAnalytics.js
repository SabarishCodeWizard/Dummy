import { db } from '@/core/db';
import { toNum } from '@/core/format';
import { isSameDay, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subDays, subMonths } from 'date-fns';

/**
 * Filter data by date range
 */
export const dateRanges = {
  today: () => ({ start: startOfDay(new Date()), end: endOfDay(new Date()) }),
  yesterday: () => {
    const yesterday = subDays(new Date(), 1);
    return { start: startOfDay(yesterday), end: endOfDay(yesterday) };
  },
  thisWeek: () => ({ start: startOfWeek(new Date(), { weekStartsOn: 1 }), end: endOfWeek(new Date(), { weekStartsOn: 1 }) }),
  thisMonth: () => ({ start: startOfMonth(new Date()), end: endOfMonth(new Date()) }),
  lastMonth: () => {
    const lastM = subMonths(new Date(), 1);
    return { start: startOfMonth(lastM), end: endOfMonth(lastM) };
  },
  thisQuarter: () => ({ start: startOfQuarter(new Date()), end: endOfQuarter(new Date()) }),
  thisYear: () => ({ start: startOfYear(new Date()), end: endOfYear(new Date()) }),
};

export const getPreviousPeriod = (rangeKey) => {
  const now = new Date();
  switch (rangeKey) {
    case 'today': {
      const y = subDays(now, 1);
      return { start: startOfDay(y), end: endOfDay(y) };
    }
    case 'yesterday': {
      const y2 = subDays(now, 2);
      return { start: startOfDay(y2), end: endOfDay(y2) };
    }
    case 'thisWeek': {
      const lw = subDays(startOfWeek(now, { weekStartsOn: 1 }), 7);
      return { start: startOfWeek(lw, { weekStartsOn: 1 }), end: endOfWeek(lw, { weekStartsOn: 1 }) };
    }
    case 'thisMonth': {
      const lm = subMonths(now, 1);
      return { start: startOfMonth(lm), end: endOfMonth(lm) };
    }
    case 'lastMonth': {
      const l2m = subMonths(now, 2);
      return { start: startOfMonth(l2m), end: endOfMonth(l2m) };
    }
    case 'thisQuarter': {
      const lq = subMonths(startOfQuarter(now), 3);
      return { start: startOfQuarter(lq), end: endOfQuarter(lq) };
    }
    case 'thisYear': {
      const ly = subMonths(startOfYear(now), 12);
      return { start: startOfYear(ly), end: endOfYear(ly) };
    }
    default:
      return null;
  }
};

const isWithinRange = (dateString, { start, end }) => {
  if (!dateString) return false;
  const d = new Date(dateString).getTime();
  return d >= start.getTime() && d <= end.getTime();
};

export async function fetchDashboardData() {
  const [
    salesBills,
    purchaseBills,
    expenses,
    customers,
    suppliers,
    salesReturns,
    purchaseReturns,
  ] = await Promise.all([
    db.getAllInvoices(),
    db.getAllPurchaseBills(),
    db.getAllExpenses ? db.getAllExpenses() : Promise.resolve([]),
    db.getAllCustomers(),
    db.getAllSuppliers(),
    db.getAllReturns(),
    db.getAllPurchaseReturns(),
  ]);

  return {
    salesBills: salesBills || [],
    purchaseBills: purchaseBills || [],
    expenses: expenses || [],
    customers: customers || [],
    suppliers: suppliers || [],
    salesReturns: salesReturns || [],
    purchaseReturns: purchaseReturns || [],
  };
}

export function computeAnalytics(data, rangeKey) {
  const range = dateRanges[rangeKey] ? dateRanges[rangeKey]() : null;
  const previousRange = getPreviousPeriod(rangeKey);
  
  const current = range ? aggregatePeriod(data, range) : aggregatePeriod(data, { start: new Date(0), end: new Date(2100, 1, 1) });
  const previous = previousRange ? aggregatePeriod(data, previousRange) : null;
  
  // Outstanding logic is cumulative, not bound to the date filter.
  // It uses the ledger balances.
  let customerOutstanding = 0;
  let suppliersOutstanding = 0;
  let customersWithDues = 0;
  let suppliersWithDues = 0;

  const custLedger = new Map();
  for (const inv of data.salesBills) {
    if (!inv.customerName) continue;
    const c = custLedger.get(inv.customerName) || { latestDate: 0, balance: 0, returns: 0 };
    const dTime = new Date(inv.invoiceDate || inv.date || 0).getTime();
    if (dTime >= c.latestDate) {
      c.latestDate = dTime;
      c.balance = toNum(inv.balanceDue);
    }
    custLedger.set(inv.customerName, c);
  }
  for (const r of data.salesReturns) {
    const inv = data.salesBills.find(i => String(i.invoiceNo) === String(r.invoiceNo));
    if (inv && inv.customerName) {
      const c = custLedger.get(inv.customerName);
      if (c) c.returns += toNum(r.returnAmount);
    }
  }
  
  custLedger.forEach(c => {
    const due = c.balance - c.returns;
    if (due > 0) {
      customerOutstanding += due;
      customersWithDues++;
    }
  });

  const supLedger = new Map();
  for (const bill of data.purchaseBills) {
    if (!bill.supplierName) continue;
    const s = supLedger.get(bill.supplierName) || { latestDate: 0, balance: 0, returns: 0 };
    const dTime = new Date(bill.invoiceDate || bill.date || 0).getTime();
    if (dTime >= s.latestDate) {
      s.latestDate = dTime;
      s.balance = toNum(bill.payment?.balanceDue || bill.balanceDue);
    }
    supLedger.set(bill.supplierName, s);
  }
  for (const r of data.purchaseReturns) {
    const inv = data.purchaseBills.find(i => String(i.invoiceNo) === String(r.invoiceNo));
    if (inv && inv.supplierName) {
      const s = supLedger.get(inv.supplierName);
      if (s) s.returns += toNum(r.returnAmount);
    }
  }

  supLedger.forEach(s => {
    const due = s.balance - s.returns;
    if (due > 0) {
      suppliersOutstanding += due;
      suppliersWithDues++;
    }
  });

  return {
    current,
    previous,
    customerOutstanding,
    customersWithDues,
    suppliersOutstanding,
    suppliersWithDues,
    stockValue: 0,
    totalProducts: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
  };
}

function aggregatePeriod(data, range) {
  let salesAmount = 0;
  let salesCount = 0;
  let profitAmount = 0;
  let purchasesAmount = 0;
  let expensesAmount = 0;

  for (const bill of data.salesBills) {
    const date = bill.invoiceDate || bill.date || bill.timestamp;
    if (isWithinRange(date, range)) {
      salesAmount += toNum(bill.grandTotal);
      salesCount++;
      // If the app computes profit per bill and stores it as profit:
      profitAmount += toNum(bill.profit || 0);
    }
  }

  for (const bill of data.purchaseBills) {
    const date = bill.invoiceDate || bill.date || bill.timestamp;
    if (isWithinRange(date, range)) {
      purchasesAmount += toNum(bill.grandTotal);
    }
  }

  for (const exp of data.expenses) {
    const date = exp.date || exp.timestamp;
    if (isWithinRange(date, range)) {
      expensesAmount += toNum(exp.amount);
    }
  }

  return {
    salesAmount,
    salesCount,
    profitAmount,
    purchasesAmount,
    expensesAmount,
  };
}
