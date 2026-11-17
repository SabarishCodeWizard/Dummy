import { db } from '@/core/db';
import { computeStocks } from './stocksLogic';
/** Loads purchases, sales and opening stocks and derives the stock rows + financial summary. */
export async function loadStocks() {
  const [purchaseBills, salesInvoices, openingStocks, productMetadata, salesReturns, purchaseReturns] =
    await Promise.all([
      db.getAllPurchaseBills(),
      db.getAllInvoices(),
      db.getAllOpeningStocks(),
      db.getAllProductMetadata(),
      db.getAllReturns(),
      db.getAllPurchaseReturns(),
    ]);
  return computeStocks(
    purchaseBills,
    salesInvoices,
    openingStocks,
    productMetadata,
    salesReturns,
    purchaseReturns,
  );
}
