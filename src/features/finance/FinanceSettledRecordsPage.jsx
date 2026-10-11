import { Landmark, Sigma, Trash2, Edit, CreditCard, History, Phone, CheckCircle2, CheckCheck } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { db } from '@/core/db';
import { formatCurrency, formatDateShort, toNum } from '@/core/format';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { Button, DataTable, EmptyState, ErrorState, Page, IconButton, useFeedback } from '@/ui';
import KpiRow from '../overview/components/KpiRow';
import InkStat from '../overview/components/InkStat';
import SkeletonRows from '../overview/components/SkeletonRows';
import FilterBar from '../overview/components/FilterBar';
import ShowMore from '../overview/components/ShowMore';
import { usePagedRows } from '../overview/components/paging';
import { calculateFinanceStats, validateFinanceForm } from './financeLogic';
import FinanceFormModal from './FinanceFormModal';
import FinancePaymentHistoryModal from './FinancePaymentHistoryModal';

const rs = (n) => `Rs. ${formatCurrency(n)}`;

export default function FinanceSettledRecordsPage() {
  const { toast, confirm } = useFeedback();
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [calcDate, setCalcDate] = useState('');
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
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

  const ongoingCount = records.filter(r => !calculateFinanceStats(r, calcDate || undefined).isSettled).length;
  const settledAll = records.filter(r => calculateFinanceStats(r, calcDate || undefined).isSettled);

  const shown = settledAll.filter(r => 
    !searchTerm || 
    r.lenderName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    r.phone.includes(searchTerm)
  );

  const paged = usePagedRows(shown, searchTerm);

  const remove = async (record) => {
    const ok = await confirm({
      title: 'Delete Settled Record?',
      message: "This will remove the settled loan and its payment history.",
      tone: 'danger',
      confirmText: 'Yes, delete it',
    });
    if (!ok) return;
    try {
      await db.deleteFinanceRecord(record.id);
      toast('Deleted', 'Record has been removed.', 'success');
      await reload();
    } catch (e) {
      toast('Error', 'Failed to delete record.', 'error');
    }
  };

  const openEdit = (record) => setForm({ ...record });

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
      toast('Success', 'Record updated successfully.', 'success');
      setForm(null);
      await reload();
    } catch (e) {
      console.error('Save error:', e);
      toast('Error', 'Failed to save record.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const totals = shown.reduce((acc, r) => {
    const stats = calculateFinanceStats(r, calcDate || undefined);
    acc.count += 1;
    acc.principal += toNum(r.principal);
    acc.interestPaid += Math.max(0, stats.totalPaid - toNum(r.principal));
    acc.totalPaid += stats.totalPaid;
    return acc;
  }, { count: 0, principal: 0, interestPaid: 0, totalPaid: 0 });

  const columns = [
    { key: 'lender', header: 'Lender', className: 'whitespace-nowrap', value: (e) => e.lenderName },
    { key: 'phone', header: 'Phone', className: 'whitespace-nowrap', value: (e) => e.phone },
    { key: 'start', header: 'Start Date', className: 'whitespace-nowrap', value: (e) => formatDateShort(e.startDate) },
    { key: 'end', header: 'End Date', className: 'whitespace-nowrap', value: (e) => e.endDate ? formatDateShort(e.endDate) : 'Ongoing' },
    { 
      key: 'totalMonths', 
      header: 'Total Months', 
      align: 'center', 
      className: 'whitespace-nowrap font-medium text-slate-700 tabular-nums', 
      value: (e) => {
        const stats = calculateFinanceStats(e, calcDate || undefined);
        const m = e.endDate ? stats.totalMonths : stats.monthsElapsed;
        if (m === 0) return '< 1 Month';
        return `${m} ${m === 1 ? 'Month' : 'Months'}`;
      } 
    },
    { key: 'rate', header: 'Rate/Mo', className: 'whitespace-nowrap', value: (e) => `${e.rate}%` },
    { 
      key: 'principal', 
      header: 'Principal Settled', 
      align: 'right', 
      className: 'font-display font-bold text-brand-800 tabular-nums whitespace-nowrap', 
      value: (e) => rs(toNum(e.principal)) 
    },
    {
      key: 'paid',
      header: 'Total Repaid',
      align: 'right',
      className: 'font-display font-extrabold text-blue-700 tabular-nums whitespace-nowrap',
      value: (e) => {
        const stats = calculateFinanceStats(e, calcDate || undefined);
        return rs(stats.totalPaid);
      }
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      className: 'whitespace-nowrap',
      render: () => (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
          <CheckCircle2 className="size-3.5 text-emerald-600" />
          Settled
        </span>
      )
    },
    { 
      key: 'actions', 
      header: 'Actions', 
      align: 'center', 
      render: (e) => (
        <div className="flex items-center justify-center gap-2">
          <IconButton icon={History} onClick={() => setHistoryRecord(e)} label="Payment History" className="text-slate-600 hover:text-brand-700 hover:bg-slate-50" />
          <IconButton icon={Edit} onClick={() => openEdit(e)} label="Edit Record" />
          <IconButton icon={Trash2} onClick={() => void remove(e)} label="Delete Record" className="text-red-500 hover:text-red-700 hover:bg-red-50" />
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
                    <div className="text-[11px] font-medium text-slate-600 mt-1 space-y-0.5">
                      <div>Start: <span className="font-semibold text-slate-700">{formatDateShort(e.startDate)}</span></div>
                      {e.endDate ? (
                        <div>End: <span className="font-semibold text-slate-700">{formatDateShort(e.endDate)}</span></div>
                      ) : null}
                      <div>
                        Total Months: <span className="font-semibold text-slate-700">
                          {e.endDate ? `${stats.totalMonths || '< 1'} Mo` : `${stats.monthsElapsed || '< 1'} Mo`}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      <CheckCircle2 className="size-3 text-emerald-600" />
                      Settled
                    </span>
                    <IconButton icon={History} onClick={() => setHistoryRecord(e)} label="History" className="text-slate-500 hover:text-brand-700" />
                    <IconButton icon={Edit} onClick={() => openEdit(e)} label="Edit" />
                    <IconButton icon={Trash2} onClick={() => void remove(e)} label="Delete" className="text-red-500 hover:text-red-700" />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2 mt-2 bg-slate-50 p-2.5 rounded-lg border border-line">
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Principal Settled</div>
                    <div className="font-display font-semibold text-brand-900">{rs(toNum(e.principal))}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Total Repaid</div>
                    <div className="font-display font-extrabold text-blue-700">{rs(stats.totalPaid)}</div>
                  </div>
                </div>
              </div>
            );
          }}
          empty={
            <EmptyState
              icon={CheckCircle2}
              title="No settled records found."
              message="When loans are paid off in full, they will automatically appear here."
            />
          }
        />
        <ShowMore pager={paged.pager} noun="settled records" />
      </>
    );

  return (
    <Page
      title="Settled Finance Records"
      icon={CheckCircle2}
    >
      {/* Top navigation tabs */}
      <div className="flex items-center gap-2 mb-4 border-b border-line pb-2.5">
        <button
          type="button"
          onClick={() => navigate('/finance/records')}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-brand-900 hover:bg-slate-100 transition-colors"
        >
          <Landmark className="size-3.5 text-slate-500" />
          <span>Ongoing Records</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-200 text-slate-700 font-mono">
            {ongoingCount}
          </span>
        </button>
        <button
          type="button"
          onClick={() => navigate('/finance/settled')}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-900 text-white shadow-sm"
        >
          <CheckCircle2 className="size-3.5 text-emerald-400" />
          <span>Settled Records</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 text-white font-mono">
            {settledAll.length}
          </span>
        </button>
      </div>

      <KpiRow cols={4}>
        <InkStat icon={CheckCheck} label="Settled Loans" value={totals.count} />
        <InkStat icon={Landmark} label="Total Principal" value={rs(totals.principal)} tint="brand" />
        <InkStat icon={Sigma} label="Interest Repaid" value={rs(totals.interestPaid)} tint="amber" />
        <InkStat icon={CreditCard} label="Total Amount Repaid" value={rs(totals.totalPaid)} tint="emerald" />
      </KpiRow>
      
      <FilterBar
        date={calcDate}
        onDateChange={setCalcDate}
        text={searchTerm}
        onTextChange={setSearchTerm}
        textPlaceholder="Search settled records by Lender or Phone..."
        onClear={() => {
          setSearchTerm('');
          setCalcDate('');
        }}
      />
      
      {body}

      <FinanceFormModal
        form={form}
        onChange={setForm}
        saving={saving}
        onClose={() => setForm(null)}
        onSave={() => void save()}
      />

      <FinancePaymentHistoryModal 
        record={historyRecord}
        onClose={() => setHistoryRecord(null)}
        onUpdate={async (updatedRecord) => {
          setHistoryRecord(updatedRecord);
          await reload();
        }}
      />
    </Page>
  );
}
