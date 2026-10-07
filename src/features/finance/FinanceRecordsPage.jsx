import { Landmark, Plus, Sigma, Trash2, Edit, CreditCard, AlertCircle, History, Phone } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { db } from '@/core/db';
import { formatCurrency, formatDateShort, toNum } from '@/core/format';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { Button, DataTable, EmptyState, ErrorState, Page, IconButton, useFeedback, Badge } from '@/ui';
import KpiRow from '../overview/components/KpiRow';
import InkStat from '../overview/components/InkStat';
import SkeletonRows from '../overview/components/SkeletonRows';
import FilterBar from '../overview/components/FilterBar';
import ShowMore from '../overview/components/ShowMore';
import FloatingAddButton from '../overview/components/FloatingAddButton';
import { usePagedRows } from '../overview/components/paging';
import { calculateFinanceStats, emptyFinanceForm, validateFinanceForm } from './financeLogic';
import FinanceFormModal from './FinanceFormModal';
import AddFinancePaymentModal from './AddFinancePaymentModal';
import FinancePaymentHistoryModal from './FinancePaymentHistoryModal';
import { todayISO } from '@/core/format';

const rs = (n) => `Rs. ${formatCurrency(n)}`;

export default function FinanceRecordsPage() {
  const { toast, confirm } = useFeedback();
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [calcDate, setCalcDate] = useState('');
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [paymentRecord, setPaymentRecord] = useState(null);
  const [historyRecord, setHistoryRecord] = useState(null);

  const { loading, error, reload } = useFocusLoad(async () => {
    try {
      setRecords(await db.getAllFinanceRecords());
    } catch (e) {
      console.error('Error loading finance records:', e);
      toast('Error', 'Failed to load finance records', 'error');
      throw e;
    }
  });

  const shown = records.filter(r => 
    !searchTerm || 
    r.lenderName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    r.phone.includes(searchTerm)
  );

  const paged = usePagedRows(shown, searchTerm);

  const remove = async (record) => {
    const ok = await confirm({
      title: 'Are you sure?',
      message: "You won't be able to revert this!",
      tone: 'danger',
      confirmText: 'Yes, delete it!',
    });
    if (!ok) return;
    try {
      await db.deleteFinanceRecord(record.id);
      toast('Deleted!', 'Record has been deleted.', 'success');
      await reload();
    } catch (e) {
      toast('Error', 'Failed to delete record.', 'error');
    }
  };

  const save = async () => {
    const err = validateFinanceForm(form);
    if (err) {
      toast('Warning', err, 'warning');
      return;
    }
    setSaving(true);
    try {
      const recordToSave = {
        ...form,
        principal: parseFloat(form.principal),
        rate: parseFloat(form.rate),
      };
      await db.saveFinanceRecord(recordToSave);
      toast('Success', `Finance record saved successfully.`, 'success');
      setForm(null);
      await reload();
    } catch (e) {
      console.error('Save error:', e);
      toast('Error', 'Failed to save record.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const openAdd = () => setForm(emptyFinanceForm(todayISO()));
  const openEdit = (record) => setForm({ ...record });

  const totals = shown.reduce((acc, r) => {
    const targetDate = calcDate || undefined;
    const stats = calculateFinanceStats(r, targetDate);
    
    acc.principal += toNum(r.principal);
    acc.interest += stats.totalInterestAccrued;
    acc.total += stats.totalPayable;
    acc.paid += stats.totalPaid;
    acc.balance += stats.balancePayable;
    acc.overdue += stats.overdueAmount;
    return acc;
  }, { principal: 0, interest: 0, total: 0, paid: 0, balance: 0, overdue: 0 });

  const columns = [
    { key: 'lender', header: 'Lender', className: 'whitespace-nowrap', value: (e) => e.lenderName },
    { key: 'phone', header: 'Phone', className: 'whitespace-nowrap', value: (e) => e.phone },
    { key: 'start', header: 'Start Date', className: 'whitespace-nowrap', value: (e) => formatDateShort(e.startDate) },
    { key: 'end', header: 'End Date', className: 'whitespace-nowrap', value: (e) => e.endDate ? formatDateShort(e.endDate) : 'Ongoing' },
    { key: 'rate', header: 'Rate/Mo', className: 'whitespace-nowrap', value: (e) => `${e.rate}%` },
    { 
      key: 'principal', 
      header: 'Principal', 
      align: 'right', 
      className: 'font-display font-bold text-brand-800 tabular-nums whitespace-nowrap', 
      value: (e) => rs(toNum(e.principal)) 
    },
    {
      key: 'interest',
      header: 'Interest Accrued',
      align: 'right',
      className: 'font-display font-bold text-amber-600 tabular-nums whitespace-nowrap',
      value: (e) => {
        const stats = calculateFinanceStats(e, calcDate || undefined);
        return rs(stats.totalInterestAccrued);
      }
    },
    {
      key: 'paid',
      header: 'Paid',
      align: 'right',
      className: 'font-display font-semibold text-blue-600 tabular-nums whitespace-nowrap',
      value: (e) => {
        const stats = calculateFinanceStats(e, calcDate || undefined);
        return rs(stats.totalPaid);
      }
    },
    {
      key: 'balance',
      header: 'Balance Payable',
      align: 'right',
      className: 'font-display font-extrabold text-emerald-700 tabular-nums whitespace-nowrap',
      render: (e) => {
        const stats = calculateFinanceStats(e, calcDate || undefined);
        
        return (
          <div className="flex flex-col items-end">
            <span>{rs(stats.balancePayable)}</span>
            {stats.isOverdue && (
               <div className="text-red-500 text-xs mt-1 flex items-center gap-1 font-semibold">
                 <AlertCircle className="size-3" />
                 Overdue: {rs(stats.overdueAmount)}
               </div>
            )}
          </div>
        );
      }
    },
    { 
      key: 'actions', 
      header: 'Actions', 
      align: 'center', 
      render: (e) => (
        <div className="flex items-center justify-center gap-2">
          <IconButton icon={History} onClick={() => setHistoryRecord(e)} label="History" className="text-slate-600 hover:text-brand-700 hover:bg-slate-50" />
          <IconButton icon={CreditCard} onClick={() => setPaymentRecord(e)} label="Add Payment" className="text-blue-600 hover:text-blue-800 hover:bg-blue-50" />
          <IconButton icon={Edit} onClick={() => openEdit(e)} label="Edit" />
          <IconButton icon={Trash2} onClick={() => void remove(e)} label="Delete" className="text-red-500 hover:text-red-700 hover:bg-red-50" />
        </div>
      )
    },
  ];

  let body;
  if (loading) body = <SkeletonRows count={4} height="h-20" />;
  else if (error) body = <ErrorState message={error} onRetry={() => void reload()} />;
  else
    body = (
      <>
        <DataTable
          columns={columns}
          rows={paged.rows}
          rowKey={(e) => e.id}
          renderCard={(e) => {
            const stats = calculateFinanceStats(e, calcDate || undefined);
            return (
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-semibold text-brand-900">{e.lenderName}</div>
                    <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5"><Phone className="size-3"/>{e.phone}</div>
                    <div className="text-xs text-slate-500 mt-1">Rate: {e.rate}% / mo</div>
                  </div>
                  <div className="flex gap-1">
                    <IconButton icon={History} onClick={() => setHistoryRecord(e)} label="History" className="text-slate-500 hover:text-brand-700" />
                    <IconButton icon={CreditCard} onClick={() => setPaymentRecord(e)} label="Add Payment" className="text-blue-600 hover:text-blue-800" />
                    <IconButton icon={Edit} onClick={() => openEdit(e)} label="Edit" />
                    <IconButton icon={Trash2} onClick={() => void remove(e)} label="Delete" className="text-red-500 hover:text-red-700" />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2 mt-2 bg-slate-50 p-2 rounded-lg border border-line">
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Principal</div>
                    <div className="font-display font-semibold text-brand-900">{rs(toNum(e.principal))}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Accrued</div>
                    <div className="font-display font-semibold text-amber-600">{rs(stats.totalInterestAccrued)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Paid</div>
                    <div className="font-display font-semibold text-blue-600">{rs(stats.totalPaid)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Balance</div>
                    <div className="font-display font-extrabold text-emerald-700">{rs(stats.balancePayable)}</div>
                  </div>
                </div>
                {stats.isOverdue && (
                   <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-red-600 bg-red-50 px-2.5 py-1.5 rounded-md border border-red-100">
                     <AlertCircle className="size-4" />
                     Overdue: {rs(stats.overdueAmount)}
                   </div>
                )}
              </div>
            );
          }}
          empty={
            <EmptyState
              icon={Landmark}
              title="No finance records found."
              message="Borrowings will show up here. Add a new record to get started."
            />
          }
        />
        <ShowMore pager={paged.pager} noun="records" />
      </>
    );

  return (
    <Page
      title="Finance Records"
      icon={Landmark}
      actions={
        <Button icon={Plus} onClick={openAdd} className="max-sm:hidden">
          Add Record
        </Button>
      }
    >
      <KpiRow cols={4}>
        <InkStat icon={Landmark} label="Total Principal" value={rs(totals.principal)} />
        <InkStat icon={Sigma} label="Total Interest" value={rs(totals.interest)} tint="amber" />
        <InkStat icon={CreditCard} label="Total Paid" value={rs(totals.paid)} tint="blue" />
        <InkStat icon={Sigma} label="Balance Payable" value={rs(totals.balance)} tint="emerald" />
      </KpiRow>
      
      {totals.overdue > 0 && (
         <div className="mb-5 flex items-center justify-between rounded-xl bg-red-50 p-4 border border-red-200">
           <div className="flex items-center gap-3">
             <div className="flex size-10 items-center justify-center rounded-full bg-red-100 text-red-600">
                <AlertCircle className="size-6" />
             </div>
             <div>
               <h3 className="text-sm font-bold text-red-900">Overdue Payments Detected</h3>
               <p className="text-xs font-medium text-red-700 mt-0.5">Some of your interest payments are past due.</p>
             </div>
           </div>
           <div className="text-right">
             <div className="text-xs uppercase font-bold text-red-500 tracking-wider">Total Overdue</div>
             <div className="text-lg font-display font-extrabold text-red-600">{rs(totals.overdue)}</div>
           </div>
         </div>
      )}
      <FilterBar
        date={calcDate}
        onDateChange={setCalcDate}
        text={searchTerm}
        onTextChange={setSearchTerm}
        textPlaceholder="Search by Lender or Phone..."
        onClear={() => {
          setSearchTerm('');
          setCalcDate('');
        }}
      />
      {body}
      <FloatingAddButton label="Add Record" onClick={openAdd} />
      <FinanceFormModal
        form={form}
        onChange={setForm}
        saving={saving}
        onClose={() => setForm(null)}
        onSave={() => void save()}
      />
      <AddFinancePaymentModal
        record={paymentRecord}
        onClose={() => setPaymentRecord(null)}
        onSave={async () => {
          setPaymentRecord(null);
          toast('Success', 'Payment recorded successfully', 'success');
          await reload();
        }}
      />
      <FinancePaymentHistoryModal 
        record={historyRecord}
        onClose={() => setHistoryRecord(null)}
        onUpdate={async () => {
          await reload();
        }}
      />
    </Page>
  );
}
