import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { buildReturnProducts } from '@/features/history/lib/returnProducts';
import { newReturnItem, chooseReturnProduct, validateReturnDraft } from '@/features/history/lib/returns';
import { ReturnItemEditor } from '@/features/history/components/ReturnItemEditor';
import { db } from '@/core/db';
import { saveSalesReturn } from '@/features/history/sales/salesReturns';
import { savePurchaseReturnDraft } from '@/features/history/purchase/purchaseReturns';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe.each(['sales', 'purchase'])('%s historical returns', (kind) => {
  const party = kind === 'sales' ? 'customer' : 'supplier';
  const bill = (invoiceNo, qty, rate) => ({
    invoiceNo,
    [`${party}Name`]: 'Thirumeni Anna',
    [`${party}Phone`]: '9876543210',
    products: [{ description: 'Single Jersey 20s', qty, rate }],
  });
  const invoices = [bill('015', 50.5, 210), bill('046', 24.7, 220), bill('053', 16.2, 210)];
  const current = invoices[2];
  const draft = (products, qty) => ({
    returnDate: '2026-10-29',
    products,
    existingReturns: [],
    currentBalance: 1066620.3,
    items: [{ ...chooseReturnProduct(newReturnItem('k'), 0, products), qty }],
  });

  test('24.4 can be returned on #053 at ₹210, allocated across the source bills', () => {
    const products = buildReturnProducts(current, invoices, [], kind);
    expect(products.map((p) => [p.rate, p.returnableQty])).toEqual([
      [210, 66.7],
      [220, 24.7],
    ]);
    const result = validateReturnDraft(draft(products, '24.4'));
    expect(result).toMatchObject({ ok: true, total: 5124 });
    expect(result.lines.map((r) => [r.sourceInvoiceNo, r.qty, r.returnAmount])).toEqual([
      ['053', 16.2, 3402],
      ['015', 8.2, 1722],
    ]);
    const returns = result.lines.map((r) => ({ ...r, invoiceNo: '053' }));
    const remaining = buildReturnProducts(current, invoices, returns, kind);
    expect(remaining[0].returnableQty).toBe(42.3);
    expect(validateReturnDraft(draft(remaining, '42.4')).ok).toBe(false);
    expect(validateReturnDraft(draft(remaining, '42.3')).ok).toBe(true);
  });

  test('deducts legacy returns, excludes other parties and future bills', () => {
    const products = buildReturnProducts(
      current,
      [...invoices, bill('054', 100, 210), { ...bill('020', 100, 210), [`${party}Phone`]: '1111111111' }],
      [{ invoiceNo: '015', description: 'Single Jersey 20s', rate: 210, qty: 10 }],
      kind,
    );
    expect(products[0].returnableQty).toBe(56.7);
    expect(buildReturnProducts(current, invoices, [], kind)[0].returnableQty).toBe(66.7);
  });

  test('saving a historical return updates the current bill balance and prevents a second over-return', async () => {
    const purchase = kind === 'purchase';
    const currentBill = { ...current, balanceDue: 1066620.3, payment: { balanceDue: 1066620.3 } };
    const returns = [];
    vi.spyOn(db, purchase ? 'getPurchaseBill' : 'getInvoice').mockResolvedValue(currentBill);
    vi.spyOn(db, purchase ? 'getAllPurchaseBills' : 'getAllInvoices').mockResolvedValue(invoices);
    vi.spyOn(db, purchase ? 'getAllPurchaseReturns' : 'getAllReturns').mockImplementation(
      async () => returns,
    );
    vi.spyOn(db, purchase ? 'getPurchaseReturnsByInvoice' : 'getReturnsByInvoice').mockImplementation(
      async () => returns,
    );
    vi.spyOn(db, purchase ? 'savePurchaseReturn' : 'saveReturn').mockImplementation(async (r) => {
      returns.push(r);
    });
    const saveBill = vi.spyOn(db, purchase ? 'savePurchaseBill' : 'saveInvoice').mockResolvedValue();
    vi.spyOn(db, purchase ? 'updateSubsequentPurchaseBills' : 'updateSubsequentInvoices').mockResolvedValue();
    const products = buildReturnProducts(current, invoices, [], kind);
    const save = purchase ? savePurchaseReturnDraft : saveSalesReturn;
    expect(await save('053', draft(products, '24.4'))).toEqual({ ok: true, total: 5124 });
    expect(saveBill).toHaveBeenCalledWith(
      expect.objectContaining({ totalReturns: 5124, adjustedBalanceDue: 1061496.3 }),
    );
    expect(returns.every((r) => r.invoiceNo === '053')).toBe(true);
    expect((await save('053', draft(products, '42.4'))).ok).toBe(false);
  });

  test('same-rate duplicate lines share quantity limits and edited refund rates keep source tracking', () => {
    const products = buildReturnProducts(
      current,
      [
        ...invoices.slice(0, 2),
        {
          ...current,
          products: [...current.products, ...current.products],
        },
      ],
      [],
      kind,
    );
    const input = draft(products, '20');
    input.items[0].rate = '200';
    input.items.push({ ...input.items[0], qty: '64' });
    expect(validateReturnDraft(input).ok).toBe(false);
    input.items.pop();
    const result = validateReturnDraft(input);
    expect(result.lines[0]).toMatchObject({ sourceRate: 210, rate: 200 });
  });
});

test('product picker displays distinct bill rates and selecting one copies the rate', () => {
  const products = [
    { description: 'Single Jersey Tube', qty: 20, rate: 250, returnableQty: 14 },
    { description: 'Single Jersey Tube', qty: 6, rate: 210, returnableQty: 6 },
  ];
  const onChange = vi.fn();
  render(
    <ReturnItemEditor
      index={0}
      item={newReturnItem('k')}
      products={products}
      returnedQty={new Map()}
      onChange={onChange}
      onRemove={() => {}}
    />,
  );
  expect(screen.getByRole('option', { name: /₹250.00.*14/ })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Product Description'), { target: { value: '1' } });
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ choice: 1, rate: '210' }));
});
