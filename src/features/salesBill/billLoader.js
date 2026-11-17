import { loadSalesBillForEditing } from '@/core/services/salesBill';
import { loadedBillSession } from './billSession';
import { previousBalanceFor, roundMoney } from './customerLookup';
/**
 * script.js loadInvoiceForEditing: turns a stored invoice into an editable session.
 * Returns null when the invoice does not exist ('Invoice not found!'); throws on a read failure.
 */
export async function openInvoiceForEditing(invoiceNo) {
  const loaded = await loadSalesBillForEditing(invoiceNo);
  if (!loaded) return null;
  // Utils.setFormData: use the stored previous balance, otherwise (older invoices) work it out from the ledger.
  const stored = loaded.invoice.previousBalance;
  const previousBalance =
    stored !== undefined
      ? roundMoney(stored)
      : await previousBalanceFor(loaded.form.customerName, loaded.form.customerPhone, loaded.form.invoiceNo);
  return loadedBillSession({ ...loaded.form, previousBalance }, invoiceNo);
}
