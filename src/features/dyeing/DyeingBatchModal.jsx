import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  ChevronRight,
  Clock,
  Layers,
  Package,
  Plus,
  Save,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { ProductDescriptionInput } from '@/components/bill';
import { formatCurrency, todayISO } from '@/core/format';
import {
  Badge,
  Button,
  Card,
  DateField,
  Modal,
  NumberField,
  SelectField,
  TextField,
  cn,
  useFeedback,
} from '@/ui';

import {
  DYEING_STATUS,
  UNITS,
  calcBatchTotals,
  emptyDyeingBatch,
  suggestNextBatchId,
  validateDyeingBatch,
} from './dyeingLogic';
import { saveDyeingBatchRecord } from './dyeingService';
import { DyerPicker } from './DyerPicker';

const rupees = (n) => `₹${formatCurrency(n)}`;

export function DyeingBatchModal({
  open,
  onClose,
  initialBatch = null,
  existingBatches = [],
  shortcuts = [],
  bankAccounts = [],
  stockMap = new Map(),
  dyers = [],
  onSaved,
}) {
  const { toast } = useFeedback();
  const [form, setForm] = useState(() => emptyDyeingBatch(todayISO()));
  const [saving, setSaving] = useState(false);

  const handleSelectDyer = (dyer) => {
    setForm((prev) => ({
      ...prev,
      processorName: dyer.dyeingName || '',
      processorOwner: dyer.ownerName || '',
      processorPhone: dyer.phone || '',
      processorAddress: dyer.address || '',
    }));
    toast('Dyeing Details Loaded', `${dyer.dyeingName} (${dyer.ownerName})`, 'success');
  };

  useEffect(() => {
    if (!open) return;
    if (initialBatch) {
      setForm({
        ...initialBatch,
        input: { ...initialBatch.input },
        expenses: Array.isArray(initialBatch.expenses) ? initialBatch.expenses.map((e) => ({ ...e })) : [],
        output: Array.isArray(initialBatch.output) ? initialBatch.output.map((o) => ({ ...o })) : [],
      });
    } else {
      const nextId = suggestNextBatchId(existingBatches);
      const fresh = emptyDyeingBatch(todayISO());
      fresh.batchId = nextId;
      setForm(fresh);
    }
  }, [open, initialBatch, existingBatches]);

  const totals = calcBatchTotals(form);

  const updateField = (key, val) => {
    setForm((prev) => ({ ...prev, [key]: val }));
  };

  const updateInput = (key, val) => {
    setForm((prev) => ({
      ...prev,
      input: { ...prev.input, [key]: val },
    }));
  };

  const handleInputDescriptionChange = (desc) => {
    const stockInfo = stockMap.get(desc.trim()) || stockMap.get(desc.trim().toLowerCase());
    setForm((prev) => {
      const currentRate = prev.input.avgGreyRate;
      let newRate = currentRate;
      if ((!currentRate || currentRate === '0') && stockInfo?.avgPurchaseRate) {
        newRate = String(stockInfo.avgPurchaseRate);
      }
      return {
        ...prev,
        input: {
          ...prev.input,
          description: desc,
          avgGreyRate: newRate,
        },
      };
    });
  };

  const updateExpense = (index, key, val) => {
    setForm((prev) => {
      const copy = [...prev.expenses];
      copy[index] = { ...copy[index], [key]: val };
      return { ...prev, expenses: copy };
    });
  };

  const addExpenseRow = () => {
    setForm((prev) => ({
      ...prev,
      expenses: [
        ...prev.expenses,
        { category: 'Other Processing Expenses', amount: '', paidVia: 'cash', bankAccountId: null },
      ],
    }));
  };

  const removeExpenseRow = (index) => {
    setForm((prev) => ({
      ...prev,
      expenses: prev.expenses.filter((_, i) => i !== index),
    }));
  };

  const updateOutput = (index, key, val) => {
    setForm((prev) => {
      const copy = [...prev.output];
      copy[index] = { ...copy[index], [key]: val };
      return { ...prev, output: copy };
    });
  };

  const addOutputRow = () => {
    setForm((prev) => ({
      ...prev,
      output: [
        ...prev.output,
        { description: '', unit: prev.input.unit || 'Rolls', qty: '', allocatedCost: 0, unitCost: 0 },
      ],
    }));
  };

  const removeOutputRow = (index) => {
    setForm((prev) => ({
      ...prev,
      output: prev.output.filter((_, i) => i !== index),
    }));
  };

  const handleSave = async () => {
    const submission = {
      ...form,
      status: form.status || DYEING_STATUS.IN_PROCESS,
    };

    const err = validateDyeingBatch(submission);
    if (err) {
      toast(err.title, err.message, 'warning');
      return;
    }

    setSaving(true);
    try {
      await saveDyeingBatchRecord(submission);
      toast('Batch Saved', `Batch #${submission.batchId} saved successfully.`, 'success');
      onSaved?.();
      onClose();
    } catch (e) {
      toast('Save Failed', e.message || 'An error occurred while saving the batch.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const bankOptions = [
    { value: '', label: 'Select Bank Account' },
    ...bankAccounts.map((b) => ({
      value: b.id,
      label: `${b.bankName || 'Bank'} (${b.accountNumber ? `•••${b.accountNumber.slice(-4)}` : b.accountHolderName || ''})`,
    })),
  ];

  const matchedInputStock = stockMap.get(form.input?.description?.trim() || '');

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={
        <div className="flex items-center gap-2">
          <Layers className="size-5 text-brand-600" />
          <span>{initialBatch ? `Edit Batch #${form.batchId}` : 'New Dyeing & Processing Batch'}</span>
          <Badge
            variant={form.status === DYEING_STATUS.COMPLETED ? 'success' : 'warning'}
            className="ml-2 font-mono text-xs"
          >
            {form.status === DYEING_STATUS.COMPLETED ? 'Completed' : 'In Process'}
          </Badge>
        </div>
      }
      footer={
        <div className="flex flex-col gap-3 w-full sm:flex-row sm:items-center sm:justify-between">
          <div className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-600 sm:border-0 sm:bg-transparent sm:p-0">
            {totals.totalOutputQty > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-slate-500 font-medium">Finished Unit Cost:</span>
                <strong className="font-mono text-sm font-extrabold text-emerald-800">
                  {rupees(totals.avgFinishedUnitCost)}
                </strong>
                <span className="text-slate-500">/ {form.input.unit || 'unit'}</span>
              </div>
            ) : (
              <span className="text-xs text-slate-500">
                Enter finished output to compute manufactured unit cost
              </span>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            <Button
              variant="ghost"
              onClick={onClose}
              disabled={saving}
              className="justify-center text-slate-600 hover:text-slate-900 py-2 sm:py-1.5"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={Save}
              loading={saving}
              onClick={handleSave}
              className="justify-center text-xs sm:text-sm py-2 sm:py-1.5 px-5 font-semibold"
            >
              Save Batch
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-6 max-h-[75vh] overflow-y-auto px-1 pr-2">
        {/* Top: Batch Basic Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
          <TextField
            label="Batch Number *"
            value={form.batchId}
            onChange={(v) => updateField('batchId', v)}
            placeholder="e.g. B-001"
            className="font-mono font-semibold"
          />
          <DateField
            label="Batch Date *"
            value={form.batchDate}
            onChange={(v) => updateField('batchDate', v)}
          />
        </div>

        {/* Dyer & Processing Unit (with Directory Autocomplete & Autofill) */}
        <DyerPicker
          dyers={dyers}
          dyeingName={form.processorName}
          ownerName={form.processorOwner}
          phone={form.processorPhone}
          address={form.processorAddress}
          onSelect={handleSelectDyer}
          onDyeingNameChange={(v) => updateField('processorName', v)}
          onOwnerNameChange={(v) => updateField('processorOwner', v)}
          onPhoneChange={(v) => updateField('processorPhone', v)}
          onAddressChange={(v) => updateField('processorAddress', v)}
        />

        {/* Section 1: Raw Grey Roll Consumed */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="size-4 text-amber-700" />
              <h3 className="text-sm font-bold text-amber-900 uppercase tracking-wider">
                1. Raw Material Issued (Grey Fabric)
              </h3>
            </div>
            {matchedInputStock && (
              <span className="text-xs text-amber-800 font-medium">
                Current Available Stock:{' '}
                <strong className={matchedInputStock.available > 0 ? 'text-emerald-700' : 'text-red-600'}>
                  {matchedInputStock.available} {form.input.unit}
                </strong>
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-6">
              <ProductDescriptionInput
                label="Grey Roll Item Description"
                value={form.input.description}
                onChange={handleInputDescriptionChange}
                shortcuts={shortcuts}
                stockMap={stockMap}
                placeholder="Type grey roll name or shortcut..."
              />
            </div>
            <div className="sm:col-span-2">
              <SelectField
                label="Unit"
                value={form.input.unit || 'Rolls'}
                onChange={(v) => updateInput('unit', v)}
                options={UNITS.map((u) => ({ value: u, label: u }))}
              />
            </div>
            <div className="sm:col-span-2">
              <NumberField
                label={`Quantity (${form.input.unit || 'Rolls'})`}
                value={form.input.qty}
                onChange={(v) => updateInput('qty', v)}
                placeholder="0"
              />
            </div>
            <div className="sm:col-span-2">
              <NumberField
                label="Grey Cost / Unit (₹)"
                value={form.input.avgGreyRate}
                onChange={(v) => updateInput('avgGreyRate', v)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="flex justify-end text-xs font-semibold text-amber-900 pt-1 border-t border-amber-200/60">
            Total Grey Cost: {rupees(totals.totalGreyCost)}
          </div>
        </div>

        {/* Section 2: Additional Processing Expenses */}
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Banknote className="size-4 text-indigo-700" />
              <h3 className="text-sm font-bold text-indigo-900 uppercase tracking-wider">
                2. Additional Processing Expenses
              </h3>
            </div>
            <Button
              size="sm"
              variant="outline"
              icon={Plus}
              onClick={addExpenseRow}
              className="text-xs h-7 px-2"
            >
              Add Expense Line
            </Button>
          </div>

          <div className="space-y-2">
            {form.expenses.map((exp, idx) => (
              <div
                key={idx}
                className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-white p-2.5 rounded-lg border border-indigo-100 shadow-2xs"
              >
                <div className="sm:col-span-4">
                  <TextField
                    value={exp.category}
                    onChange={(v) => updateExpense(idx, 'category', v)}
                    placeholder="Expense name"
                  />
                </div>
                <div className="sm:col-span-3">
                  <NumberField
                    value={exp.amount}
                    onChange={(v) => updateExpense(idx, 'amount', v)}
                    placeholder="Amount (₹)"
                  />
                </div>
                <div className="sm:col-span-2">
                  <SelectField
                    value={exp.paidVia || 'cash'}
                    onChange={(v) => updateExpense(idx, 'paidVia', v)}
                    options={[
                      { value: 'cash', label: 'Cash in Hand' },
                      { value: 'bank', label: 'Bank Account' },
                      { value: 'credit', label: 'Processor Credit' },
                    ]}
                  />
                </div>
                <div className="sm:col-span-2">
                  {exp.paidVia === 'bank' ? (
                    <SelectField
                      value={exp.bankAccountId || ''}
                      onChange={(v) => updateExpense(idx, 'bankAccountId', v)}
                      options={bankOptions}
                    />
                  ) : (
                    <span className="text-[11px] text-slate-400 italic px-2">No bank account</span>
                  )}
                </div>
                <div className="sm:col-span-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => removeExpenseRow(idx)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
                    title="Remove expense"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end text-xs font-semibold text-indigo-900 pt-1 border-t border-indigo-200/60">
            Total Processing Expenses: {rupees(totals.totalExpenses)}
          </div>
        </div>

        {/* Section 3: Finished Goods Output */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="size-4 text-emerald-700" />
              <h3 className="text-sm font-bold text-emerald-900 uppercase tracking-wider">
                3. Finished Goods Produced (Colored Rolls)
              </h3>
            </div>
            <Button
              size="sm"
              variant="outline"
              icon={Plus}
              onClick={addOutputRow}
              className="text-xs h-7 px-2"
            >
              Add Finished Product
            </Button>
          </div>

          <div className="space-y-2">
            {totals.enrichedOutput.map((out, idx) => (
              <div
                key={idx}
                className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-white p-2.5 rounded-lg border border-emerald-100 shadow-2xs"
              >
                <div className="sm:col-span-5">
                  <ProductDescriptionInput
                    value={out.description}
                    onChange={(v) => updateOutput(idx, 'description', v)}
                    shortcuts={shortcuts}
                    stockMap={stockMap}
                    placeholder="Finished roll description (e.g. Navy Blue)"
                  />
                </div>
                <div className="sm:col-span-2">
                  <SelectField
                    value={out.unit || form.input.unit || 'Rolls'}
                    onChange={(v) => updateOutput(idx, 'unit', v)}
                    options={UNITS.map((u) => ({ value: u, label: u }))}
                  />
                </div>
                <div className="sm:col-span-2">
                  <NumberField
                    value={out.qty}
                    onChange={(v) => updateOutput(idx, 'qty', v)}
                    placeholder="Output Qty"
                  />
                </div>
                <div className="sm:col-span-2 text-right pr-2">
                  <div className="text-xs font-bold text-emerald-800 tabular-nums">
                    {rupees(out.unitCost)} / {out.unit || 'Roll'}
                  </div>
                  <div className="text-[10px] text-slate-400">Total: {rupees(out.allocatedCost)}</div>
                </div>
                <div className="sm:col-span-1 flex justify-end">
                  {totals.enrichedOutput.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeOutputRow(idx)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
                      title="Remove output product"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Shrinkage & Loss Tracker */}
          <div className="flex flex-wrap items-center justify-between text-xs text-slate-600 bg-white/80 p-2.5 rounded-lg border border-emerald-200/60">
            <div>
              Total Output Qty:{' '}
              <strong className="text-slate-800 font-bold">
                {totals.totalOutputQty} {form.input.unit}
              </strong>
            </div>
            {totals.shrinkageQty > 0 && (
              <div className="text-amber-700 font-medium">
                Shrinkage / Loss: {totals.shrinkageQty} {form.input.unit} ({totals.shrinkagePct}%)
              </div>
            )}
            <div className="font-bold text-emerald-800">
              Total Output Value: {rupees(totals.totalBatchCost)}
            </div>
          </div>
        </div>

        {/* Section 4: Total Batch Cost Summary Card */}
        <div className="rounded-xl bg-gradient-to-r from-slate-900 to-brand-950 p-4 text-white shadow-lg space-y-3">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <span className="text-xs uppercase tracking-wider text-gold-300 font-bold">
              Total Manufacturing & Processing Summary
            </span>
            <span className="text-xs text-slate-400 font-mono">#{form.batchId}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div className="p-2 rounded-lg bg-white/5">
              <div className="text-[11px] text-slate-400">Raw Grey Cost</div>
              <div className="text-base font-bold text-amber-300 font-mono">
                {rupees(totals.totalGreyCost)}
              </div>
            </div>
            <div className="p-2 rounded-lg bg-white/5">
              <div className="text-[11px] text-slate-400">Processing Expenses</div>
              <div className="text-base font-bold text-indigo-300 font-mono">
                +{rupees(totals.totalExpenses)}
              </div>
            </div>
            <div className="p-2 rounded-lg bg-white/5">
              <div className="text-[11px] text-slate-400">Total Batch Cost</div>
              <div className="text-base font-bold text-white font-mono">
                ={rupees(totals.totalBatchCost)}
              </div>
            </div>
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <div className="text-[11px] text-emerald-300 font-medium">Finished Cost / Unit</div>
              <div className="text-lg font-black text-emerald-400 font-mono">
                {rupees(totals.avgFinishedUnitCost)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
