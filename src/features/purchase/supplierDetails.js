/** Supplier Details page — port of js/supplier-details.js (aggregation, stats, search, phone masking, CSV export). */
import { digitsOnly, toNum } from '@/core/format';
function cleanInvoiceNo(invoiceNo) {
  let inv = invoiceNo.toString();
  if (inv.startsWith('P-')) inv = inv.substring(2);
  const num = parseInt(inv, 10);
  return Number.isNaN(num) ? inv : String(num).padStart(3, '0');
}
/**
 * processSupplierData: purchase bills grouped by trimmed supplier name (the suppliers collection is not used).
 * Phone/address come from the first bill seen — the newest, as getAllPurchaseBills sorts by timestamp desc.
 *
 * PARITY NOTE: paid / balance read `payment?.x || top-level x`, so a nested balanceDue of 0 falls back to the top-level
 * field — unlike billing.purchaseBalanceDue (`!== undefined`). Bills written by this app keep both in sync, so the
 * results only differ for stale legacy documents. `discount` is read without the `discountAmount` fallback history uses.
 */
export function aggregateSuppliers(bills, returns = []) {
  if (!bills || !Array.isArray(bills)) return [];
  const returnedByInvoice = new Map();
  if (Array.isArray(returns)) {
    for (const r of returns) {
      const key = String(r.invoiceNo);
      returnedByInvoice.set(key, (returnedByInvoice.get(key) ?? 0) + toNum(r.returnAmount));
    }
  }
  const bySupplier = new Map();
  bills.forEach((bill) => {
    if (!bill || !bill.supplierName) return;
    const key = bill.supplierName.trim();
    let s = bySupplier.get(key);
    if (!s) {
      s = {
        name: key,
        phone: bill.supplierPhone || '',
        address: bill.supplierAddress || '',
        totalBills: 0,
        totalAmount: 0,
        totalPaid: 0,
        totalDiscount: 0,
        totalManualAdjustments: 0,
        firstBillPreviousBalance: 0,
        firstBillNo: undefined,
        allInvoiceNumbers: [],
        latestBalanceDue: 0,
        lastInvoiceDate: null,
      };
      bySupplier.set(key, s);
    }
    s.totalBills++;
    const billSubtotal = bill.subtotal !== undefined 
      ? toNum(bill.subtotal) 
      : toNum(bill.grandTotal) - toNum(bill.previousBalance) - toNum(bill.manualPreviousBalance) + toNum(bill.discountAmount || bill.discount);
    s.totalAmount += billSubtotal;
    s.totalPaid += toNum(bill.payment?.totalPaid || bill.amountPaid);
    s.totalDiscount += toNum(bill.discountAmount || bill.discount);
    s.totalManualAdjustments += toNum(bill.manualPreviousBalance);
    
    if (bill.invoiceNo) {
      s.allInvoiceNumbers.push(cleanInvoiceNo(bill.invoiceNo));
      const numVal = parseInt(cleanInvoiceNo(bill.invoiceNo), 10);
      if (s.firstBillNo === undefined || numVal < s.firstBillNo) {
        s.firstBillNo = numVal;
        s.firstBillPreviousBalance = toNum(bill.previousBalance);
      }
    }
    if (bill.invoiceDate) {
      const dVal = new Date(bill.invoiceDate).getTime();
      if (!s.lastInvoiceDate || dVal > new Date(s.lastInvoiceDate).getTime()) {
        s.lastInvoiceDate = bill.invoiceDate;
        s.latestBalanceDue = toNum(bill.payment?.balanceDue || bill.balanceDue);
      }
    }
  });

  const suppliers = Array.from(bySupplier.values());
  for (const s of suppliers) {
    s.allInvoiceNumbers.sort((a, b) => parseInt(b) - parseInt(a));
    s.totalReturns = 0;
    for (const invoiceNo of s.allInvoiceNumbers) {
      s.totalReturns += returnedByInvoice.get(String(invoiceNo)) ?? 0;
    }
    s.balanceDue = s.latestBalanceDue - s.totalReturns;
  }
  return suppliers.sort((a, b) => a.name.localeCompare(b.name));
}
export function supplierStats(suppliers) {
  const sum = (pick) => suppliers.reduce((total, s) => total + pick(s), 0);
  return {
    totalSuppliers: suppliers.length,
    totalBills: sum((s) => s.totalBills),
    totalAmount: sum((s) => s.totalAmount),
    totalPaid: sum((s) => s.totalPaid),
    totalDiscount: sum((s) => s.totalDiscount),
    totalReturns: sum((s) => s.totalReturns),
    totalBalance: sum((s) => s.balanceDue),
  };
}
/** doSearch: case-insensitive substring match on name, phone or address. */
export function filterSuppliers(suppliers, query) {
  const q = query.toLowerCase().trim();
  if (!q) return suppliers;
  return suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.phone.toLowerCase().includes(q) ||
      s.address.toLowerCase().includes(q),
  );
}
/** formatPhoneNumber: digits only, everything but the last 3 masked. */
export function maskPhone(phone) {
  if (!phone) return 'N/A';
  const clean = digitsOnly(phone);
  if (clean.length <= 3) return clean;
  return '*'.repeat(clean.length - 3) + clean.slice(-3);
}
/** What a tap on the masked number reveals (togglePhoneNumber). */
export const revealedPhone = (phone) => digitsOnly(phone);
const CSV_HEADERS = [
  'Supplier Name',
  'Phone',
  'Address',
  'Opening Balance',
  'Total Bills',
  'Total Amount',
  'Amount Paid',
  'Discount',
  'Returns',
  'Balance Due',
  'Invoice Numbers',
];
/** exportCSV */
export function buildSuppliersCsv(suppliers) {
  const rows = suppliers.map((s) => [
    s.name,
    s.phone,
    s.address,
    (s.firstBillPreviousBalance + s.totalManualAdjustments).toFixed(2),
    s.totalBills,
    s.totalAmount.toFixed(2),
    s.totalPaid.toFixed(2),
    s.totalDiscount.toFixed(2),
    s.totalReturns.toFixed(2),
    s.balanceDue.toFixed(2),
    s.allInvoiceNumbers.join('; '),
  ]);
  return [CSV_HEADERS, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}
export const suppliersCsvFileName = (dateISO) => `supplier-details-${dateISO}.csv`;
