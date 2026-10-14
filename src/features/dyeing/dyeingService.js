import { db } from '@/core/db';
import { getStockQuantityMap, invalidateStocksCache } from '@/features/overview/stocks/stocksService';
import { calcBatchTotals, validateDyeingBatch, validateDyer } from './dyeingLogic';

/**
 * Loads all data needed for the Dyeing & Processing section:
 * - Batches
 * - Product Shortcuts (catalogue)
 * - Bank Accounts (for expense payments)
 * - Live Stock Map (for checking available grey roll quantities)
 * - Dyers Directory
 */
export async function loadDyeingData() {
  const [batches, shortcuts, bankAccounts, stockMap, purchaseBills, dyers] = await Promise.all([
    db.getAllDyeingBatches ? db.getAllDyeingBatches() : Promise.resolve([]),
    db.getAllShortcuts ? db.getAllShortcuts() : Promise.resolve([]),
    db.getAllBankAccounts ? db.getAllBankAccounts() : Promise.resolve([]),
    getStockQuantityMap(true),
    db.getAllPurchaseBills ? db.getAllPurchaseBills() : Promise.resolve([]),
    db.getAllDyers ? db.getAllDyers() : Promise.resolve([]),
  ]);

  return {
    batches: batches || [],
    shortcuts: shortcuts || [],
    bankAccounts: bankAccounts || [],
    stockMap: stockMap || new Map(),
    purchaseBills: purchaseBills || [],
    dyers: dyers || [],
  };
}

/**
 * Saves a dyeing batch and handles live financial tracking if expenses were paid
 * via Bank Account or Cash in Hand.
 */
export async function saveDyeingBatchRecord(form) {
  const validationError = validateDyeingBatch(form);
  if (validationError) {
    throw new Error(`${validationError.title}: ${validationError.message}`);
  }

  const totals = calcBatchTotals(form);

  const batchDoc = {
    batchId: form.batchId.trim(),
    batchDate: form.batchDate,
    status: form.status,
    processorName: form.processorName.trim(),
    processorOwner: (form.processorOwner || '').trim(),
    processorPhone: (form.processorPhone || '').trim(),
    processorAddress: (form.processorAddress || '').trim(),
    input: {
      description: form.input.description.trim(),
      unit: form.input.unit || 'Rolls',
      qty: totals.inputQty,
      avgGreyRate: totals.greyRate,
      totalGreyCost: totals.totalGreyCost,
      dyeingRate: totals.dyeingRate,
      totalDyeingCost: totals.totalDyeingCost,
      weightLossPct: totals.weightLossPct,
      weightLossQty: totals.weightLossQty,
      expectedOutputQty: totals.expectedOutputQty,
    },
    dyeingRate: totals.dyeingRate,
    totalDyeingCost: totals.totalDyeingCost,
    weightLossPct: totals.weightLossPct,
    weightLossQty: totals.weightLossQty,
    expectedOutputQty: totals.expectedOutputQty,
    costPerUnitBeforeLoss: totals.costPerUnitBeforeLoss,
    adjustedUnitCost: totals.adjustedUnitCost,
    expenses: (form.expenses || []).map((e) => ({
      category: e.category,
      amount: parseFloat(e.amount) || 0,
      paidVia: e.paidVia || 'cash',
      bankAccountId: e.bankAccountId || null,
    })),
    totalExpenses: totals.totalExpenses,
    totalBatchCost: totals.totalBatchCost,
    output: totals.enrichedOutput.map((o) => ({
      description: (o.description || '').trim(),
      unit: o.unit || form.input.unit || 'Rolls',
      qty: parseFloat(o.qty) || 0,
      allocatedCost: o.allocatedCost || 0,
      unitCost: o.unitCost || 0,
    })),
    totalOutputQty: totals.totalOutputQty,
    shrinkageQty: totals.shrinkageQty,
    shrinkagePct: totals.shrinkagePct,
    avgFinishedUnitCost: totals.avgFinishedUnitCost,
    notes: (form.notes || '').trim(),
    completedAt: form.status === 'COMPLETED' ? form.completedAt || new Date().toISOString() : null,
  };

  await db.saveDyeingBatch(batchDoc);

  // Sync paid expenses with Finance bank & cash accounts
  if (Array.isArray(batchDoc.expenses) && db.saveAccountTransaction) {
    for (const exp of batchDoc.expenses) {
      if (exp.amount > 0 && (exp.paidVia === 'bank' || exp.paidVia === 'cash')) {
        try {
          await db.saveAccountTransaction({
            id: `dye_exp_${batchDoc.batchId}_${exp.category.replace(/\s+/g, '_').toLowerCase()}`,
            date: batchDoc.batchDate,
            type: 'expense',
            category: 'Dyeing & Processing',
            amount: exp.amount,
            bankAccountId: exp.paidVia === 'bank' ? exp.bankAccountId : null,
            notes: `Batch #${batchDoc.batchId}: ${exp.category} (${batchDoc.processorName})`,
          });
        } catch (err) {
          console.warn('Failed to post account transaction for dyeing expense:', err);
        }
      }
    }
  }

  invalidateStocksCache();
  if (db.invalidate) db.invalidate('dyeing_batches');
  return batchDoc;
}

/**
 * Deletes a dyeing batch and frees allocated stock.
 */
export async function deleteDyeingBatchRecord(batchId) {
  await db.deleteDyeingBatch(batchId);
  invalidateStocksCache();
  if (db.invalidate) db.invalidate('dyeing_batches');
}

/**
 * Saves or updates a Dyer directory entry.
 */
export async function saveDyerRecord(dyer) {
  const error = validateDyer(dyer);
  if (error) {
    throw new Error(`${error.title}: ${error.message}`);
  }
  const clean = {
    id: dyer.id || (dyer.phone ? `dyer_${dyer.phone.trim()}` : undefined),
    dyeingName: dyer.dyeingName.trim(),
    ownerName: dyer.ownerName.trim(),
    phone: dyer.phone.trim(),
    address: (dyer.address || '').trim(),
  };
  const id = await db.saveDyer(clean);
  db.invalidate('dyers');
  return { ...clean, id };
}

/**
 * Deletes a Dyer record from the directory.
 */
export async function deleteDyerRecord(id) {
  await db.deleteDyer(id);
  db.invalidate('dyers');
}

/**
 * Fetches all saved Dyers from the database.
 */
export async function getAllDyersList() {
  if (!db.getAllDyers) return [];
  return (await db.getAllDyers()) || [];
}
