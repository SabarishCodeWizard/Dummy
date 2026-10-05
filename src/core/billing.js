/**
 * Billing business logic — the non-DOM parts of the web app's `Utils` class.
 * Every formula here is a 1:1 port; comments call out web-app quirks that are preserved on purpose.
 */
import { db } from './db';
import { getFinancialYear, toNum } from './format';
export const rowAmount = (qty, rate) => toNum(qty) * toNum(rate);
export function calcSubtotal(rows) {
  return rows.reduce((sum, r) => sum + rowAmount(r.qty, r.rate), 0);
}
/** Rows with a description become product lines; `sno` is sequential. */
export function buildProductLines(rows, opts = {}) {
  const lines = [];
  rows.forEach((row) => {
    const description = row.description.trim();
    const qty = toNum(row.qty);
    const rate = toNum(row.rate);
    if (!description) return;
    if (opts.requirePositiveQty && !(qty > 0)) return;
    lines.push({ sno: lines.length + 1, description, qty, rate, amount: qty * rate });
  });
  return lines;
}
/** Sales: grand total = subtotal + previous balance + opening balance - discount (may be negative). */
export function calcSalesTotals(i) {
  const grandTotal = i.subtotal + i.previousBalance + (i.manualPreviousBalance || 0) - (i.discount || 0);
  const totalPaid = (i.cash || 0) + (i.upi || 0) + (i.account || 0) + (i.additionalPaid || 0);
  return { grandTotal, totalPaid, balanceDue: grandTotal - totalPaid };
}
/** Purchase: identical, except the grand total never goes below zero (purchase.js). */
export function calcPurchaseTotals(i) {
  const t = calcSalesTotals({ ...i, additionalPaid: 0 });
  const grandTotal = t.grandTotal < 0 ? 0 : t.grandTotal;
  return { grandTotal, totalPaid: t.totalPaid, balanceDue: grandTotal - t.totalPaid };
}
/** Rebuild the cash/upi/account split from stored 'initial' payments (script.js loadInvoiceForEditing). */
export function breakdownFromPayments(payments) {
  return payments.reduce(
    (acc, p) => {
      const method = String(p.paymentMethod || 'cash').toLowerCase();
      if (method === 'upi') acc.upi += p.amount;
      else if (method === 'account' || method === 'bank') acc.account += p.amount;
      else acc.cash += p.amount;
      return acc;
    },
    { cash: 0, upi: 0, account: 0 },
  );
}
// ====================================================================== purchase bill field access
/**
 * New purchase bills keep payment data in a nested `payment` object; edited/legacy bills use top-level fields.
 * All screens read through these helpers exactly the way purchase-history.js did.
 */
export function purchaseBalanceDue(bill) {
  return bill.payment?.balanceDue !== undefined ? toNum(bill.payment.balanceDue) : toNum(bill.balanceDue);
}
export function purchaseAmountPaid(bill) {
  return bill.payment?.totalPaid || bill.amountPaid || 0;
}
/** Highest numeric invoice number within the financial year of `targetDate`. */
export function highestInvoiceNumber(invoices, targetDate) {
  const currentFY = getFinancialYear(targetDate);
  let highestNumber = 0;
  let highestInvoiceNo = null;
  invoices.forEach((invoice) => {
    if (!invoice.invoiceDate || getFinancialYear(invoice.invoiceDate) !== currentFY) return;
    if (!invoice.invoiceNo) return;
    const m = String(invoice.invoiceNo).match(/\d+/);
    if (!m) return;
    const n = parseInt(m[0], 10);
    if (n > highestNumber) {
      highestNumber = n;
      highestInvoiceNo = invoice.invoiceNo;
    }
  });
  return { highestNumber, highestInvoiceNo };
}
/** Sales numbering: 001..999 per financial year, keeping any letter prefix/suffix of the last invoice. */
export function suggestSalesInvoiceNumber(invoices, targetDate) {
  const { highestNumber, highestInvoiceNo } = highestInvoiceNumber(invoices, targetDate);
  if (highestNumber === 0) {
    return { lastInvoiceNo: 'No invoices yet', nextInvoiceNo: '001', nextNumber: 1, cycleRestarted: false };
  }
  const nextNumber = highestNumber >= 999 ? 1 : highestNumber + 1;
  const formatted = nextNumber.toString().padStart(3, '0');
  let nextInvoiceNo = formatted;
  if (highestInvoiceNo && /[A-Za-z]/.test(highestInvoiceNo)) {
    const prefix = highestInvoiceNo.match(/^[A-Za-z]+/);
    const suffix = highestInvoiceNo.match(/[A-Za-z]+$/);
    if (prefix && suffix) nextInvoiceNo = `${prefix[0]}${formatted}${suffix[0]}`;
    else if (prefix) nextInvoiceNo = `${prefix[0]}${formatted}`;
    else if (suffix) nextInvoiceNo = `${formatted}${suffix[0]}`;
  }
  let lastInvoiceNo = highestInvoiceNo || '';
  if (highestInvoiceNo && /^\d+$/.test(highestInvoiceNo)) lastInvoiceNo = highestInvoiceNo.padStart(3, '0');
  return { lastInvoiceNo, nextInvoiceNo, nextNumber, cycleRestarted: nextNumber === 1 };
}
/** Purchase numbering (purchase.js): highest number across ALL bills (a leading "P-" is ignored), +1, 3-digit pad. */
export function suggestPurchaseInvoiceNumber(bills) {
  if (bills.length === 0) return { lastInvoiceNo: 'No invoices yet', nextInvoiceNo: '001' };
  let maxNum = 0;
  bills.forEach((b) => {
    if (!b.invoiceNo) return;
    let s = b.invoiceNo.toString();
    if (s.startsWith('P-')) s = s.substring(2);
    const n = parseInt(s, 10);
    if (!Number.isNaN(n) && n > maxNum) maxNum = n;
  });
  if (maxNum > 0) {
    return {
      lastInvoiceNo: String(maxNum).padStart(3, '0'),
      nextInvoiceNo: String(maxNum + 1).padStart(3, '0'),
    };
  }
  return { lastInvoiceNo: '001', nextInvoiceNo: '001' };
}
const EMPTY_BALANCE = {
  totalPreviousBills: 0,
  balanceCarriedForward: 0,
  invoiceCount: 0,
  lastInvoiceNo: null,
};
const byInvoiceNoAsc = (a, b) => (parseInt(a.invoiceNo) || 0) - (parseInt(b.invoiceNo) || 0);
export async function calculateTotalReturns(invoiceNo) {
  try {
    const returns = await db.getReturnsByInvoice(invoiceNo);
    return returns.reduce((total, r) => total + r.returnAmount, 0);
  } catch (error) {
    console.error('Error calculating returns for invoice:', invoiceNo, error);
    return 0;
  }
}
export async function updateInvoiceWithReturns(invoiceNo) {
  try {
    const totalReturns = await calculateTotalReturns(invoiceNo);
    const invoice = await db.getInvoice(invoiceNo);
    if (invoice) {
      await db.saveInvoice({
        ...invoice,
        totalReturns,
        adjustedBalanceDue: invoice.balanceDue - totalReturns,
      });
    }
  } catch (error) {
    console.error('Error updating invoice with returns:', error);
  }
}
export async function calculateTotalPurchaseReturns(invoiceNo) {
  try {
    const returns = await db.getPurchaseReturnsByInvoice(invoiceNo);
    return returns.reduce((total, r) => total + (parseFloat(String(r.returnAmount)) || 0), 0);
  } catch (error) {
    console.error('Error calculating purchase returns for invoice:', invoiceNo, error);
    return 0;
  }
}
export async function updatePurchaseBillWithReturns(invoiceNo) {
  try {
    const totalReturns = await calculateTotalPurchaseReturns(invoiceNo);
    const bill = await db.getPurchaseBill(invoiceNo);
    if (bill) {
      await db.savePurchaseBill({
        ...bill,
        totalReturns,
        adjustedBalanceDue: purchaseBalanceDue(bill) - totalReturns,
      });
    }
  } catch (error) {
    console.error('Error updating purchase bill with returns:', error);
  }
}
/** Customer's balance carried forward = the most recent invoice's balance due, less its returns. */
export async function calculateCustomerBalance(customerName, currentInvoiceNo = null) {
  try {
    const invoices = await db.getAllInvoices();
    const customerInvoices = invoices
      .filter((i) => i.customerName === customerName && i.invoiceNo !== currentInvoiceNo)
      .sort((a, b) => byInvoiceNoAsc(b, a));
    if (customerInvoices.length === 0) return { ...EMPTY_BALANCE };
    const mostRecent = customerInvoices[0];
    const totalReturns = await calculateTotalReturns(mostRecent.invoiceNo);
    return {
      totalPreviousBills: customerInvoices.reduce((sum, i) => sum + i.grandTotal, 0),
      balanceCarriedForward: mostRecent.balanceDue - totalReturns,
      invoiceCount: customerInvoices.length,
      lastInvoiceNo: mostRecent.invoiceNo,
    };
  } catch (error) {
    console.error('Error calculating customer balance:', error);
    return { ...EMPTY_BALANCE };
  }
}
export async function calculateSupplierBalance(supplierName, currentInvoiceNo = null) {
  try {
    const bills = await db.getAllPurchaseBills();
    const supplierBills = bills
      .filter((b) => b.supplierName === supplierName && b.invoiceNo !== currentInvoiceNo)
      .sort((a, b) => byInvoiceNoAsc(b, a));
    if (supplierBills.length === 0) return { ...EMPTY_BALANCE };
    const mostRecent = supplierBills[0];
    return {
      totalPreviousBills: supplierBills.reduce((sum, b) => sum + b.grandTotal, 0),
      balanceCarriedForward: mostRecent.balanceDue || 0,
      invoiceCount: supplierBills.length,
      lastInvoiceNo: mostRecent.invoiceNo,
    };
  } catch (error) {
    console.error('Error calculating supplier balance:', error);
    return { ...EMPTY_BALANCE };
  }
}
/**
 * Previous balance as it stood at the time of `currentInvoiceNo` (new bill: the customer's latest invoice).
 * Customers are matched by phone when both sides have one, otherwise by case-insensitive name.
 */
export async function calculatePreviousBalanceAtTime(
  customerName,
  customerPhone = null,
  currentInvoiceNo = null,
) {
  try {
    const invoices = await db.getAllInvoices();
    const customerInvoices = invoices
      .filter((invoice) => {
        if (customerPhone && invoice.customerPhone && invoice.customerPhone.trim() !== '') {
          return invoice.customerPhone.trim() === customerPhone.trim();
        }
        if (customerName && invoice.customerName) {
          return invoice.customerName.trim().toLowerCase() === customerName.trim().toLowerCase();
        }
        return false;
      })
      .sort(byInvoiceNoAsc);
    if (customerInvoices.length === 0)
      return { totalPreviousBills: 0, balanceCarriedForward: 0, invoiceCount: 0 };
    // New invoice: carry forward from the most recent existing invoice.
    if (!currentInvoiceNo || !customerInvoices.find((inv) => inv.invoiceNo === currentInvoiceNo)) {
      const mostRecent = customerInvoices[customerInvoices.length - 1];
      const totalReturns = await calculateTotalReturns(mostRecent.invoiceNo);
      return {
        totalPreviousBills: customerInvoices.reduce((sum, i) => sum + i.grandTotal, 0),
        balanceCarriedForward: mostRecent.balanceDue - totalReturns,
        invoiceCount: customerInvoices.length,
      };
    }
    // Existing invoice: balance carried in from the invoice before it.
    const idx = customerInvoices.findIndex((inv) => inv.invoiceNo === currentInvoiceNo);
    if (idx === 0) return { totalPreviousBills: 0, balanceCarriedForward: 0, invoiceCount: 0 };
    const allReturns = await db.getAllReturns();
    const previous = customerInvoices[idx - 1];
    const totalReturns = allReturns
      .filter((r) => r.invoiceNo === previous.invoiceNo)
      .reduce((sum, r) => sum + (parseFloat(String(r.returnAmount)) || 0), 0);
    return {
      totalPreviousBills: customerInvoices.slice(0, idx).reduce((sum, i) => sum + i.grandTotal, 0),
      balanceCarriedForward: previous.balanceDue - totalReturns,
      invoiceCount: idx,
    };
  } catch (error) {
    console.error('Error calculating previous balance at time:', error);
    return { totalPreviousBills: 0, balanceCarriedForward: 0, invoiceCount: 0 };
  }
}
/**
 * Supplier equivalent. PARITY NOTE: like the web app this reads the TOP-LEVEL `balanceDue` of a purchase bill.
 * Bills created by the purchase screen store the balance in `payment.balanceDue` (top-level only appears after an
 * edit), so for freshly created bills this yields 0. Preserved intentionally — see docs/MIGRATION_NOTES.md.
 */
export async function calculateSupplierPreviousBalanceAtTime(
  supplierName,
  supplierPhone = null,
  currentInvoiceNo = null,
) {
  try {
    const bills = await db.getAllPurchaseBills();
    const supplierBills = bills
      .filter((bill) => {
        if (supplierPhone && bill.supplierPhone && bill.supplierPhone.trim() !== '') {
          return bill.supplierPhone.trim() === supplierPhone.trim();
        }
        if (supplierName && bill.supplierName) {
          return bill.supplierName.trim().toLowerCase() === supplierName.trim().toLowerCase();
        }
        return false;
      })
      .sort(byInvoiceNoAsc);
    if (supplierBills.length === 0)
      return { totalPreviousBills: 0, balanceCarriedForward: 0, invoiceCount: 0 };
    if (!currentInvoiceNo || !supplierBills.find((b) => b.invoiceNo === currentInvoiceNo)) {
      const mostRecent = supplierBills[supplierBills.length - 1];
      return {
        totalPreviousBills: supplierBills.reduce((sum, b) => sum + b.grandTotal, 0),
        balanceCarriedForward: mostRecent.balanceDue || 0,
        invoiceCount: supplierBills.length,
      };
    }
    const idx = supplierBills.findIndex((b) => b.invoiceNo === currentInvoiceNo);
    if (idx === 0) return { totalPreviousBills: 0, balanceCarriedForward: 0, invoiceCount: 0 };
    const previous = supplierBills[idx - 1];
    return {
      totalPreviousBills: supplierBills.slice(0, idx).reduce((sum, b) => sum + b.grandTotal, 0),
      balanceCarriedForward: previous.balanceDue || 0,
      invoiceCount: idx,
    };
  } catch (error) {
    console.error('Error calculating supplier previous balance at time:', error);
    return { totalPreviousBills: 0, balanceCarriedForward: 0, invoiceCount: 0 };
  }
}
/** Re-computes the invoices after `updatedInvoiceNo` (see Database.updateSubsequentInvoices for parity notes). */
export const updateSubsequentInvoices = (customerName, updatedInvoiceNo) =>
  db.updateSubsequentInvoices(customerName, updatedInvoiceNo);
export async function saveCustomerDetails(name, address, phone) {
  if (!phone) {
    console.error('Phone number is required to save customer');
    return;
  }
  try {
    await db.saveCustomer({
      phone: phone.trim(),
      name: name ? name.trim() : '',
      address: address ? address.trim() : '',
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error saving customer details:', error);
  }
}
