import {
  breakdownFromPayments,
  buildProductLines,
  calcPurchaseTotals,
  calcSalesTotals,
  calcSubtotal,
  calculateCustomerBalance,
  calculatePreviousBalanceAtTime,
  calculateSupplierPreviousBalanceAtTime,
  highestInvoiceNumber,
  purchaseAmountPaid,
  purchaseBalanceDue,
  suggestPurchaseInvoiceNumber,
  suggestSalesInvoiceNumber,
} from '@/core/billing';
import { db } from '@/core/db';
const inv = (over) => ({
  invoiceNo: '001',
  invoiceDate: '2026-05-10',
  customerName: 'SLN TEX',
  customerAddress: '',
  customerPhone: '9876543210',
  products: [],
  subtotal: 0,
  previousBalance: 0,
  grandTotal: 0,
  amountPaid: 0,
  balanceDue: 0,
  ...over,
});
afterEach(() => jest.restoreAllMocks());
describe('totals', () => {
  test('subtotal = sum(qty*rate) with parseFloat(x)||0 coercion', () => {
    expect(
      calcSubtotal([
        { qty: '2', rate: '10.5' },
        { qty: '', rate: '5' },
        { qty: 3, rate: '2' },
      ]),
    ).toBe(27);
  });
  test('sales totals: previous + opening - discount, paid across methods + later payments', () => {
    const t = calcSalesTotals({
      subtotal: 1000,
      previousBalance: 250,
      manualPreviousBalance: 50,
      discount: 100,
      cash: 400,
      upi: 100,
      account: 0,
      additionalPaid: 200,
    });
    expect(t.grandTotal).toBe(1200);
    expect(t.totalPaid).toBe(700);
    expect(t.balanceDue).toBe(500);
  });
  test('sales grand total may go negative (credit balance); purchase total is clamped at 0', () => {
    expect(calcSalesTotals({ subtotal: 100, previousBalance: 0, discount: 500 }).grandTotal).toBe(-400);
    const p = calcPurchaseTotals({ subtotal: 100, previousBalance: 0, discount: 500, cash: 20 });
    expect(p.grandTotal).toBe(0);
    expect(p.balanceDue).toBe(-20);
  });
  test('purchase totals ignore additionalPaid (purchase.js has no such concept)', () => {
    expect(
      calcPurchaseTotals({ subtotal: 100, previousBalance: 0, cash: 10, additionalPaid: 999 }).totalPaid,
    ).toBe(10);
  });
  test('buildProductLines: skips blank descriptions, numbers sequentially, optional qty>0 rule', () => {
    const rows = [
      { description: 'A', qty: '2', rate: '10' },
      { description: '  ', qty: '5', rate: '5' },
      { description: 'B', qty: '0', rate: '7' },
      { description: ' C ', qty: '1', rate: '3' },
    ];
    expect(buildProductLines(rows).map((l) => [l.sno, l.description, l.amount])).toEqual([
      [1, 'A', 20],
      [2, 'B', 0],
      [3, 'C', 3],
    ]);
    expect(buildProductLines(rows, { requirePositiveQty: true }).map((l) => l.description)).toEqual([
      'A',
      'C',
    ]);
  });
  test('breakdownFromPayments groups by method; bank counts as account; unknown counts as cash', () => {
    expect(
      breakdownFromPayments([
        { amount: 100, paymentMethod: 'cash' },
        { amount: 50, paymentMethod: 'UPI' },
        { amount: 25, paymentMethod: 'bank' },
        { amount: 10, paymentMethod: 'account' },
        { amount: 5, paymentMethod: 'cheque' },
        { amount: 1, paymentMethod: '' },
      ]),
    ).toEqual({ cash: 106, upi: 50, account: 35 });
  });
});
describe('purchase bill field access (hybrid schema)', () => {
  test('nested payment object wins; falls back to top-level fields', () => {
    const fresh = { payment: { cash: 0, upi: 0, account: 0, totalPaid: 300, balanceDue: 700 } };
    const edited = { amountPaid: 100, balanceDue: 900 };
    expect(purchaseBalanceDue(fresh)).toBe(700);
    expect(purchaseAmountPaid(fresh)).toBe(300);
    expect(purchaseBalanceDue(edited)).toBe(900);
    expect(purchaseAmountPaid(edited)).toBe(100);
    expect(purchaseBalanceDue({})).toBe(0);
  });
  test('a nested balanceDue of 0 is respected (not treated as missing)', () => {
    expect(purchaseBalanceDue({ payment: { totalPaid: 5, balanceDue: 0 }, balanceDue: 999 })).toBe(0);
  });
});
describe('sales invoice numbering', () => {
  test('first invoice of the financial year is 001', () => {
    expect(suggestSalesInvoiceNumber([], '2026-05-01')).toMatchObject({
      nextInvoiceNo: '001',
      lastInvoiceNo: 'No invoices yet',
    });
  });
  test('increments the highest number in the FY, zero-padded', () => {
    const list = [inv({ invoiceNo: '007' }), inv({ invoiceNo: '012' }), inv({ invoiceNo: '003' })];
    expect(suggestSalesInvoiceNumber(list, '2026-06-01')).toMatchObject({
      lastInvoiceNo: '012',
      nextInvoiceNo: '013',
      nextNumber: 13,
    });
  });
  test('only the same financial year counts (April resets)', () => {
    const list = [
      inv({ invoiceNo: '250', invoiceDate: '2026-03-31' }),
      inv({ invoiceNo: '004', invoiceDate: '2026-04-02' }),
    ];
    expect(highestInvoiceNumber(list, '2026-05-01').highestNumber).toBe(4);
    expect(highestInvoiceNumber(list, '2026-02-01').highestNumber).toBe(250);
  });
  test('wraps 999 -> 001 and flags the cycle restart', () => {
    const r = suggestSalesInvoiceNumber([inv({ invoiceNo: '999' })], '2026-05-01');
    expect(r.nextInvoiceNo).toBe('001');
    expect(r.cycleRestarted).toBe(true);
  });
  test('keeps the letter prefix / suffix of the last invoice', () => {
    expect(suggestSalesInvoiceNumber([inv({ invoiceNo: 'INV-009' })], '2026-05-01').nextInvoiceNo).toBe(
      'INV010',
    );
    expect(suggestSalesInvoiceNumber([inv({ invoiceNo: '009A' })], '2026-05-01').nextInvoiceNo).toBe('010A');
    expect(suggestSalesInvoiceNumber([inv({ invoiceNo: 'S009X' })], '2026-05-01').nextInvoiceNo).toBe(
      'S010X',
    );
  });
  test('pads a purely numeric last invoice for display', () => {
    expect(suggestSalesInvoiceNumber([inv({ invoiceNo: '5' })], '2026-05-01').lastInvoiceNo).toBe('005');
  });
});
describe('purchase invoice numbering', () => {
  test('empty list', () =>
    expect(suggestPurchaseInvoiceNumber([])).toEqual({
      lastInvoiceNo: 'No invoices yet',
      nextInvoiceNo: '001',
    }));
  test('ignores a P- prefix and uses all bills (no FY reset)', () => {
    expect(
      suggestPurchaseInvoiceNumber([{ invoiceNo: 'P-009' }, { invoiceNo: '12' }, { invoiceNo: 'x' }]),
    ).toEqual({
      lastInvoiceNo: '012',
      nextInvoiceNo: '013',
    });
  });
});
describe('balance carried forward', () => {
  const stub = (invoices, returns = []) => {
    jest.spyOn(db, 'getAllInvoices').mockResolvedValue(invoices);
    jest.spyOn(db, 'getAllReturns').mockResolvedValue(returns);
    jest
      .spyOn(db, 'getReturnsByInvoice')
      .mockImplementation(async (no) => returns.filter((r) => r.invoiceNo === no));
  };
  test('new bill: carries the latest invoice balance minus its returns', async () => {
    stub(
      [
        inv({ invoiceNo: '001', grandTotal: 1000, balanceDue: 400 }),
        inv({ invoiceNo: '002', grandTotal: 900, balanceDue: 700 }),
      ],
      [{ invoiceNo: '002', returnAmount: 150 }],
    );
    const r = await calculatePreviousBalanceAtTime('SLN TEX', '9876543210', null);
    expect(r.balanceCarriedForward).toBe(550);
    expect(r.invoiceCount).toBe(2);
  });
  test('matches by phone when present, else by case-insensitive name', async () => {
    stub([inv({ invoiceNo: '001', customerPhone: '1111111111', customerName: 'Other', balanceDue: 50 })]);
    expect((await calculatePreviousBalanceAtTime('anything', '2222222222')).invoiceCount).toBe(0);
    stub([inv({ invoiceNo: '001', customerPhone: '', customerName: 'SLN Tex', balanceDue: 50 })]);
    expect((await calculatePreviousBalanceAtTime('sln tex', null)).balanceCarriedForward).toBe(50);
  });
  test('editing an existing invoice: balance comes from the invoice before it', async () => {
    stub(
      [
        inv({ invoiceNo: '001', grandTotal: 1000, balanceDue: 300 }),
        inv({ invoiceNo: '002', grandTotal: 1300, balanceDue: 800 }),
      ],
      [{ invoiceNo: '001', returnAmount: 100 }],
    );
    const r = await calculatePreviousBalanceAtTime('SLN TEX', '9876543210', '002');
    expect(r.balanceCarriedForward).toBe(200);
    expect(r.totalPreviousBills).toBe(1000);
    expect((await calculatePreviousBalanceAtTime('SLN TEX', '9876543210', '001')).balanceCarriedForward).toBe(
      0,
    );
  });
  test('calculateCustomerBalance uses the most recent invoice (by number) excluding the current one', async () => {
    stub([
      inv({ invoiceNo: '001', balanceDue: 10, grandTotal: 100 }),
      inv({ invoiceNo: '002', balanceDue: 20, grandTotal: 200 }),
    ]);
    const r = await calculateCustomerBalance('SLN TEX', '002');
    expect(r.lastInvoiceNo).toBe('001');
    expect(r.balanceCarriedForward).toBe(10);
  });
  test('PARITY: supplier previous balance reads TOP-LEVEL balanceDue (nested payment.balanceDue is ignored)', async () => {
    const bills = [
      {
        invoiceNo: '001',
        supplierName: 'S',
        supplierPhone: '9',
        grandTotal: 500,
        payment: { balanceDue: 500 },
      },
      { invoiceNo: '002', supplierName: 'S', supplierPhone: '9', grandTotal: 300, balanceDue: 120 },
    ];
    jest.spyOn(db, 'getAllPurchaseBills').mockResolvedValue(bills);
    expect((await calculateSupplierPreviousBalanceAtTime('S', '9', null)).balanceCarriedForward).toBe(120);
    expect((await calculateSupplierPreviousBalanceAtTime('S', '9', '002')).balanceCarriedForward).toBe(0);
  });
});
