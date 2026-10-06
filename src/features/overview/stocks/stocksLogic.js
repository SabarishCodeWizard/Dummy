/**
 * Available stock + financial summary (port of `loadStocks` / the search handler in js/stocks.js).
 *
 * available = opening stock + purchased qty - sold qty. Sales RETURNS and purchase returns are NOT part of it (the web
 * page never loaded them). Products are matched by their TRIMMED description, case-sensitively — "Cotton" and "COTTON"
 * are two stock rows, unlike the revenue page which upper-cases.
 */
import { formatDateIN, toNum } from '@/core/format';
const round3 = (n) => Math.round(n * 1000) / 1000;
const round2 = (n) => Number(n.toFixed(2));
const newAccumulator = (opening = 0) => ({
  opening,
  purchased: 0,
  sold: 0,
  minStockLevel: 0,
  purchaseHistory: [],
  salesHistory: [],
});
/** Newest first; unparseable dates compare as equal (JS sort of NaN) and keep their order. */
function sortHistory(entries) {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const diff = new Date(b.entry.date).getTime() - new Date(a.entry.date).getTime();
      return Number.isNaN(diff) || diff === 0 ? a.index - b.index : diff;
    })
    .map((x) => x.entry);
}
export function computeStocks(purchaseBills, salesInvoices, openingStocks, productMetadata = []) {
  const stockMap = new Map();
  const entry = (description) => {
    let acc = stockMap.get(description);
    if (!acc) {
      acc = newAccumulator();
      stockMap.set(description, acc);
    }
    return acc;
  };
  // Seed with opening stocks (a duplicate description: the last one wins)
  openingStocks.forEach((stock) => {
    const description = String(stock.description ?? '').trim();
    if (!description) return;
    entry(description).opening = toNum(stock.qty);
  });
  
  // Seed with metadata
  if (productMetadata) {
    productMetadata.forEach((meta) => {
      const description = String(meta.description ?? '').trim();
      if (!description) return;
      entry(description).minStockLevel = toNum(meta.minStockLevel);
    });
  }
  let totalSales = 0;
  let cashReceived = 0;
  let totalPurchases = 0;
  purchaseBills.forEach((bill) => {
    totalPurchases += toNum(bill.grandTotal);
    if (!bill.products || !Array.isArray(bill.products)) return;
    bill.products.forEach((product) => {
      if (!product.description) return;
      const qty = toNum(product.qty);
      const rate = toNum(product.rate);
      const acc = entry(String(product.description).trim());
      acc.purchased += qty;
      acc.purchaseHistory.push({
        date: bill.invoiceDate || bill.date || '',
        party: bill.supplierName || 'Unknown',
        qty,
        rate,
        invoiceNo: String(bill.invoiceNo || ''),
        amount: round2(qty * rate),
      });
    });
  });
  salesInvoices.forEach((invoice) => {
    totalSales += toNum(invoice.grandTotal);
    cashReceived += toNum(invoice.amountPaid);
    if (!invoice.products || !Array.isArray(invoice.products)) return;
    invoice.products.forEach((product) => {
      if (!product.description) return;
      const qty = toNum(product.qty);
      const rate = toNum(product.rate);
      const acc = entry(String(product.description).trim());
      acc.sold += qty;
      acc.salesHistory.push({
        date: invoice.invoiceDate || invoice.date || '',
        party: invoice.customerName || 'Unknown',
        qty,
        rate,
        invoiceNo: String(invoice.invoiceNo || ''),
        amount: round2(qty * rate),
      });
    });
  });
  const rows = Array.from(stockMap, ([description, acc]) => {
    const opening = round3(acc.opening);
    const purchased = round3(acc.purchased);
    const sold = round3(acc.sold);
    return {
      description,
      opening,
      purchased,
      sold,
      available: round3(opening + purchased - sold),
      minStockLevel: acc.minStockLevel || 0,
      purchaseHistory: sortHistory(acc.purchaseHistory),
      salesHistory: sortHistory(acc.salesHistory),
    };
  }).sort((a, b) => a.description.localeCompare(b.description));
  return {
    rows,
    summary: { totalSales, totalPurchases, cashReceived, netProfitLoss: totalSales - totalPurchases },
  };
}
/** Case-insensitive substring of the description. (The web page did not trim the term; trailing spaces from keyboards are ignored here.) */
export function filterStocks(rows, term) {
  const q = term.trim().toLowerCase();
  return q ? rows.filter((r) => r.description.toLowerCase().includes(q)) : rows;
}
export function stockTone(available) {
  return available > 0 ? 'positive' : available < 0 ? 'negative' : 'zero';
}
/** Detail-sheet total: sum of the (2-decimal rounded) amounts, formatted `toFixed(2)` like the web table. */
export function historyTotal(entries) {
  return entries.reduce((sum, e) => sum + e.amount, 0);
}
/** Invoice number as the web history tables printed it ("P-" prefix dropped, for sales rows too). */
export function historyInvoiceNo(invoiceNo) {
  return invoiceNo.replace('P-', '');
}
/** Date column of the history tables (3/10/2026); unparseable values are shown as stored. */
export function historyDate(date) {
  return date ? formatDateIN(date) : '';
}
// ------------------------------------------------------------------ opening stock input
export const OPENING_STOCK_INVALID = 'You need to write a valid number!';
/** Validation of the quantity prompt: non-empty and parseable (0 and negatives are accepted, like the web prompt). */
export function parseOpeningStockQty(input) {
  const value = input.trim();
  if (!value || Number.isNaN(parseFloat(value))) return { error: OPENING_STOCK_INVALID };
  return { qty: parseFloat(value) };
}
/** Which opening-stock actions a row offers: "Add Old Stock" when there is none, else Edit + Delete. */
export function openingActions(row) {
  return row.opening > 0 ? 'edit' : 'add';
}
