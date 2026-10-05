import { db } from '@/core/db';
import { buildCustomerSummaries } from './aggregate';
/** Reads exactly what the web page reads — all invoices and all returns — and aggregates them per customer. */
export async function loadCustomerSummaries() {
  const [invoices, returns] = await Promise.all([db.getAllInvoices(), db.getAllReturns()]);
  return buildCustomerSummaries(invoices, returns);
}
