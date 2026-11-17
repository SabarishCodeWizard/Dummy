/**
 * Return-side pure logic (invoice-history.js addReturn / addReturnItem / updateReturnProductInfo /
 * calculateReturnAmount / updateReturnSummary / saveReturn validation / getAlreadyReturnedQty).
 */
import { formatCurrency, toNum } from '@/core/format';
export const newReturnItem = (key) => ({
  key,
  choice: null,
  custom: '',
  qty: '0',
  rate: '0',
  reason: '',
});
/** updateReturnProductInfo(): picking an invoice product copies its rate; 'custom' clears the text and zeroes the rate. */
export function chooseReturnProduct(item, choice, products) {
  if (choice === 'custom') return { ...item, choice, custom: '', rate: '0', productKey: null };
  if (choice === null) return { ...item, choice, custom: '', productKey: null };
  const product = products[choice];
  return {
    ...item,
    choice,
    custom: '',
    rate: product ? String(product.rate ?? 0) : item.rate,
    productKey: product ? JSON.stringify([product.description, toNum(product.rate)]) : null,
  };
}
export function returnItemDescription(item, products) {
  if (item.choice === 'custom') return item.custom.trim();
  if (item.choice === null) return '';
  return products[item.choice]?.description ?? '';
}
/** calculateReturnAmount(): qty x rate rounded to 2 decimals (the read-only field held `amount.toFixed(2)`). */
export function returnItemAmount(item) {
  return Number((toNum(item.qty) * toNum(item.rate)).toFixed(2));
}
export function returnTotal(items) {
  return items.reduce((sum, item) => sum + returnItemAmount(item), 0);
}
/** updateReturnSummary(): the new adjusted balance after this return. */
export function returnSummary(items, currentBalance) {
  const total = returnTotal(items);
  return { total, newAdjustedBalance: currentBalance - total };
}
/** getAlreadyReturnedQty(): quantity of one product (matched by description) returned so far. */
export function alreadyReturnedQty(returns, description) {
  return returns.filter((r) => r.description === description).reduce((total, r) => total + toNum(r.qty), 0);
}
/** description -> quantity already returned, for the "Returned: n" hint under each line. */
export function returnedQtyByDescription(returns) {
  const map = new Map();
  for (const r of returns) map.set(r.description, (map.get(r.description) ?? 0) + toNum(r.qty));
  return map;
}
/**
 * saveReturn() validation, in the web's order and wording:
 * date -> at least one item -> each line (description, qty > 0, rate > 0, qty within what is left to return)
 * -> total must not exceed the current balance.
 *
 * Deviation: two lines for the same product in one submission are checked against their COMBINED quantity (the web
 * checked each line against stored returns only, so the same product could be returned twice past its sold quantity).
 */
export function validateReturnDraft(input) {
  const { returnDate, items, products, existingReturns, currentBalance } = input;
  if (!returnDate) return { ok: false, title: 'Warning', message: 'Please select a return date.' };
  if (items.length === 0)
    return { ok: false, title: 'Warning', message: 'Please add at least one return item.' };
  const lines = [];
  const pending = new Map();
  let total = 0;
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const selected = products[item.choice];
    if (
      item.productKey &&
      item.productKey !== JSON.stringify([selected?.description, toNum(selected?.rate)])
    ) {
      return {
        ok: false,
        title: 'Warning',
        message:
          'The bill products have changed. Please reopen the return form and select the product again.',
      };
    }
    const description = returnItemDescription(item, products);
    const qty = toNum(item.qty);
    const rate = toNum(item.rate);
    const returnAmount = returnItemAmount(item);
    if (!description || qty <= 0 || rate <= 0) {
      return {
        ok: false,
        title: 'Warning',
        message: `Please fill all required fields for return item ${index + 1}`,
      };
    }
    if (typeof item.choice === 'number') {
      const product = products[item.choice];
      const maxQty = toNum(product?.returnableQty ?? product?.qty);
      const pendingKey = product?.sources ? item.choice : description;
      const alreadyReturned =
        (product?.sources ? 0 : alreadyReturnedQty(existingReturns, description)) +
        (pending.get(pendingKey) ?? 0);
      if (qty + alreadyReturned - maxQty > 0.000001) {
        return {
          ok: false,
          title: 'Error',
          message: `Cannot return ${qty} items. Only ${Number(Math.max(0, maxQty - alreadyReturned).toFixed(6))} items available for return for "${description}".`,
        };
      }
      pending.set(pendingKey, (pending.get(pendingKey) ?? 0) + qty);
      if (product?.sources) {
        let left = qty;
        let skip = alreadyReturned;
        let allocatedAmount = 0;
        for (const source of product.sources) {
          const used = Math.min(skip, source.qty);
          skip -= used;
          const portion = Number(Math.min(left, source.qty - used).toFixed(6));
          if (portion <= 0) continue;
          left = Number((left - portion).toFixed(6));
          const amount =
            left === 0
              ? Number((returnAmount - allocatedAmount).toFixed(2))
              : Number((portion * rate).toFixed(2));
          allocatedAmount += amount;
          lines.push({
            description,
            qty: portion,
            rate,
            returnAmount: amount,
            reason: item.reason,
            returnDate,
            sourceInvoiceNo: source.invoiceNo,
            sourceRate: product.rate,
          });
          if (left === 0) break;
        }
        total += returnAmount;
        continue;
      }
    }
    lines.push({ description, qty, rate, returnAmount, reason: item.reason, returnDate });
    total += returnAmount;
  }
  total = Number(total.toFixed(2));
  // If currentBalance is specified and greater than 0, check if return exceeds it;
  // if currentBalance <= 0 (e.g. fully paid older bill), allow the return against the products returned
  if (
    currentBalance !== undefined &&
    currentBalance !== null &&
    currentBalance > 0 &&
    total > currentBalance
  ) {
    return {
      ok: false,
      title: 'Error',
      message: `Return amount (₹${formatCurrency(total)}) cannot exceed current balance (₹${formatCurrency(currentBalance)})`,
    };
  }
  return { ok: true, lines, total };
}
export const returnSuccessMessage = (total) =>
  `Return processed successfully! Total return amount: ₹${formatCurrency(total)}`;
