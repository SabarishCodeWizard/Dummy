import { db } from '@/core/db';
/**
 * Database.updateSubsequentInvoices is a 1:1 port of the web app's Utils.updateSubsequentInvoices. These tests pin the
 * CURRENT behaviour so the React app and the original site produce identical numbers on the shared data — including two
 * quirks (documented in docs/MIGRATION_NOTES.md) that look like bugs but are intentionally preserved.
 */
const inv = (no, over = {}) => ({
  invoiceNo: no,
  invoiceDate: '2026-05-10',
  customerName: 'SLN TEX',
  customerAddress: '',
  customerPhone: '9876543210',
  products: [{ description: 'X', qty: 1, rate: 100, amount: 100 }],
  subtotal: 100,
  previousBalance: 0,
  grandTotal: 100,
  amountPaid: 0,
  balanceDue: 100,
  ...over,
});
function setup(invoices, returns = []) {
  const saved = [];
  jest.spyOn(db, 'getAllInvoices').mockResolvedValue(invoices);
  jest.spyOn(db, 'getAllReturns').mockResolvedValue(returns);
  jest.spyOn(db, 'saveInvoice').mockImplementation(async (i) => {
    saved.push(JSON.parse(JSON.stringify(i)));
    return i.invoiceNo;
  });
  return saved;
}
afterEach(() => jest.restoreAllMocks());
describe('updateSubsequentInvoices', () => {
  test('does nothing for the latest invoice, an unknown invoice, or another customer', async () => {
    const saved = setup([inv('001'), inv('002')]);
    await db.updateSubsequentInvoices('SLN TEX', '002');
    await db.updateSubsequentInvoices('SLN TEX', '999');
    await db.updateSubsequentInvoices('Nobody', '001');
    expect(saved).toHaveLength(0);
  });
  test('payment on invoice 1 flows into invoice 2 (single follower: correct result)', async () => {
    // Invoice 1 was edited: now 40 paid, so 60 is carried forward into invoice 2 (subtotal 100).
    const saved = setup([
      inv('001', { amountPaid: 40, balanceDue: 60 }),
      inv('002', { grandTotal: 200, balanceDue: 200 }),
    ]);
    await db.updateSubsequentInvoices('SLN TEX', '001');
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      invoiceNo: '002',
      subtotal: 100,
      grandTotal: 160,
      balanceDue: 160,
      totalReturns: 0,
      adjustedBalanceDue: 160,
    });
  });
  test('returns reduce the carried balance and the follower balance', async () => {
    const saved = setup(
      [
        inv('001', { amountPaid: 0, balanceDue: 100 }),
        inv('002', { amountPaid: 30, grandTotal: 200, balanceDue: 170 }),
      ],
      [
        { invoiceNo: '001', returnAmount: 25 },
        { invoiceNo: '002', returnAmount: 10 },
      ],
    );
    await db.updateSubsequentInvoices('SLN TEX', '001');
    // previous = 100 - 0 - 25 = 75; total = 100 + 75 = 175; balanceDue = 175 - 30 = 145; adjusted = 145 - 10 = 135
    expect(saved[0]).toMatchObject({
      invoiceNo: '002',
      grandTotal: 175,
      balanceDue: 145,
      adjustedBalanceDue: 135,
      totalReturns: 10,
    });
  });
  test('running balance adds subtotal/due correctly without double-counting previousBalance', async () => {
    // 3 invoices of 100, nothing paid. Correct carry into invoice 3 is 200 (inv1 100 + inv2 100).
    const saved = setup([inv('001'), inv('002'), inv('003')]);
    await db.updateSubsequentInvoices('SLN TEX', '001');
    const second = saved.find((i) => i.invoiceNo === '002');
    const third = saved.find((i) => i.invoiceNo === '003');
    expect(second.grandTotal).toBe(200);
    expect(third.grandTotal).toBe(300); // Correctly 300, no double counting
  });
  test('discount and opening balance are preserved during subsequent invoice recalculation', async () => {
    const saved = setup([
      inv('001', { balanceDue: 100 }),
      inv('002', { discountAmount: 50, manualPreviousBalance: 20, grandTotal: 70, balanceDue: 70 }),
    ]);
    await db.updateSubsequentInvoices('SLN TEX', '001');
    expect(saved[0].grandTotal).toBe(170); // 100 subtotal + 100 previous + 20 manual - 50 discount
  });
  test('does not mutate the cached invoice objects', async () => {
    const original = inv('002', { grandTotal: 200, balanceDue: 200 });
    setup([inv('001', { amountPaid: 40, balanceDue: 60 }), original]);
    await db.updateSubsequentInvoices('SLN TEX', '001');
    expect(original.grandTotal).toBe(200);
  });
});

describe('updateSubsequentPurchaseBills', () => {
  const pBill = (no, over = {}) => ({
    invoiceNo: no,
    invoiceDate: '2026-05-10',
    supplierName: 'ABC Cotton',
    supplierPhone: '9876543210',
    products: [{ description: 'Cotton Yarn', qty: 1, rate: 500, amount: 500 }],
    subtotal: 500,
    previousBalance: 0,
    grandTotal: 500,
    amountPaid: 0,
    balanceDue: 500,
    payment: { totalPaid: 0, balanceDue: 500 },
    ...over,
  });

  function setupPurchases(bills, returns = []) {
    const saved = [];
    jest.spyOn(db, 'getAllPurchaseBills').mockResolvedValue(bills);
    jest.spyOn(db, 'getAllPurchaseReturns').mockResolvedValue(returns);
    jest.spyOn(db, 'savePurchaseBill').mockImplementation(async (b) => {
      saved.push(JSON.parse(JSON.stringify(b)));
      return true;
    });
    return saved;
  }

  test('recalculates subsequent purchase bill grandTotal, previousBalance, and balanceDue after payment on bill 1', async () => {
    const saved = setupPurchases([
      pBill('001', { amountPaid: 200, balanceDue: 300, payment: { totalPaid: 200, balanceDue: 300 } }),
      pBill('002', { subtotal: 500, grandTotal: 1000, balanceDue: 1000 }),
    ]);

    await db.updateSubsequentPurchaseBills('ABC Cotton', '001', '9876543210');
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      invoiceNo: '002',
      previousBalance: 300,
      subtotal: 500,
      grandTotal: 800,
      amountPaid: 0,
      balanceDue: 800,
      adjustedBalanceDue: 800,
    });
  });

  test('returns on bill 1 reduce the carried previous balance into bill 2', async () => {
    const saved = setupPurchases(
      [
        pBill('001', { amountPaid: 0, balanceDue: 500 }),
        pBill('002', { amountPaid: 100, grandTotal: 1000, balanceDue: 900 }),
      ],
      [{ invoiceNo: '001', returnAmount: 150 }],
    );

    await db.updateSubsequentPurchaseBills('ABC Cotton', '001', '9876543210');
    expect(saved).toHaveLength(1);
    // previous = 500 - 150 = 350; grandTotal = 500 + 350 = 850; balanceDue = 850 - 100 = 750
    expect(saved[0]).toMatchObject({
      invoiceNo: '002',
      previousBalance: 350,
      grandTotal: 850,
      balanceDue: 750,
      adjustedBalanceDue: 750,
    });
  });

  test('recalculates across a chain of 3 purchase bills without double counting', async () => {
    const saved = setupPurchases([pBill('001'), pBill('002'), pBill('003')]);
    await db.updateSubsequentPurchaseBills('ABC Cotton', '001', '9876543210');
    const second = saved.find((b) => b.invoiceNo === '002');
    const third = saved.find((b) => b.invoiceNo === '003');
    expect(second.previousBalance).toBe(500);
    expect(second.grandTotal).toBe(1000);
    expect(third.previousBalance).toBe(1000);
    expect(third.grandTotal).toBe(1500);
  });
});
