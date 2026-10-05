/**
 * Customer aggregation for the Customer Details screen — port of `processCustomerData`, `updateStatistics` and
 * `searchCustomers` from js/customer-details.js.
 *
 * Customers are NOT read from the `customers` collection: the page derives them from the sales invoices, grouped by the
 * exact `customerName` string, and subtracts returns (`returns` collection, matched by invoice number). Payments are not
 * read separately — each invoice's own `amountPaid` is summed.
 */
import { toNum } from '@/core/format';
const invoiceNumberValue = (invoiceNo) => parseInt(String(invoiceNo), 10) || 0;
const dateValue = (date) => new Date(date).getTime();
/**
 * PARITY NOTE: `balanceDue` / `adjustedBalanceDue` (last invoice's balance minus returns) and the grand-total sum are
 * computed by the web page but never displayed or exported, so they are not part of the summary here.
 */
export function buildCustomerSummaries(invoices, returns) {
  if (!Array.isArray(invoices)) return [];
  const byName = new Map();
  for (const invoice of invoices) {
    // invoices without a customer name are skipped entirely (they count towards nothing)
    if (!invoice || !invoice.customerName) continue;
    let customer = byName.get(invoice.customerName);
    if (!customer) {
      customer = {
        name: invoice.customerName,
        phone: invoice.customerPhone || '',
        address: invoice.customerAddress || '',
        totalInvoices: 0,
        totalCurrentBillAmount: 0,
        amountPaid: 0,
        totalDiscountAmount: 0,
        totalReturns: 0,
        totalManualAdjustments: 0,
        firstInvoicePreviousBalance: 0,
        firstInvoiceNo: undefined,
        allInvoiceNumbers: [],
      };
      byName.set(invoice.customerName, customer);
    }
    customer.totalInvoices += 1;
    customer.totalCurrentBillAmount += toNum(invoice.subtotal);
    customer.amountPaid += toNum(invoice.amountPaid);
    // PARITY NOTE: read both `discountAmount` and legacy `discount`
    customer.totalDiscountAmount += toNum(invoice.discountAmount || invoice.discount);
    customer.totalManualAdjustments += toNum(invoice.manualPreviousBalance);
    
    if (invoice.invoiceNo) {
      customer.allInvoiceNumbers.push(invoice.invoiceNo);
      const numVal = invoiceNumberValue(invoice.invoiceNo);
      if (customer.firstInvoiceNo === undefined || numVal < customer.firstInvoiceNo) {
        customer.firstInvoiceNo = numVal;
        customer.firstInvoicePreviousBalance = toNum(invoice.previousBalance);
      }
    }
    if (invoice.invoiceDate) {
      const dVal = dateValue(invoice.invoiceDate);
      if (!customer.lastInvoiceDate || dVal > dateValue(customer.lastInvoiceDate)) {
        customer.lastInvoiceDate = invoice.invoiceDate;
        customer.lastInvoiceNo = invoice.invoiceNo;
      }
    }
  }
  const returnedByInvoice = new Map();
  for (const r of returns) {
    const key = String(r.invoiceNo);
    returnedByInvoice.set(key, (returnedByInvoice.get(key) ?? 0) + toNum(r.returnAmount));
  }
  const customers = Array.from(byName.values());
  for (const customer of customers) {
    customer.allInvoiceNumbers.sort((a, b) => invoiceNumberValue(b) - invoiceNumberValue(a));
    // summed per invoice in the same (newest-first) order as the web page so floating-point results match
    customer.totalReturns = 0;
    for (const invoiceNo of customer.allInvoiceNumbers) {
      customer.totalReturns += returnedByInvoice.get(String(invoiceNo)) ?? 0;
    }
  }
  return customers;
}
/**
 * Outstanding balance of one customer: bill amounts - paid - returns - discounts.
 * The web list, the export and the stat cards all use this; the reminder dialog used a variant without the discount
 * (see reminder.ts).
 */
export function customerBalance(customer) {
  return (
    customer.firstInvoicePreviousBalance +
    customer.totalManualAdjustments +
    customer.totalCurrentBillAmount -
    customer.amountPaid -
    customer.totalReturns -
    customer.totalDiscountAmount
  );
}
/** The six stat cards (+ the dynamic "Total Returns" card) computed over whatever list is currently shown. */
export function computeStats(customers) {
  const totalInvoices = customers.reduce((sum, c) => sum + c.totalInvoices, 0);
  const totalCurrentBillAmount = customers.reduce((sum, c) => sum + c.totalCurrentBillAmount, 0);
  const totalPaid = customers.reduce((sum, c) => sum + c.amountPaid, 0);
  const totalReturns = customers.reduce((sum, c) => sum + c.totalReturns, 0);
  const totalDiscountAmount = customers.reduce((sum, c) => sum + c.totalDiscountAmount, 0);
  return {
    totalCustomers: customers.length,
    totalInvoices,
    totalCurrentBillAmount,
    totalPaid,
    totalReturns,
    totalDiscountAmount,
    pendingBalance: totalCurrentBillAmount - totalPaid - totalReturns - totalDiscountAmount,
  };
}
/**
 * Search box filter: name, phone (raw, un-normalised substring), address — and, undocumented in the UI, any invoice number.
 * An empty / whitespace-only term returns the list untouched.
 */
export function filterCustomers(customers, rawTerm) {
  const term = rawTerm.trim().toLowerCase();
  if (!term) return customers;
  return customers.filter(
    (c) =>
      c.name.toLowerCase().includes(term) ||
      (!!c.phone && c.phone.includes(term)) ||
      (!!c.address && c.address.toLowerCase().includes(term)) ||
      c.allInvoiceNumbers.some((no) => String(no).toLowerCase().includes(term)),
  );
}
