import { Save } from 'lucide-react';
import { useState } from 'react';
import { db } from '@/core/db';
import { Button, Modal, NumberField, DateField, SelectField, useFeedback } from '@/ui';
import { todayISO } from '@/core/format';

const FORM_ID = 'finance-payment-form';

export default function AddFinancePaymentModal({ record, onClose, onSave }) {
  const { toast } = useFeedback();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    date: todayISO(),
    amount: '',
    mode: 'Cash'
  });

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
        mode: form.mode
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
          onChange={v => setForm({ ...form, mode: v })}
          options={[
            { label: 'Cash', value: 'Cash' },
            { label: 'UPI', value: 'UPI' },
            { label: 'Account Transfer', value: 'Account' }
          ]}
        />
      </form>
    </Modal>
  );
}
