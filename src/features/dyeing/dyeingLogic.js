/**
 * Dyeing & Processing Batch Logic (Workflow 2: Manufacturing & Processing)
 *
 * Pure business logic for:
 * - Raw grey roll consumption
 * - Additional processing expenses (dyeing charges, chemicals, labor, transport)
 * - Finished colored roll conversion
 * - Shrinkage & loss tracking (Rolls / Kgs / Meters)
 * - True unit cost allocation
 */
import { digitsOnly, toNum, todayISO } from '@/core/format';

export const DYEING_STATUS = {
  IN_PROCESS: 'IN_PROCESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
};

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Dyeing Charges',
  'Coloring Materials & Chemicals',
  'Labor & Handling',
  'Transport & Freight',
  'Other Processing Expenses',
];

export const UNITS = ['Rolls', 'Kgs', 'Meters'];

export function emptyDyeingBatch(today = todayISO()) {
  return {
    batchId: '',
    batchDate: today,
    status: DYEING_STATUS.IN_PROCESS,
    processorName: '',
    processorOwner: '',
    processorPhone: '',
    processorAddress: '',
    input: {
      description: '',
      unit: 'Rolls',
      qty: '',
      avgGreyRate: '',
      totalGreyCost: 0,
    },
    expenses: [
      { category: 'Dyeing Charges', amount: '', paidVia: 'cash', bankAccountId: null },
      { category: 'Coloring Materials & Chemicals', amount: '', paidVia: 'cash', bankAccountId: null },
      { category: 'Labor & Handling', amount: '', paidVia: 'cash', bankAccountId: null },
      { category: 'Transport & Freight', amount: '', paidVia: 'cash', bankAccountId: null },
    ],
    output: [
      {
        description: '',
        unit: 'Rolls',
        qty: '',
        allocatedCost: 0,
        unitCost: 0,
      },
    ],
    notes: '',
  };
}

const round2 = (n) => Math.round(n * 100) / 100;
const round3 = (n) => Math.round(n * 1000) / 1000;

/**
 * Calculates complete financial and quantity totals for a dyeing batch:
 * - Total grey cost = input.qty * input.avgGreyRate
 * - Total expenses = sum of itemized expenses
 * - Total batch cost = total grey cost + total expenses
 * - Shrinkage/loss = input.qty - sum(output.qty)
 * - Finished unit cost = total batch cost / sum(output.qty)
 */
export function calcBatchTotals(form) {
  const inputQty = toNum(form.input?.qty);
  const greyRate = toNum(form.input?.avgGreyRate);
  const totalGreyCost = round2(inputQty * greyRate);

  const expenses = Array.isArray(form.expenses) ? form.expenses : [];
  const totalExpenses = round2(
    expenses.reduce((sum, e) => sum + toNum(e.amount), 0),
  );

  const totalBatchCost = round2(totalGreyCost + totalExpenses);

  const outputs = Array.isArray(form.output) ? form.output : [];
  const totalOutputQty = round3(
    outputs.reduce((sum, o) => sum + toNum(o.qty), 0),
  );

  const shrinkageQty = round3(Math.max(0, inputQty - totalOutputQty));
  const shrinkagePct = inputQty > 0 ? round2((shrinkageQty / inputQty) * 100) : 0;

  // Allocate cost to output lines proportionally by quantity
  const enrichedOutput = outputs.map((out) => {
    const qty = toNum(out.qty);
    if (totalOutputQty <= 0 || qty <= 0) {
      return {
        ...out,
        qty: out.qty,
        allocatedCost: 0,
        unitCost: 0,
      };
    }
    const ratio = qty / totalOutputQty;
    const allocatedCost = round2(totalBatchCost * ratio);
    const unitCost = round2(allocatedCost / qty);
    return {
      ...out,
      qty: out.qty,
      allocatedCost,
      unitCost,
    };
  });

  const avgFinishedUnitCost =
    totalOutputQty > 0 ? round2(totalBatchCost / totalOutputQty) : 0;

  return {
    inputQty,
    greyRate,
    totalGreyCost,
    totalExpenses,
    totalBatchCost,
    totalOutputQty,
    shrinkageQty,
    shrinkagePct,
    avgFinishedUnitCost,
    enrichedOutput,
  };
}

/**
 * Validates a dyeing batch form.
 * Returns null if valid, or an object { title, message } if invalid.
 */
export function validateDyeingBatch(form) {
  if (!form.batchId?.trim()) {
    return { title: 'Missing Information', message: 'Please enter a Batch Number.' };
  }
  if (!form.batchDate) {
    return { title: 'Missing Information', message: 'Please select a Batch Date.' };
  }
  if (!form.processorName?.trim()) {
    return { title: 'Missing Information', message: 'Please enter the Processor / Dye House Name.' };
  }
  if (!form.input?.description?.trim()) {
    return { title: 'Missing Input Material', message: 'Please select the raw grey roll to process.' };
  }
  if (toNum(form.input?.qty) <= 0) {
    return { title: 'Invalid Quantity', message: 'Please enter a valid raw grey quantity greater than 0.' };
  }

  if (form.status === DYEING_STATUS.COMPLETED) {
    const validOutputs = (form.output || []).filter(
      (o) => o.description?.trim() && toNum(o.qty) > 0,
    );
    if (validOutputs.length === 0) {
      return {
        title: 'Missing Finished Goods',
        message: 'To mark the batch as Completed, please specify at least one finished colored roll with quantity.',
      };
    }
  }

  return null;
}

/**
 * Filter batches by search term (batchId, processor, grey item, or output colors) and status.
 */
export function filterBatches(batches = [], query = '', statusFilter = 'ALL') {
  const q = query.trim().toLowerCase();
  return batches.filter((b) => {
    if (statusFilter !== 'ALL' && b.status !== statusFilter) {
      return false;
    }
    if (!q) return true;

    const matchId = (b.batchId || '').toLowerCase().includes(q);
    const matchProcessor = (b.processorName || '').toLowerCase().includes(q);
    const matchInput = (b.input?.description || '').toLowerCase().includes(q);
    const matchOutput = (b.output || []).some((o) =>
      (o.description || '').toLowerCase().includes(q),
    );
    return matchId || matchProcessor || matchInput || matchOutput;
  });
}

/**
 * Suggests the next sequential batch ID, e.g. "B-001", "B-002".
 */
export function suggestNextBatchId(existingBatches = []) {
  if (!existingBatches || existingBatches.length === 0) {
    return 'B-001';
  }
  let maxNum = 0;
  existingBatches.forEach((b) => {
    const id = String(b.batchId || '').trim();
    const match = id.match(/(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxNum) maxNum = n;
    }
  });
  const next = maxNum + 1;
  return `B-${String(next).padStart(3, '0')}`;
}

/**
 * Creates a blank Dyer / Dyeing unit record.
 */
export function emptyDyer() {
  return {
    dyeingName: '',
    ownerName: '',
    phone: '',
    address: '',
  };
}

/**
 * Validates a Dyer record (Dyeing Name, Owner Name, Phone >= 10 digits).
 */
export function validateDyer(dyer = {}) {
  const dyeingName = (dyer.dyeingName || '').trim();
  const ownerName = (dyer.ownerName || '').trim();
  const phone = (dyer.phone || '').trim();

  if (!dyeingName) {
    return { title: 'Missing Information', message: 'Please enter the Dyeing / Factory Name.' };
  }
  if (!ownerName) {
    return { title: 'Missing Information', message: 'Please enter the Dyeing Owner / Contact Person Name.' };
  }
  if (!phone || digitsOnly(phone).length < 10) {
    return { title: 'Invalid Phone Number', message: 'Please enter a valid 10-digit mobile number.' };
  }
  return null;
}

/**
 * Search/filter Dyers by dyeing name, owner name, phone, or address.
 */
export function filterDyers(dyers = [], query = '') {
  const q = (query || '').trim().toLowerCase();
  if (!q) return dyers;
  const qDigits = digitsOnly(q);
  return dyers.filter((d) => {
    const matchName = (d.dyeingName || '').toLowerCase().includes(q);
    const matchOwner = (d.ownerName || '').toLowerCase().includes(q);
    const matchAddress = (d.address || '').toLowerCase().includes(q);
    const matchPhone =
      (d.phone || '').toLowerCase().includes(q) ||
      (qDigits && digitsOnly(d.phone || '').includes(qDigits));
    return matchName || matchOwner || matchAddress || matchPhone;
  });
}

/**
 * Finds a matching dyer by query (exact phone or dyeing name).
 */
export function findDyerByQuery(dyers = [], query = '') {
  const q = (query || '').trim().toLowerCase();
  if (!q || !Array.isArray(dyers)) return null;
  const qDigits = digitsOnly(q);

  // Exact phone match first
  if (qDigits && qDigits.length >= 10) {
    const byPhone = dyers.find((d) => digitsOnly(d.phone || '') === qDigits);
    if (byPhone) return byPhone;
  }

  // Exact name match
  const byExactName = dyers.find((d) => (d.dyeingName || '').trim().toLowerCase() === q);
  if (byExactName) return byExactName;

  // Substring match if unique
  const matches = filterDyers(dyers, q);
  if (matches.length === 1) return matches[0];

  return null;
}
