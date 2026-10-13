import { db } from '@/core/db';
import { toNum } from '@/core/format';

/**
 * Calculates current balances for all bank accounts and cash in hand.
 *
 * Balance Formula:
 * For each Bank Account:
 *   Opening Balance
 *   + Inflows from Sales (where paymentBreakdown.account or upi was credited or bank account linked)
 *   + Inflows from Borrowed Amounts (loans received into this bank account)
 *   + Internal Transfers In (transfers from Cash or another Bank)
 *   - Outflows for Purchases (where payment was debited from this bank account)
 *   - Outflows for Loan Repayments (paid from this bank account)
 *   - Internal Transfers Out (transfers to Cash or another Bank)
 *
 * For Cash in Hand:
 *   Opening Cash Balance
 *   + Inflows from Sales (Cash collected)
 *   + Inflows from Borrowed Amounts (loans received in Cash)
 *   + Internal Cash Deposits / Withdrawals (from Bank to Cash)
 *   - Outflows for Purchases (Cash paid)
 *   - Outflows for Expenses (Cash paid)
 *   - Outflows for Loan Repayments (paid in Cash)
 *   - Cash deposited to Banks
 */
export function computeAccountBalances({
  bankAccounts = [],
  cashOpening = 0,
  salesInvoices = [],
  purchaseBills = [],
  expenses = [],
  financeRecords = [],
  accountTransactions = [],
  salesPayments = [],
  purchasePayments = [],
  salesReturns = [],
  purchaseReturns = [],
}) {
  // Map bank accounts by id
  const bankMap = {};
  bankAccounts.forEach((acc) => {
    bankMap[acc.id] = {
      ...acc,
      openingBalance: toNum(acc.openingBalance),
      currentBalance: toNum(acc.openingBalance),
      inflows: 0,
      outflows: 0,
    };
  });

  let cashBalance = toNum(cashOpening);
  let cashInflows = 0;
  let cashOutflows = 0;

  // 1. Borrowed funds (Finance records)
  financeRecords.forEach((record) => {
    const principal = toNum(record.principal);
    const dest = record.depositAccount || 'cash'; // 'cash' or bank account id

    if (dest === 'cash') {
      cashBalance += principal;
      cashInflows += principal;
    } else if (bankMap[dest]) {
      bankMap[dest].currentBalance += principal;
      bankMap[dest].inflows += principal;
    }

    // Loan repayments (outflow)
    (record.payments || []).forEach((p) => {
      const pAmt = toNum(p.amount);
      const source = p.sourceAccount || (p.mode === 'Cash' ? 'cash' : Object.keys(bankMap)[0] || 'cash');
      if (source === 'cash') {
        cashBalance -= pAmt;
        cashOutflows += pAmt;
      } else if (bankMap[source]) {
        bankMap[source].currentBalance -= pAmt;
        bankMap[source].outflows -= pAmt;
      } else {
        cashBalance -= pAmt;
        cashOutflows += pAmt;
      }
    });
  });

  // 2. Sales Inflows
  const sPaymentsByInv = new Map();
  (salesPayments || []).forEach((p) => {
    if (!p.invoiceNo) return;
    const invNo = String(p.invoiceNo);
    if (!sPaymentsByInv.has(invNo)) sPaymentsByInv.set(invNo, []);
    sPaymentsByInv.get(invNo).push(p);
  });

  salesInvoices.forEach((inv) => {
    const invNo = String(inv.invoiceNo || inv.billNo || '');
    const paymentsForInv = sPaymentsByInv.get(invNo);

    if (paymentsForInv && paymentsForInv.length > 0) {
      paymentsForInv.forEach((p) => {
        const amt = toNum(p.amount);
        if (p.paymentMethod === 'cash') {
          cashBalance += amt;
          cashInflows += amt;
        } else {
          const targetBankId = p.bankAccountId || inv.bankAccountId || Object.keys(bankMap)[0];
          if (targetBankId && bankMap[targetBankId]) {
            bankMap[targetBankId].currentBalance += amt;
            bankMap[targetBankId].inflows += amt;
          }
        }
      });
    } else {
      const cashPaid = toNum(inv.paymentBreakdown?.cash || (inv.paymentMethod === 'cash' ? inv.amountPaid : 0));
      const upiPaid = toNum(inv.paymentBreakdown?.upi || (inv.paymentMethod === 'upi' ? inv.amountPaid : 0));
      const accPaid = toNum(inv.paymentBreakdown?.account || (inv.paymentMethod === 'account' ? inv.amountPaid : 0));

      if (cashPaid > 0) {
        cashBalance += cashPaid;
        cashInflows += cashPaid;
      }

      const targetBankId = inv.bankAccountId || Object.keys(bankMap)[0];
      const bankInflow = upiPaid + accPaid;
      if (bankInflow > 0 && targetBankId && bankMap[targetBankId]) {
        bankMap[targetBankId].currentBalance += bankInflow;
        bankMap[targetBankId].inflows += bankInflow;
      }
    }
  });

  // 3. Purchase Outflows
  const pPaymentsByInv = new Map();
  (purchasePayments || []).forEach((p) => {
    if (!p.invoiceNo) return;
    const invNo = String(p.invoiceNo);
    if (!pPaymentsByInv.has(invNo)) pPaymentsByInv.set(invNo, []);
    pPaymentsByInv.get(invNo).push(p);
  });

  purchaseBills.forEach((bill) => {
    const billNo = String(bill.billNumber || bill.invoiceNo || '');
    const paymentsForBill = pPaymentsByInv.get(billNo);

    if (paymentsForBill && paymentsForBill.length > 0) {
      paymentsForBill.forEach((p) => {
        const amt = toNum(p.amount);
        if (p.paymentMethod === 'cash') {
          cashBalance -= amt;
          cashOutflows += amt;
        } else {
          const targetBankId = p.bankAccountId || bill.bankAccountId || Object.keys(bankMap)[0];
          if (targetBankId && bankMap[targetBankId]) {
            bankMap[targetBankId].currentBalance -= amt;
            bankMap[targetBankId].outflows -= amt;
          }
        }
      });
    } else {
      const pay = bill.payment || bill.paymentBreakdown || {};
      const cashPaid = toNum(pay.cash || (bill.paymentMethod === 'cash' ? bill.amountPaid : 0));
      const upiPaid = toNum(pay.upi || (bill.paymentMethod === 'upi' ? bill.amountPaid : 0));
      const accPaid = toNum(pay.account || (bill.paymentMethod === 'account' ? bill.amountPaid : 0));

      if (cashPaid > 0) {
        cashBalance -= cashPaid;
        cashOutflows += cashPaid;
      }

      const targetBankId = bill.bankAccountId || Object.keys(bankMap)[0];
      const bankOutflow = upiPaid + accPaid;
      if (bankOutflow > 0 && targetBankId && bankMap[targetBankId]) {
        bankMap[targetBankId].currentBalance -= bankOutflow;
        bankMap[targetBankId].outflows -= bankOutflow;
      }
    }
  });

  // 4. Operating Expenses
  expenses.forEach((exp) => {
    const amt = toNum(exp.amount);
    const source = exp.paymentSource || 'cash';
    if (source === 'cash') {
      cashBalance -= amt;
      cashOutflows += amt;
    } else if (bankMap[source]) {
      bankMap[source].currentBalance -= amt;
      bankMap[source].outflows -= amt;
    } else {
      cashBalance -= amt;
      cashOutflows += amt;
    }
  });

  // 5. Account Transfers (Manual Inflows / Outflows / Internal transfers)
  accountTransactions.forEach((tx) => {
    const amt = toNum(tx.amount);
    const from = tx.fromAccount; // 'cash' or bankId
    const to = tx.toAccount;     // 'cash' or bankId

    // Debit 'from'
    if (from === 'cash') {
      cashBalance -= amt;
      cashOutflows += amt;
    } else if (bankMap[from]) {
      bankMap[from].currentBalance -= amt;
      bankMap[from].outflows -= amt;
    }

    // Credit 'to'
    if (to === 'cash') {
      cashBalance += amt;
      cashInflows += amt;
    } else if (bankMap[to]) {
      bankMap[to].currentBalance += amt;
      bankMap[to].inflows += amt;
    }
  });

  // 6. Returns (Direct Cash / Bank Refunds)
  (salesReturns || []).forEach((r) => {
    if (r.settlementType === 'refund' || r.refundMethod) {
      const amt = toNum(r.returnAmount || r.amount);
      if (amt <= 0) return;
      if (r.refundMethod === 'cash') {
        cashBalance -= amt;
        cashOutflows += amt;
      } else {
        const targetBankId = r.bankAccountId || Object.keys(bankMap)[0];
        if (targetBankId && bankMap[targetBankId]) {
          bankMap[targetBankId].currentBalance -= amt;
          bankMap[targetBankId].outflows -= amt;
        }
      }
    }
  });

  (purchaseReturns || []).forEach((r) => {
    if (r.settlementType === 'refund' || r.refundMethod) {
      const amt = toNum(r.returnAmount || r.amount);
      if (amt <= 0) return;
      if (r.refundMethod === 'cash') {
        cashBalance += amt;
        cashInflows += amt;
      } else {
        const targetBankId = r.bankAccountId || Object.keys(bankMap)[0];
        if (targetBankId && bankMap[targetBankId]) {
          bankMap[targetBankId].currentBalance += amt;
          bankMap[targetBankId].inflows += amt;
        }
      }
    }
  });

  const computedBanks = Object.values(bankMap);
  const totalBankBalance = computedBanks.reduce((sum, b) => sum + b.currentBalance, 0);
  const totalAvailableFunds = totalBankBalance + cashBalance;

  return {
    bankAccounts: computedBanks,
    cashAccount: {
      id: 'cash',
      name: 'Cash in Hand',
      openingBalance: toNum(cashOpening),
      currentBalance: cashBalance,
      inflows: cashInflows,
      outflows: cashOutflows,
    },
    totalBankBalance,
    cashBalance,
    totalAvailableFunds,
  };
}

/**
 * Loads all related financial collections from db (using memory cache when available)
 * and computes live account balances.
 */
export async function loadLiveAccountBalances() {
  const [banks, cash, sales, purchases, exps, fin, txs, sPayments, pPayments, sReturns, pReturns] =
    await Promise.all([
      db.getAllBankAccounts().catch(() => []),
      db.getCashSettings().catch(() => ({ openingBalance: 0 })),
      db.getAllInvoices().catch(() => []),
      db.getAllPurchaseBills().catch(() => []),
      db.getAllExpenses().catch(() => []),
      db.getAllFinanceRecords().catch(() => []),
      db.getAllAccountTransactions().catch(() => []),
      db.getAllPayments().catch(() => []),
      db.getAllPurchasePayments().catch(() => []),
      db.getAllReturns().catch(() => []),
      db.getAllPurchaseReturns().catch(() => []),
    ]);

  return computeAccountBalances({
    bankAccounts: banks || [],
    cashOpening: cash?.openingBalance || 0,
    salesInvoices: sales || [],
    purchaseBills: purchases || [],
    expenses: exps || [],
    financeRecords: fin || [],
    accountTransactions: txs || [],
    salesPayments: sPayments || [],
    purchasePayments: pPayments || [],
    salesReturns: sReturns || [],
    purchaseReturns: pReturns || [],
  });
}

/**
 * Extracts and itemizes every single inflow and outflow transaction for a specific account.
 */
export function getAccountActivity({
  account,
  salesInvoices = [],
  purchaseBills = [],
  expenses = [],
  financeRecords = [],
  accountTransactions = [],
  bankAccounts = [],
  salesPayments = [],
  purchasePayments = [],
  salesReturns = [],
  purchaseReturns = [],
}) {
  if (!account) return { items: [], openingBalance: 0, totalInflows: 0, totalOutflows: 0, computedCurrentBalance: 0, breakdown: {} };

  const isCash = account.id === 'cash';
  const accountId = account.id;
  const items = [];

  const bankNameMap = {};
  bankAccounts.forEach((b) => {
    bankNameMap[b.id] = b.accountName || b.bankName || 'Bank';
  });
  bankNameMap['cash'] = 'Cash in Hand';

  // 1. Sales Invoices & Payments
  const sPaymentsByInv = new Map();
  (salesPayments || []).forEach((p) => {
    if (!p.invoiceNo) return;
    const invNo = String(p.invoiceNo);
    if (!sPaymentsByInv.has(invNo)) sPaymentsByInv.set(invNo, []);
    sPaymentsByInv.get(invNo).push(p);
  });

  salesInvoices.forEach((inv) => {
    const invDate = inv.invoiceDate || inv.date || inv.createdAt;
    const invNo = inv.invoiceNo || inv.billNo || 'Inv';
    const customer = inv.customerName || inv.partyName || 'Customer';
    const paymentsForInv = sPaymentsByInv.get(String(invNo));

    if (paymentsForInv && paymentsForInv.length > 0) {
      paymentsForInv.forEach((p) => {
        const amt = toNum(p.amount);
        const pDate = p.paymentDate || invDate;
        if (isCash && p.paymentMethod === 'cash') {
          if (amt > 0) {
            items.push({
              id: `sale-pay-${p.id || invNo}-${p.paymentMethod}`,
              date: pDate,
              type: p.paymentType === 'additional' ? 'Payment Received (Cash)' : 'Sale (Cash)',
              direction: 'in',
              category: 'Sales',
              amount: amt,
              title: `Sales Invoice #${invNo}`,
              subtitle: `Customer: ${customer} • ${p.paymentType === 'additional' ? 'Additional Payment' : 'Initial Payment'}`,
              sourceRef: p,
            });
          }
        } else if (!isCash) {
          const targetBankId = p.bankAccountId || inv.bankAccountId || bankAccounts[0]?.id;
          if (targetBankId === accountId && p.paymentMethod !== 'cash') {
            if (amt > 0) {
              items.push({
                id: `sale-pay-${p.id || invNo}-${p.paymentMethod}`,
                date: pDate,
                type: p.paymentMethod === 'upi' ? 'Sale (UPI)' : 'Sale (Bank Transfer)',
                direction: 'in',
                category: 'Sales',
                amount: amt,
                title: `Sales Invoice #${invNo}`,
                subtitle: `Customer: ${customer} • ${p.paymentMethod.toUpperCase()}`,
                sourceRef: p,
              });
            }
          }
        }
      });
    } else {
      // Fallback: Invoice level breakdown
      if (isCash) {
        const cashAmt = toNum(inv.paymentBreakdown?.cash || (inv.paymentMethod === 'cash' ? inv.amountPaid : 0));
        if (cashAmt > 0) {
          items.push({
            id: `sale-${inv.id || invNo}-cash`,
            date: invDate,
            type: 'Sale (Cash)',
            direction: 'in',
            category: 'Sales',
            amount: cashAmt,
            title: `Sales Invoice #${invNo}`,
            subtitle: `Customer: ${customer}`,
            sourceRef: inv,
          });
        }
      } else {
        const targetBankId = inv.bankAccountId || bankAccounts[0]?.id;
        if (targetBankId === accountId) {
          const upiPaid = toNum(inv.paymentBreakdown?.upi || (inv.paymentMethod === 'upi' ? inv.amountPaid : 0));
          const accPaid = toNum(inv.paymentBreakdown?.account || (inv.paymentMethod === 'account' ? inv.amountPaid : 0));
          const totalBank = upiPaid + accPaid;
          if (totalBank > 0) {
            items.push({
              id: `sale-${inv.id || invNo}-bank`,
              date: invDate,
              type: upiPaid > 0 && accPaid > 0 ? 'Sale (UPI & Bank)' : upiPaid > 0 ? 'Sale (UPI)' : 'Sale (Bank Transfer)',
              direction: 'in',
              category: 'Sales',
              amount: totalBank,
              title: `Sales Invoice #${invNo}`,
              subtitle: `Customer: ${customer}`,
              sourceRef: inv,
            });
          }
        }
      }
    }
  });

  // 2. Purchase Bills & Payments
  const pPaymentsByInv = new Map();
  (purchasePayments || []).forEach((p) => {
    if (!p.invoiceNo) return;
    const invNo = String(p.invoiceNo);
    if (!pPaymentsByInv.has(invNo)) pPaymentsByInv.set(invNo, []);
    pPaymentsByInv.get(invNo).push(p);
  });

  purchaseBills.forEach((bill) => {
    const billDate = bill.billDate || bill.date || bill.createdAt;
    const billNo = bill.billNumber || bill.invoiceNo || 'Bill';
    const supplier = bill.supplierName || bill.partyName || 'Supplier';
    const paymentsForBill = pPaymentsByInv.get(String(billNo));

    if (paymentsForBill && paymentsForBill.length > 0) {
      paymentsForBill.forEach((p) => {
        const amt = toNum(p.amount);
        const pDate = p.paymentDate || billDate;
        if (isCash && p.paymentMethod === 'cash') {
          if (amt > 0) {
            items.push({
              id: `purchase-pay-${p.id || billNo}-${p.paymentMethod}`,
              date: pDate,
              type: p.paymentType === 'additional' ? 'Supplier Payment (Cash)' : 'Purchase (Cash)',
              direction: 'out',
              category: 'Purchase',
              amount: amt,
              title: `Purchase Bill #${billNo}`,
              subtitle: `Supplier: ${supplier} • ${p.paymentType === 'additional' ? 'Additional Payment' : 'Initial Payment'}`,
              sourceRef: p,
            });
          }
        } else if (!isCash) {
          const targetBankId = p.bankAccountId || bill.bankAccountId || bankAccounts[0]?.id;
          if (targetBankId === accountId && p.paymentMethod !== 'cash') {
            if (amt > 0) {
              items.push({
                id: `purchase-pay-${p.id || billNo}-${p.paymentMethod}`,
                date: pDate,
                type: p.paymentMethod === 'upi' ? 'Purchase (UPI)' : 'Purchase (Bank Transfer)',
                direction: 'out',
                category: 'Purchase',
                amount: amt,
                title: `Purchase Bill #${billNo}`,
                subtitle: `Supplier: ${supplier} • ${p.paymentMethod.toUpperCase()}`,
                sourceRef: p,
              });
            }
          }
        }
      });
    } else {
      // Fallback: Bill level payment
      const pay = bill.payment || bill.paymentBreakdown || {};
      if (isCash) {
        const cashAmt = toNum(pay.cash || (bill.paymentMethod === 'cash' ? bill.amountPaid : 0));
        if (cashAmt > 0) {
          items.push({
            id: `purchase-${bill.id || billNo}-cash`,
            date: billDate,
            type: 'Purchase (Cash)',
            direction: 'out',
            category: 'Purchase',
            amount: cashAmt,
            title: `Purchase Bill #${billNo}`,
            subtitle: `Supplier: ${supplier}`,
            sourceRef: bill,
          });
        }
      } else {
        const targetBankId = bill.bankAccountId || bankAccounts[0]?.id;
        if (targetBankId === accountId) {
          const upiPaid = toNum(pay.upi || (bill.paymentMethod === 'upi' ? bill.amountPaid : 0));
          const accPaid = toNum(pay.account || (bill.paymentMethod === 'account' ? bill.amountPaid : 0));
          const totalBank = upiPaid + accPaid;
          if (totalBank > 0) {
            items.push({
              id: `purchase-${bill.id || billNo}-bank`,
              date: billDate,
              type: upiPaid > 0 && accPaid > 0 ? 'Purchase (UPI & Bank)' : upiPaid > 0 ? 'Purchase (UPI)' : 'Purchase (Bank Transfer)',
              direction: 'out',
              category: 'Purchase',
              amount: totalBank,
              title: `Purchase Bill #${billNo}`,
              subtitle: `Supplier: ${supplier}`,
              sourceRef: bill,
            });
          }
        }
      }
    }
  });

  // 3. Operating Expenses
  expenses.forEach((exp) => {
    const amt = toNum(exp.amount);
    const expDate = exp.date || exp.createdAt;
    const source = exp.paymentSource || 'cash';

    if ((isCash && source === 'cash') || (!isCash && source === accountId)) {
      items.push({
        id: `exp-${exp.id}`,
        date: expDate,
        type: 'Business Expense',
        direction: 'out',
        category: 'Expense',
        amount: amt,
        title: `Expense: ${exp.reason || exp.category || exp.title || 'General Expense'}`,
        subtitle: exp.description || exp.notes || 'Operating expense',
        sourceRef: exp,
      });
    }
  });

  // 4. Finance Loan Borrowings (Received into this account)
  financeRecords.forEach((rec) => {
    const principal = toNum(rec.principal);
    const dest = rec.depositAccount || 'cash';
    const lender = rec.lenderName || 'Lender';

    if ((isCash && dest === 'cash') || (!isCash && dest === accountId)) {
      items.push({
        id: `fin-loan-${rec.id}`,
        date: rec.startDate,
        type: 'Loan Received',
        direction: 'in',
        category: 'Finance',
        amount: principal,
        title: `Loan Inflow: ${lender}`,
        subtitle: `Interest rate: ${rec.rate}% / mo`,
        sourceRef: rec,
      });
    }

    // 5. Finance Loan Repayments (Paid out of this account)
    (rec.payments || []).forEach((p, idx) => {
      const pAmt = toNum(p.amount);
      const source = p.sourceAccount || (p.mode === 'Cash' ? 'cash' : bankAccounts[0]?.id || 'cash');

      if ((isCash && source === 'cash') || (!isCash && source === accountId)) {
        items.push({
          id: `fin-pay-${rec.id}-${idx}`,
          date: p.date,
          type: 'Loan Repayment',
          direction: 'out',
          category: 'Finance',
          amount: pAmt,
          title: `Loan Repayment: ${lender}`,
          subtitle: p.notes || `Mode: ${p.mode || 'Payment'}`,
          sourceRef: p,
        });
      }
    });
  });

  // 6. Fund Transfers
  accountTransactions.forEach((tx) => {
    const amt = toNum(tx.amount);
    const from = tx.fromAccount;
    const to = tx.toAccount;
    const txDate = tx.date || tx.createdAt;

    // Outflow from this account
    if (from === accountId) {
      const destName = bankNameMap[to] || (to === 'cash' ? 'Cash in Hand' : 'Bank Account');
      items.push({
        id: `tx-out-${tx.id}`,
        date: txDate,
        type: tx.type || 'Internal Transfer Out',
        direction: 'out',
        category: 'Transfer',
        amount: amt,
        title: `Transferred to ${destName}`,
        subtitle: tx.notes || 'Internal fund transfer',
        sourceRef: tx,
      });
    }

    // Inflow to this account
    if (to === accountId) {
      const srcName = bankNameMap[from] || (from === 'cash' ? 'Cash in Hand' : 'Bank Account');
      items.push({
        id: `tx-in-${tx.id}`,
        date: txDate,
        type: tx.type || 'Internal Transfer In',
        direction: 'in',
        category: 'Transfer',
        amount: amt,
        title: `Received from ${srcName}`,
        subtitle: tx.notes || 'Internal fund transfer',
        sourceRef: tx,
      });
    }
  });

  // 7. Returns (Direct Cash / Bank Refunds)
  (salesReturns || []).forEach((r) => {
    if (r.settlementType === 'refund' || r.refundMethod) {
      const amt = toNum(r.returnAmount || r.amount);
      if (amt <= 0) return;
      const rDate = r.returnDate || r.date || r.createdAt;
      if (isCash && r.refundMethod === 'cash') {
        items.push({
          id: `sale-ret-${r.id || r.invoiceNo}`,
          date: rDate,
          type: 'Sales Return (Cash Refund)',
          direction: 'out',
          category: 'Returns',
          amount: amt,
          title: `Sales Return Refund #${r.invoiceNo}`,
          subtitle: `Customer: ${r.customerName || 'Customer'} • ${r.description || 'Goods returned'}`,
          sourceRef: r,
        });
      } else if (!isCash) {
        const targetBankId = r.bankAccountId || bankAccounts[0]?.id;
        if (targetBankId === accountId && r.refundMethod !== 'cash') {
          items.push({
            id: `sale-ret-${r.id || r.invoiceNo}`,
            date: rDate,
            type: 'Sales Return (Bank Refund)',
            direction: 'out',
            category: 'Returns',
            amount: amt,
            title: `Sales Return Refund #${r.invoiceNo}`,
            subtitle: `Customer: ${r.customerName || 'Customer'} • ${r.description || 'Goods returned'}`,
            sourceRef: r,
          });
        }
      }
    }
  });

  (purchaseReturns || []).forEach((r) => {
    if (r.settlementType === 'refund' || r.refundMethod) {
      const amt = toNum(r.returnAmount || r.amount);
      if (amt <= 0) return;
      const rDate = r.returnDate || r.date || r.createdAt;
      if (isCash && r.refundMethod === 'cash') {
        items.push({
          id: `purch-ret-${r.id || r.invoiceNo}`,
          date: rDate,
          type: 'Purchase Return (Cash Refund)',
          direction: 'in',
          category: 'Returns',
          amount: amt,
          title: `Purchase Return Refund #${r.invoiceNo}`,
          subtitle: `Supplier: ${r.supplierName || 'Supplier'} • ${r.description || 'Goods returned'}`,
          sourceRef: r,
        });
      } else if (!isCash) {
        const targetBankId = r.bankAccountId || bankAccounts[0]?.id;
        if (targetBankId === accountId && r.refundMethod !== 'cash') {
          items.push({
            id: `purch-ret-${r.id || r.invoiceNo}`,
            date: rDate,
            type: 'Purchase Return (Bank Refund)',
            direction: 'in',
            category: 'Returns',
            amount: amt,
            title: `Purchase Return Refund #${r.invoiceNo}`,
            subtitle: `Supplier: ${r.supplierName || 'Supplier'} • ${r.description || 'Goods returned'}`,
            sourceRef: r,
          });
        }
      }
    }
  });

  // Sort by date descending (newest first)
  items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  // Compute breakdown stats
  const totalInflows = items
    .filter((i) => i.direction === 'in')
    .reduce((sum, i) => sum + i.amount, 0);

  const totalOutflows = items
    .filter((i) => i.direction === 'out')
    .reduce((sum, i) => sum + i.amount, 0);

  const salesInflow = items.filter((i) => i.category === 'Sales').reduce((sum, i) => sum + i.amount, 0);
  const loanInflow = items.filter((i) => i.type === 'Loan Received').reduce((sum, i) => sum + i.amount, 0);
  const transferInflow = items.filter((i) => i.direction === 'in' && i.category === 'Transfer').reduce((sum, i) => sum + i.amount, 0);

  const purchaseOutflow = items.filter((i) => i.category === 'Purchase').reduce((sum, i) => sum + i.amount, 0);
  const expenseOutflow = items.filter((i) => i.category === 'Expense').reduce((sum, i) => sum + i.amount, 0);
  const loanRepayOutflow = items.filter((i) => i.type === 'Loan Repayment').reduce((sum, i) => sum + i.amount, 0);
  const transferOutflow = items.filter((i) => i.direction === 'out' && i.category === 'Transfer').reduce((sum, i) => sum + i.amount, 0);

  const openingBalance = toNum(account.openingBalance);
  const computedCurrentBalance = openingBalance + totalInflows - totalOutflows;

  return {
    items,
    openingBalance,
    totalInflows,
    totalOutflows,
    computedCurrentBalance,
    breakdown: {
      salesInflow,
      loanInflow,
      transferInflow,
      purchaseOutflow,
      expenseOutflow,
      loanRepayOutflow,
      transferOutflow,
    },
  };
}
