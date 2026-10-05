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
    // previous = 100 - 0 - 25 = 75; total = 100 + 75 = 175; balance = 175 - 30 - 10 = 135
    expect(saved[0]).toMatchObject({ invoiceNo: '002', grandTotal: 175, balanceDue: 135, totalReturns: 10 });
  });
  test('PARITY QUIRK 1: running balance adds grandTotal (which already includes the previous balance)', async () => {
    // 3 invoices of 100, nothing paid. Correct carry into invoice 3 would be 200 (inv1 100 + inv2 100).
    // The web app computes: after inv1 = 100; inv2: total 100+100 = 200 -> running = 100 + 200 = 300 (double counts).
    const saved = setup([inv('001'), inv('002'), inv('003')]);
    await db.updateSubsequentInvoices('SLN TEX', '001');
    const second = saved.find((i) => i.invoiceNo === '002');
    const third = saved.find((i) => i.invoiceNo === '003');
    expect(second.grandTotal).toBe(200);
    expect(third.grandTotal).toBe(400); // 100 + 300 — a "correct" ledger would give 300
  });
  test('PARITY QUIRK 2: discount and opening balance are not part of the recomputed total', async () => {
    const saved = setup([
      inv('001', { balanceDue: 100 }),
      inv('002', { discountAmount: 50, manualPreviousBalance: 20, grandTotal: 70, balanceDue: 70 }),
    ]);
    await db.updateSubsequentInvoices('SLN TEX', '001');
    expect(saved[0].grandTotal).toBe(200); // 100 subtotal + 100 previous; the -50 / +20 are dropped
  });
  test('does not mutate the cached invoice objects', async () => {
    const original = inv('002', { grandTotal: 200, balanceDue: 200 });
    setup([inv('001', { amountPaid: 40, balanceDue: 60 }), original]);
    await db.updateSubsequentInvoices('SLN TEX', '001');
    expect(original.grandTotal).toBe(200);
  });
});
