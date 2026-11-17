import { byInvoiceNoAsc } from '@/core/billing';
import { db } from '@/core/db';
import { toNum } from '@/core/format';

const clean = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase();
const round = (value) => Number(value.toFixed(6));

/** Keep each historical bill rate separate and charge returned quantities to their source bill. */
export function buildReturnProducts(current, invoices, returns, kind) {
  const party = kind === 'purchase' ? 'supplier' : 'customer';
  const eligible = invoices
    .filter((bill) => {
      const sameParty =
        clean(current[`${party}Phone`]) && clean(bill[`${party}Phone`])
          ? clean(current[`${party}Phone`]) === clean(bill[`${party}Phone`])
          : clean(current[`${party}Name`]) === clean(bill[`${party}Name`]);
      return sameParty && byInvoiceNoAsc(bill, current) <= 0;
    })
    .sort((a, b) => byInvoiceNoAsc(b, a));
  const groups = new Map();
  for (const bill of eligible) {
    for (const product of bill.products ?? []) {
      if (!product.description) continue;
      const description = product.description;
      const rate = toNum(product.rate);
      const key = JSON.stringify([description, rate]);
      if (!groups.has(key)) groups.set(key, { description, rate, qty: 0, sources: [] });
      const group = groups.get(key);
      group.qty = round(group.qty + toNum(product.qty));
      let source = group.sources.find((s) => s.invoiceNo === bill.invoiceNo);
      if (!source) {
        source = { invoiceNo: bill.invoiceNo, qty: 0 };
        group.sources.push(source);
      }
      source.qty = round(source.qty + toNum(product.qty));
    }
  }
  for (const group of groups.values()) {
    for (const source of group.sources) {
      const used = returns
        .filter(
          (r) =>
            (r.sourceInvoiceNo ?? r.invoiceNo) === source.invoiceNo &&
            r.description === group.description &&
            ((r.sourceRate == null && r.rate == null) || toNum(r.sourceRate ?? r.rate) === group.rate),
        )
        .reduce((sum, r) => sum + toNum(r.qty), 0);
      source.qty = Math.max(0, round(source.qty - used));
    }
    group.returnableQty = round(group.sources.reduce((sum, s) => sum + s.qty, 0));
    group.returnedQty = round(group.qty - group.returnableQty);
  }
  return [...groups.values()];
}

export async function loadReturnProducts(current, kind) {
  const purchase = kind === 'purchase';
  const [invoices, returns] = await Promise.all([
    purchase ? db.getAllPurchaseBills() : db.getAllInvoices(),
    purchase ? db.getAllPurchaseReturns() : db.getAllReturns(),
  ]);
  // Use the freshly read target, even if the collection cache still has an older version.
  const bills = [...(invoices ?? []).filter((b) => b.invoiceNo !== current.invoiceNo), current];
  return buildReturnProducts(current, bills, returns ?? [], kind);
}
