import { Save } from 'lucide-react';
import { useState, useEffect } from 'react';
import { db } from '@/core/db';
import { Button, Modal, NumberField, DateField, SelectField, useFeedback } from '@/ui';
import { formatCurrency, todayISO } from '@/core/format';

const FORM_ID = 'finance-payment-form';

export default function AddFinancePaymentModal({ record, onClose, onSave }) {
  const { toast } = useFeedback();
  const [saving, setSaving] = useState(false);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [form, setForm] = useState({
    date: todayISO(),
    amount: '',
    mode: 'Cash',
    sourceAccount: 'cash',
  });

  useEffect(() => {
    db.getAllBankAccounts().then(setBankAccounts).catch(console.error);
  }, []);


  if (!record) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.amount || parseFloat(form.amount) <= 0) return;
    
    const isDuplicate = record.payments?.some(
      p => p.date === form.date && parseFloat(p.amount) === parseFloat(form.amount)
    );
    if (isDuplicate) {
      toast('Duplicate Entry', 'A payment of this exact amount is already recorded on this date.', 'error');
      return;
    }

    setSaving(true);
    try {
      const newPayment = {
        id: crypto.randomUUID(),
        date: form.date,
        amount: parseFloat(form.amount),
        mode: form.mode,
        sourceAccount: form.sourceAccount || (form.mode === 'Cash' ? 'cash' : bankAccounts[0]?.id || 'cash'),
      };

      const updatedRecord = {
        ...record,
        payments: [...(record.payments || []), newPayment]
      };

      await db.saveFinanceRecord(updatedRecord);
      onSave(updatedRecord);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const accountOptions = [
    { value: 'cash', label: 'Cash in Hand (Physical Cash)' },
    ...bankAccounts.map((a) => ({
      value: a.id,
      label: `${a.accountName} (${a.bankName || a.accountType})`,
    })),
  ];

  const dueBalance = record.balance ?? (record.totalAmount - (record.payments?.reduce((s, p) => s + (p.amount || 0), 0) || 0));

  return (
    <Modal
      open={true}
      onClose={saving ? undefined : onClose}
      title="Add Payment"
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving} className="max-sm:flex-1">
            Cancel
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            variant="success"
            icon={Save}
            loading={saving}
            className="max-sm:flex-1"
          >
            {saving ? 'Saving...' : 'Save Payment'}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} className="space-y-4" onSubmit={handleSubmit}>
        <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50/80 p-3">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Lender</span>
            <div className="font-bold text-slate-900">{record.lenderName}</div>
          </div>
          <div className="text-right">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Balance Due</span>
            <div className="font-display font-extrabold text-rose-700">
              Rs. {formatCurrency(Math.max(0, dueBalance))}
            </div>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <DateField 
            label="Payment Date" 
            value={form.date} 
            onChange={v => setForm({ ...form, date: v })} 
            required 
          />
          <NumberField 
            label="Amount Paid (Rs.)" 
            value={form.amount} 
            onChange={v => setForm({ ...form, amount: v })} 
            required 
          />
        </div>
        <SelectField 
          label="Payment Mode" 
          value={form.mode} 
          onChange={v => setForm({ ...form, mode: v, sourceAccount: v === 'Cash' ? 'cash' : (bankAccounts[0]?.id || 'cash') })}
          options={[
            { label: 'Cash', value: 'Cash' },
            { label: 'UPI', value: 'UPI' },
            { label: 'Account Transfer', value: 'Account' }
          ]}
        />
        <SelectField 
          label="Deduct / Pay From" 
          value={form.sourceAccount} 
          onChange={v => setForm({ ...form, sourceAccount: v })}
          options={accountOptions}
        />
      </form>
    </Modal>
  );
}

