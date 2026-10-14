import { describe, expect, it } from 'vitest';
import {
  calcBatchTotals,
  emptyDyeingBatch,
  emptyDyer,
  filterBatches,
  filterDyers,
  findDyerByQuery,
  suggestNextBatchId,
  validateDyeingBatch,
  validateDyer,
  DYEING_STATUS,
} from '@/features/dyeing/dyeingLogic';

describe('Dyeing & Processing Batch Logic (Workflow 2)', () => {
  it('creates an empty dyeing batch with default structure', () => {
    const batch = emptyDyeingBatch('2026-10-14');
    expect(batch.batchDate).toBe('2026-10-14');
    expect(batch.status).toBe(DYEING_STATUS.IN_PROCESS);
    expect(batch.input.unit).toBe('Rolls');
    expect(batch.expenses.length).toBeGreaterThan(0);
    expect(batch.output.length).toBe(1);
  });

  it('accurately calculates raw grey cost, additional expenses, and total batch cost', () => {
    // Example from user request:
    // Raw grey roll purchased for ₹100 each, 10 rolls = ₹1000
    // Expenses = ₹30 per roll = ₹300 total (e.g. ₹200 dyeing, ₹50 chemical, ₹30 labor, ₹20 transport)
    // 10 finished colored rolls produced
    // Total cost = ₹1,300 -> unit cost = ₹130 per roll
    const form = {
      input: { qty: '10', avgGreyRate: '100' },
      expenses: [
        { category: 'Dyeing Charges', amount: '200' },
        { category: 'Coloring Materials & Chemicals', amount: '50' },
        { category: 'Labor & Handling', amount: '30' },
        { category: 'Transport & Freight', amount: '20' },
      ],
      output: [
        { description: 'Cotton 30s Navy Blue', qty: '6' },
        { description: 'Cotton 30s Maroon', qty: '4' },
      ],
    };

    const totals = calcBatchTotals(form);
    expect(totals.inputQty).toBe(10);
    expect(totals.greyRate).toBe(100);
    expect(totals.totalGreyCost).toBe(1000);
    expect(totals.totalExpenses).toBe(300);
    expect(totals.totalBatchCost).toBe(1300);
    expect(totals.totalOutputQty).toBe(10);
    expect(totals.shrinkageQty).toBe(0);
    expect(totals.shrinkagePct).toBe(0);
    expect(totals.avgFinishedUnitCost).toBe(130);

    // Check individual output allocations
    expect(totals.enrichedOutput[0].qty).toBe('6');
    expect(totals.enrichedOutput[0].allocatedCost).toBe(780); // 6 * 130
    expect(totals.enrichedOutput[0].unitCost).toBe(130);

    expect(totals.enrichedOutput[1].qty).toBe('4');
    expect(totals.enrichedOutput[1].allocatedCost).toBe(520); // 4 * 130
    expect(totals.enrichedOutput[1].unitCost).toBe(130);
  });

  it('tracks shrinkage / weight loss when output quantity is less than input', () => {
    const form = {
      input: { qty: '100', avgGreyRate: '50' }, // 100 kgs @ ₹50 = ₹5,000
      expenses: [{ category: 'Dyeing Charges', amount: '1000' }], // Total ₹6,000
      output: [{ description: 'Dyed Fabric Lycra', qty: '95' }], // 95 kgs received (5 kgs loss)
    };

    const totals = calcBatchTotals(form);
    expect(totals.inputQty).toBe(100);
    expect(totals.totalOutputQty).toBe(95);
    expect(totals.shrinkageQty).toBe(5);
    expect(totals.shrinkagePct).toBe(5); // 5% shrinkage
    expect(totals.totalBatchCost).toBe(6000);
    // Cost per kg absorbed by surviving output: 6000 / 95 = 63.16
    expect(totals.avgFinishedUnitCost).toBe(63.16);
    expect(totals.enrichedOutput[0].unitCost).toBe(63.16);
  });

  it('validates required fields for draft and completed batches', () => {
    // Missing batchId
    expect(validateDyeingBatch({ batchId: '', batchDate: '2026-10-14' })).toEqual({
      title: 'Missing Information',
      message: 'Please enter a Batch Number.',
    });

    // Missing processor
    expect(validateDyeingBatch({ batchId: 'B-001', batchDate: '2026-10-14', processorName: '' })).toEqual({
      title: 'Missing Information',
      message: 'Please enter the Processor / Dye House Name.',
    });

    // Missing input raw material
    expect(
      validateDyeingBatch({
        batchId: 'B-001',
        batchDate: '2026-10-14',
        processorName: 'Murugan Mills',
        input: { description: '', qty: '10' },
      }),
    ).toEqual({
      title: 'Missing Input Material',
      message: 'Please select the raw grey roll to process.',
    });

    // Completed batch requires finished output
    expect(
      validateDyeingBatch({
        batchId: 'B-001',
        batchDate: '2026-10-14',
        processorName: 'Murugan Mills',
        status: DYEING_STATUS.COMPLETED,
        input: { description: 'Grey Cotton', qty: '10' },
        output: [],
      }),
    ).toEqual({
      title: 'Missing Finished Goods',
      message:
        'To mark the batch as Completed, please specify at least one finished colored roll with quantity.',
    });

    // Valid completed batch
    expect(
      validateDyeingBatch({
        batchId: 'B-001',
        batchDate: '2026-10-14',
        processorName: 'Murugan Mills',
        status: DYEING_STATUS.COMPLETED,
        input: { description: 'Grey Cotton', qty: '10' },
        output: [{ description: 'Red Cotton', qty: '10' }],
      }),
    ).toBeNull();
  });

  it('filters batches by text and status', () => {
    const sample = [
      {
        batchId: 'B-001',
        processorName: 'Murugan Mills',
        status: DYEING_STATUS.IN_PROCESS,
        input: { description: 'Cotton 30s Grey' },
        output: [{ description: 'Navy Blue' }],
      },
      {
        batchId: 'B-002',
        processorName: 'Royal Dyers',
        status: DYEING_STATUS.COMPLETED,
        input: { description: 'Lycra Grey 20s' },
        output: [{ description: 'Maroon' }],
      },
    ];

    expect(filterBatches(sample, 'murugan', 'ALL')).toHaveLength(1);
    expect(filterBatches(sample, '', DYEING_STATUS.COMPLETED)).toHaveLength(1);
    expect(filterBatches(sample, 'maroon', 'ALL')).toHaveLength(1);
    expect(filterBatches(sample, 'xyz', 'ALL')).toHaveLength(0);
  });

  it('suggests the next sequential batch ID', () => {
    expect(suggestNextBatchId([])).toBe('B-001');
    expect(suggestNextBatchId([{ batchId: 'B-001' }, { batchId: 'B-002' }])).toBe('B-003');
    expect(suggestNextBatchId([{ batchId: 'BATCH-009' }])).toBe('B-010');
  });

  describe('Dyers Directory & Autocomplete Logic', () => {
    it('creates an empty dyer record with required fields', () => {
      const dyer = emptyDyer();
      expect(dyer).toEqual({
        dyeingName: '',
        ownerName: '',
        phone: '',
        address: '',
      });
    });

    it('validates dyer inputs correctly', () => {
      expect(validateDyer({ dyeingName: '', ownerName: 'Murugan', phone: '9842100000' })).toEqual({
        title: 'Missing Information',
        message: 'Please enter the Dyeing / Factory Name.',
      });

      expect(validateDyer({ dyeingName: 'Murugan Dyeing', ownerName: '', phone: '9842100000' })).toEqual({
        title: 'Missing Information',
        message: 'Please enter the Dyeing Owner / Contact Person Name.',
      });

      expect(validateDyer({ dyeingName: 'Murugan Dyeing', ownerName: 'Murugan', phone: '123' })).toEqual({
        title: 'Invalid Phone Number',
        message: 'Please enter a valid 10-digit mobile number.',
      });

      expect(
        validateDyer({
          dyeingName: 'Sri Murugan Dyeing Works',
          ownerName: 'Murugan',
          phone: '9842100000',
          address: 'Tirupur',
        }),
      ).toBeNull();
    });

    it('filters and matches dyers by name, owner, phone or address', () => {
      const dyersList = [
        {
          dyeingName: 'Sri Murugan Dyeing Works',
          ownerName: 'Murugan',
          phone: '9842100001',
          address: 'Veerapandi, Tirupur',
        },
        {
          dyeingName: 'Royal Fabric Processors',
          ownerName: 'Rajesh',
          phone: '9842100002',
          address: 'Palladam Road',
        },
      ];

      // Match by dyeing name
      expect(filterDyers(dyersList, 'murugan')).toHaveLength(1);
      expect(filterDyers(dyersList, 'royal')).toHaveLength(1);

      // Match by owner
      expect(filterDyers(dyersList, 'rajesh')).toHaveLength(1);

      // Match by phone
      expect(filterDyers(dyersList, '0001')).toHaveLength(1);

      // Match by address
      expect(filterDyers(dyersList, 'palladam')).toHaveLength(1);

      // Find exact dyer by phone for autocomplete
      const foundByPhone = findDyerByQuery(dyersList, '9842100001');
      expect(foundByPhone?.dyeingName).toBe('Sri Murugan Dyeing Works');

      // Find exact dyer by dyeing name
      const foundByName = findDyerByQuery(dyersList, 'Sri Murugan Dyeing Works');
      expect(foundByName?.ownerName).toBe('Murugan');
    });
  });
});
