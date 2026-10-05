/**
 * Sales bill (invoice) create / edit logic — extracted from the web app's script.js + Utils.getFormData/validateForm.
 * UI-free so the Sales Bill screen (and tests) can share it.
 */
import {
  breakdownFromPayments,
  buildProductLines,
  calcSalesTotals,
  calcSubtotal,
  suggestSalesInvoiceNumber,
  updateSubsequentInvoices,
  saveCustomerDetails,
} from '@/core/billing';
import { db } from '@/core/db';
import { toNum, todayISO } from '@/core/format';
export function emptySalesForm() {
  return {
    invoiceNo: '',
    invoiceDate: todayISO(),
    customerName: '',
    customerAddress: '',
    customerPhone: '',
    rows: [{ description: '', qty: '0', rate: '0' }],
    previousBalance: 0,
    manualPreviousBalance: '0',
    discountAmount: '0',
    cash: '0',
    upi: '0',
    account: '0',
    additionalPaymentsTotal: 0,
  };
}
export function salesFormTotals(form) {
  const subtotal = calcSubtotal(form.rows);
  return {
    subtotal,
    ...calcSalesTotals({
      subtotal,
      previousBalance: form.previousBalance,
      manualPreviousBalance: toNum(form.manualPreviousBalance),
      discount: toNum(form.discountAmount),
      cash: toNum(form.cash),
      upi: toNum(form.upi),
      account: toNum(form.account),
      additionalPaid: form.additionalPaymentsTotal,
    }),
  };
}
/** Utils.validateForm. `shortcuts` = the product catalogue; products must come from it (pass null to skip). */
export function validateSalesBill(form, shortcuts) {
  if (!form.invoiceNo.trim())
    return { title: 'Missing Information', message: 'Please enter an invoice number' };
  if (!form.invoiceDate) return { title: 'Missing Information', message: 'Please select an invoice date' };
  if (!form.customerName.trim())
    return { title: 'Missing Information', message: 'Please enter customer name' };
  const phone = form.customerPhone.trim();
  if (phone.length > 0 && phone.length < 10) {
    return { title: 'Invalid Information', message: 'Please enter a valid 10-digit phone number' };
  }
  const described = form.rows.map((r) => r.description.trim()).filter(Boolean);
  if (described.length === 0) {
    return {
      title: 'Empty Bill',
      message: 'Please add at least one item to the bill before saving or generating.',
    };
  }
  if (shortcuts) {
    const known = new Set(shortcuts.map((s) => s.fullDescription.toLowerCase().trim()));
    if (!described.every((d) => known.has(d.toLowerCase()))) {
      return { title: 'Invalid Product', message: 'Please select products only from the suggestions list.' };
    }
  }
  return null;
}
/** Utils.getFormData */
export function buildSalesInvoice(form) {
  const products = buildProductLines(form.rows);
  const { subtotal, grandTotal, totalPaid, balanceDue } = salesFormTotals(form);
  const paymentBreakdown = {
    cash: toNum(form.cash),
    upi: toNum(form.upi),
    account: toNum(form.account),
  };
  return {
    invoiceNo: form.invoiceNo.trim(),
    invoiceDate: form.invoiceDate,
    customerName: form.customerName,
    customerAddress: form.customerAddress,
    customerPhone: form.customerPhone,
    products,
    subtotal,
    previousBalance: form.previousBalance,
    manualPreviousBalance: toNum(form.manualPreviousBalance),
    discountAmount: toNum(form.discountAmount),
    grandTotal,
    paymentBreakdown,
    amountPaid: totalPaid,
    balanceDue,
    createdAt: new Date().toISOString(),
  };
}
/** True when a *different* bill already uses this number (saving would silently overwrite it). */
export async function invoiceNoExists(invoiceNo) {
  const existing = await db.getInvoice(invoiceNo.trim());
  return !!existing;
}
/** Next invoice number suggestion for the financial year of `invoiceDate`. */
export async function loadInvoiceSuggestion(invoiceDate) {
  try {
    const invoices = await db.getAllInvoices();
    return suggestSalesInvoiceNumber(invoices, invoiceDate);
  } catch (error) {
    console.error('Error generating next invoice number:', error);
    return { lastInvoiceNo: 'Error', nextInvoiceNo: '001', nextNumber: 1, cycleRestarted: false };
  }
}
/**
 * script.js saveBill: saves the invoice + customer, replaces the 'initial' payment records (one per method),
 * then re-computes later invoices of the same customer.
 */
export async function saveSalesBill(form) {
  const invoice = buildSalesInvoice(form);
  const breakdown = invoice.paymentBreakdown;
  const saves = [db.saveInvoice(invoice)];
  const phone = form.customerPhone.trim();
  if (phone && phone.length >= 10) {
    saves.push(saveCustomerDetails(form.customerName.trim(), form.customerAddress.trim(), phone));
  }
  // Replace previously stored initial payments for this invoice (the web app did this on every save).
  try {
    const existing = await db.getPaymentsByInvoice(invoice.invoiceNo);
    const initial = existing.filter((p) => p.paymentType === 'initial');
    if (initial.length > 0) await Promise.all(initial.map((p) => db.deletePaymentDoc(p.id)));
  } catch (err) {
    console.error('Error clearing old initial payments:', err);
  }
  const paymentDate = todayISO();
  ['cash', 'upi', 'account'].forEach((method) => {
    if (breakdown[method] > 0) {
      saves.push(
        db.savePayment({
          id: `payment_${invoice.invoiceNo}_initial_${method}`,
          invoiceNo: invoice.invoiceNo,
          paymentDate,
          amount: breakdown[method],
          paymentMethod: method,
          paymentType: 'initial',
        }),
      );
    }
  });
  await Promise.all(saves);
  await updateSubsequentInvoices(invoice.customerName, invoice.invoiceNo);
  return invoice;
}
/** script.js loadInvoiceForEditing + Utils.setFormData: turn a stored invoice back into an editable form. */
export async function loadSalesBillForEditing(invoiceNo) {
  const invoice = await db.getInvoice(invoiceNo);
  if (!invoice) return null;
  let additionalPaymentsTotal = 0;
  let paymentBreakdown = invoice.paymentBreakdown;
  try {
    const payments = await db.getPaymentsByInvoice(invoiceNo);
    const initial = payments.filter((p) => p.paymentType === 'initial');
    const additional = payments.filter((p) => p.paymentType !== 'initial');
    additionalPaymentsTotal = additional.reduce((sum, p) => sum + p.amount, 0);
    paymentBreakdown = breakdownFromPayments(initial);
  } catch (e) {
    console.error('Error loading true payment history', e);
  }
  // Old invoices without a breakdown: everything was cash.
  const pb = paymentBreakdown ?? { cash: invoice.amountPaid || 0, upi: 0, account: 0 };
  const form = {
    invoiceNo: invoice.invoiceNo,
    invoiceDate: invoice.invoiceDate,
    customerName: invoice.customerName || '',
    customerAddress: invoice.customerAddress || '',
    customerPhone: invoice.customerPhone || '',
    rows: invoice.products?.length
      ? invoice.products.map((p) => ({
          description: p.description,
          qty: String(p.qty),
          rate: String(p.rate),
        }))
      : [{ description: '', qty: '0', rate: '0' }],
    previousBalance: invoice.previousBalance ?? 0,
    manualPreviousBalance:
      invoice.manualPreviousBalance !== undefined ? String(invoice.manualPreviousBalance) : '',
    discountAmount: String(invoice.discountAmount || 0),
    cash: String(pb.cash || 0),
    upi: String(pb.upi || 0),
    account: String(pb.account || 0),
    additionalPaymentsTotal,
  };
  return { form, invoice };
}
