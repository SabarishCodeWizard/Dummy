/**
 * Purchase bill CREATE logic — extracted from the web app's purchase.js.
 * (Editing lives in the edit-purchase screen; viewing/payments/returns in purchase history.)
 */
import {
  buildProductLines,
  calcPurchaseTotals,
  calcSubtotal,
  suggestPurchaseInvoiceNumber,
} from '@/core/billing';
import { COMPANY, CREDIT_LINE } from '@/core/branding';
import { db } from '@/core/db';
import { toNum, todayISO } from '@/core/format';
export function emptyPurchaseForm() {
  return {
    invoiceNo: '',
    invoiceDate: todayISO(),
    supplierPhone: '',
    supplierName: '',
    supplierAddress: '',
    rows: [{ description: '', qty: '0', rate: '0' }],
    previousBalance: 0,
    manualPreviousBalance: '0',
    discountAmount: '0',
    cash: '0',
    upi: '0',
    account: '0',
  };
}
export function purchaseFormTotals(form) {
  const subtotal = calcSubtotal(form.rows);
  return {
    subtotal,
    ...calcPurchaseTotals({
      subtotal,
      previousBalance: form.previousBalance,
      manualPreviousBalance: toNum(form.manualPreviousBalance),
      discount: toNum(form.discountAmount),
      cash: toNum(form.cash),
      upi: toNum(form.upi),
      account: toNum(form.account),
    }),
  };
}
/** Validation order/messages follow purchase.js. */
export function validatePurchaseBill(form, shortcuts) {
  if (!form.invoiceNo.trim())
    return { title: 'Missing Information', message: 'Please enter an Invoice Number.' };
  if (!form.invoiceDate) return { title: 'Missing Information', message: 'Please select an Invoice Date.' };
  if (!form.supplierName.trim())
    return { title: 'Missing Information', message: 'Please enter the Supplier Name.' };
  if (!form.supplierPhone.trim())
    return { title: 'Missing Information', message: 'Please enter the Supplier Phone Number.' };
  const lines = buildProductLines(form.rows, { requirePositiveQty: true });
  if (lines.length === 0) {
    return { title: 'Empty Bill', message: 'Please add at least one product with a valid quantity.' };
  }
  if (shortcuts) {
    const known = new Set(shortcuts.map((s) => s.fullDescription.toLowerCase().trim()));
    if (!lines.every((l) => known.has(l.description.toLowerCase()))) {
      return { title: 'Invalid Product', message: 'Please select products only from the suggestions list.' };
    }
  }
  return null;
}
export function buildPurchaseBill(form) {
  // purchase.js stores line items without `sno`
  const products = buildProductLines(form.rows, { requirePositiveQty: true }).map(
    ({ description, qty, rate, amount }) => ({
      description,
      qty,
      rate,
      amount,
    }),
  );
  const { subtotal, grandTotal, totalPaid, balanceDue } = purchaseFormTotals(form);
  return {
    invoiceNo: form.invoiceNo.trim(),
    invoiceDate: form.invoiceDate,
    supplierPhone: form.supplierPhone.trim(),
    supplierName: form.supplierName.trim(),
    supplierAddress: form.supplierAddress.trim(),
    products,
    subtotal,
    previousBalance: form.previousBalance,
    manualPreviousBalance: toNum(form.manualPreviousBalance),
    discount: toNum(form.discountAmount),
    grandTotal,
    payment: {
      cash: toNum(form.cash),
      upi: toNum(form.upi),
      account: toNum(form.account),
      totalPaid,
      balanceDue,
    },
  };
}
export async function loadPurchaseSuggestion() {
  try {
    return suggestPurchaseInvoiceNumber(await db.getAllPurchaseBills());
  } catch (error) {
    console.error('Error fetching purchase invoices for suggestions:', error);
    return { lastInvoiceNo: 'Error loading', nextInvoiceNo: '001' };
  }
}
export async function purchaseNoExists(invoiceNo) {
  return !!(await db.getPurchaseBill(invoiceNo.trim()));
}
/** purchase.js save: bill + one 'initial' payment record per method + supplier details for future auto-fill. */
export async function savePurchaseBillWithPayments(form) {
  const bill = buildPurchaseBill(form);
  await db.savePurchaseBill(bill);
  const saves = [];
  const pay = bill.payment;
  ['cash', 'upi', 'account'].forEach((method) => {
    if (pay.totalPaid > 0 && pay[method] > 0) {
      saves.push(
        db.savePurchasePayment({
          id: `purchase_payment_${bill.invoiceNo}_initial_${method}`,
          invoiceNo: bill.invoiceNo,
          paymentDate: bill.invoiceDate,
          amount: pay[method],
          paymentMethod: method,
          paymentType: 'initial',
        }),
      );
    }
  });
  if (bill.supplierPhone) {
    saves.push(
      db.saveSupplier({
        phone: bill.supplierPhone,
        name: bill.supplierName,
        address: bill.supplierAddress,
        lastUpdated: new Date().toISOString(),
      }),
    );
  }
  await Promise.all(saves);
  return bill;
}
/** "Share Acknowledgement" text from purchase.js. */
export function buildAcknowledgementMessage(form) {
  const lines = buildProductLines(form.rows, { requirePositiveQty: true });
  const { grandTotal } = purchaseFormTotals(form);
  let message = '';
  if (form.supplierName.trim()) message += `Supplier: ${form.supplierName.trim()}\n\n`;
  message += 'Products Received:\n';
  lines.forEach((p, i) => {
    message += `${i + 1}. ${p.description} - Qty: ${p.qty} - Amount: ₹${p.amount.toFixed(2)}\n`;
  });
  message += `\nTotal Amount: ₹${grandTotal.toFixed(2)}\n\n`;
  message += `${COMPANY.displayName} has received the products mentioned above. Thank you.\n\n${CREDIT_LINE}`;
  return message;
}
