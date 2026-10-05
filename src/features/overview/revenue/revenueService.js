import { db } from '@/core/db';
import { computeRevenueRows } from './revenueLogic';
/** Loads every invoice and purchase bill and derives the revenue rows. */
export async function loadRevenueRows() {
  const invoices = await db.getAllInvoices();
  const purchaseBills = await db.getAllPurchaseBills();
  return computeRevenueRows(invoices, purchaseBills);
}
