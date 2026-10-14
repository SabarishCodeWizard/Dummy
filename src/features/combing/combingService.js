import { db } from '@/core/db';
import { getStockQuantityMap, invalidateStocksCache } from '@/features/overview/stocks/stocksService';
import { calcCombingBatchTotals, validateCombingBatch, validateProcessor } from './combingLogic';

/**
 * Loads all data needed for the Combing & Processing section:
 * - Batches
 * - Product Shortcuts (catalogue)
 * - Live Stock Map (for checking available dyed fabric and rates)
 * - Processors Directory
 */
export async function loadCombingData() {
  const [batches, shortcuts, stockMap, processors, dyeingBatches, purchaseBills] = await Promise.all([
    db.getAllCombingBatches ? db.getAllCombingBatches() : Promise.resolve([]),
    db.getAllShortcuts ? db.getAllShortcuts() : Promise.resolve([]),
    getStockQuantityMap(true),
    db.getAllProcessors ? db.getAllProcessors() : Promise.resolve([]),
    db.getAllDyeingBatches ? db.getAllDyeingBatches() : Promise.resolve([]),
    db.getAllPurchaseBills ? db.getAllPurchaseBills() : Promise.resolve([]),
  ]);

  return {
    batches: batches || [],
    shortcuts: shortcuts || [],
    stockMap: stockMap || new Map(),
    processors: processors || [],
    dyeingBatches: dyeingBatches || [],
    purchaseBills: purchaseBills || [],
  };
}

/**
 * Saves a combing batch record.
 */
export async function saveCombingBatchRecord(form) {
  const validationError = validateCombingBatch(form);
  if (validationError) {
    throw new Error(`${validationError.title}: ${validationError.message}`);
  }

  const totals = calcCombingBatchTotals(form);

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
      avgRate: totals.fabricRate,
      totalCost: totals.totalFabricCost,
      processingRate: totals.processingRate,
      totalProcessingCost: totals.totalProcessingCost,
      weightLossPct: totals.weightLossPct,
      weightLossQty: totals.weightLossQty,
      expectedOutputQty: totals.expectedOutputQty,
    },
    processingRate: totals.processingRate,
    totalProcessingCost: totals.totalProcessingCost,
    weightLossPct: totals.weightLossPct,
    weightLossQty: totals.weightLossQty,
    expectedOutputQty: totals.expectedOutputQty,
    costPerUnitBeforeLoss: totals.costPerUnitBeforeLoss,
    adjustedUnitCost: totals.adjustedUnitCost,
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

  await db.saveCombingBatch(batchDoc);
  invalidateStocksCache();
  if (db.invalidate) db.invalidate('combing_batches');
  return batchDoc;
}

/**
 * Deletes a combing batch and frees allocated stock.
 */
export async function deleteCombingBatchRecord(batchId) {
  await db.deleteCombingBatch(batchId);
  invalidateStocksCache();
  if (db.invalidate) db.invalidate('combing_batches');
}

/**
 * Saves or updates a Processor directory entry.
 */
export async function saveProcessorRecord(processor) {
  const error = validateProcessor(processor);
  if (error) {
    throw new Error(`${error.title}: ${error.message}`);
  }
  const clean = {
    id: processor.id || (processor.phone ? `proc_${processor.phone.trim()}` : undefined),
    processorName: (processor.processorName || processor.name || '').trim(),
    ownerName: processor.ownerName.trim(),
    phone: processor.phone.trim(),
    address: (processor.address || '').trim(),
  };
  const id = await db.saveProcessor(clean);
  db.invalidate('processors');
  return { ...clean, id };
}

/**
 * Deletes a Processor record from the directory.
 */
export async function deleteProcessorRecord(id) {
  await db.deleteProcessor(id);
  db.invalidate('processors');
}

/**
 * Fetches all saved Processors from the database.
 */
export async function getAllProcessorsList() {
  if (!db.getAllProcessors) return [];
  return (await db.getAllProcessors()) || [];
}
