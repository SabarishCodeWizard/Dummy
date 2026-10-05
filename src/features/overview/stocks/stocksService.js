import { db } from '@/core/db';
import { computeStocks } from './stocksLogic';
/** Loads purchases, sales and opening stocks and derives the stock rows + financial summary. */
export async function loadStocks() {
  const purchaseBills = await db.getAllPurchaseBills();
  const salesInvoices = await db.getAllInvoices();
  const openingStocks = await db.getAllOpeningStocks();
  return computeStocks(purchaseBills, salesInvoices, openingStocks);
}
