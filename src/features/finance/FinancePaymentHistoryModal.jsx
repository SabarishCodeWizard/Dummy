import { Receipt, X, Banknote, Landmark, Smartphone, CheckCircle2 } from 'lucide-react';
import { db } from '@/core/db';
import { Modal, Button, EmptyState, IconButton, useFeedback } from '@/ui';
import { formatCurrency, formatDateShort } from '@/core/format';
import { calculateFinanceStats } from './financeLogic';

const ICONS = {
  'Cash': Banknote,
  'Account': Landmark,
  'UPI': Smartphone,
};

export default function FinancePaymentHistoryModal({ record, onClose, onUpdate }) {
  const { confirm, toast } = useFeedback();

  if (!record) return null;

  const stats = calculateFinanceStats(record);
  const payments = [...(record.payments || [])].sort((a, b) => new Date(b.date) - new Date(a.date));

  const handleDelete = async (paymentId) => {
    const ok = await confirm({
      title: 'Delete Payment?',
      message: 'Are you sure you want to remove this payment?',
      tone: 'danger',
      confirmText: 'Delete'
    });

    if (!ok) return;

    try {
      const updatedRecord = {
        ...record,
        payments: record.payments.filter(p => p.id !== paymentId)
      };
      await db.saveFinanceRecord(updatedRecord);
      toast('Deleted', 'Payment record has been deleted', 'success');
      onUpdate(updatedRecord);
    } catch (e) {
      toast('Error', 'Failed to delete payment', 'error');
    }
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Payment History"
      size="md"
      footer={
        <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
          Close
        </Button>
      }
    >
      <div className="mb-4 bg-slate-50 border border-line rounded-lg p-3">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-xs text-slate-500 font-medium">Lender</div>
            <div className="font-semibold text-brand-900">{record.lenderName}</div>
            {record.phone && <div className="text-xs text-slate-500 mt-0.5">{record.phone}</div>}
          </div>
          {stats.isSettled ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
              <CheckCircle2 className="size-3.5 text-emerald-600" />
              Settled
            </span>
          ) : (
            <div className="text-right">
              <div className="text-xs text-slate-500 font-medium">Balance Due</div>
              <div className="text-sm font-bold text-emerald-700">₹{formatCurrency(stats.balancePayable)}</div>
            </div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3 pt-2.5 border-t border-slate-200/70 text-xs">
          <div>
            <span className="text-slate-500">Principal:</span>{' '}
            <span className="font-semibold text-brand-900">₹{formatCurrency(record.principal)}</span>
          </div>
          <div>
            <span className="text-slate-500">Total Due:</span>{' '}
            <span className="font-semibold text-amber-700">₹{formatCurrency(stats.totalPayable)}</span>
          </div>
          <div className="text-right">
            <span className="text-slate-500">Paid:</span>{' '}
            <span className="font-semibold text-blue-700">₹{formatCurrency(stats.totalPaid)}</span>
          </div>
        </div>
      </div>

      {payments.length === 0 ? (
        <EmptyState 
          icon={Receipt} 
          title="No Payments Yet" 
          message="Payments you record for this loan will appear here."
        />
      ) : (
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {payments.map(p => {
            const Icon = ICONS[p.mode] || Receipt;
            return (
              <div key={p.id} className="flex items-center justify-between p-3 border border-line rounded-xl bg-white shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                    <Icon className="size-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-800">{p.mode} Payment</div>
                    <div className="text-xs text-slate-500">{formatDateShort(p.date)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="font-display text-lg font-bold text-emerald-700 tabular-nums">
                    ₹{formatCurrency(p.amount)}
                  </div>
                  <IconButton 
                    icon={X} 
                    onClick={() => handleDelete(p.id)} 
                    className="text-slate-400 hover:text-red-600 hover:bg-red-50" 
                    label="Delete Payment"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
