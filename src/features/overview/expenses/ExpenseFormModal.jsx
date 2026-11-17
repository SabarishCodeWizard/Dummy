import { Save } from 'lucide-react';

import { Button, DateField, Modal, NumberField, TextArea } from '@/ui';

const FORM_ID = 'expense-form';

/**
 * Add / edit sheet of the Expenses page (the original's "Add Expense" / "Edit Expense" form card).
 * `form` is null while closed; Enter in the date / amount fields submits.
 */
export default function ExpenseFormModal({ form, onChange, saving, onClose, onSave }) {
  const editing = !!form?.id;
  return (
    <Modal
      open={form !== null}
      onClose={saving ? undefined : onClose}
      title={editing ? 'Edit Expense' : 'Add Expense'}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving} className="max-sm:flex-1">
            Cancel
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            variant="primary"
            icon={Save}
            loading={saving}
            className="max-sm:flex-1"
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </>
      }
    >
      {form ? (
        <form
          id={FORM_ID}
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <DateField label="Date" value={form.date} onChange={(date) => onChange({ ...form, date })} />
            <NumberField
              label="Amount (Rs.)"
              value={form.amount}
              onChange={(amount) => onChange({ ...form, amount })}
            />
          </div>
          <TextArea
            label="Reason"
            value={form.reason}
            onChange={(reason) => onChange({ ...form, reason })}
            placeholder="Description of expense..."
            rows={3}
          />
        </form>
      ) : null}
    </Modal>
  );
}
