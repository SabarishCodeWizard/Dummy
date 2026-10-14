import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  Clock,
  Edit,
  Eye,
  FileText,
  Layers,
  Package,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import { formatCurrency, formatDateIN } from '@/core/format';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  Page,
  SearchBar,
  StatCard,
  useFeedback,
} from '@/ui';

import { CombingBatchModal } from './CombingBatchModal';
import { CombingChallanModal } from './CombingChallanModal';
import { CombingCompletionModal } from './CombingCompletionModal';
import { COMBING_STATUS, filterCombingBatches } from './combingLogic';
import { deleteCombingBatchRecord, loadCombingData, saveCombingBatchRecord } from './combingService';

const rupees = (n) => `₹${formatCurrency(n)}`;

export default function CombingPage({ openNew = false }) {
  const { toast, confirm } = useFeedback();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState({
    batches: [],
    shortcuts: [],
    stockMap: new Map(),
    processors: [],
    dyeingBatches: [],
    purchaseBills: [],
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState(null);

  const [isChallanOpen, setIsChallanOpen] = useState(false);
  const [challanBatch, setChallanBatch] = useState(null);

  const [isCompletionOpen, setIsCompletionOpen] = useState(false);
  const [completingBatch, setCompletingBatch] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await loadCombingData();
      setData(res);
    } catch (err) {
      console.error('Failed to load combing data:', err);
      setError(err.message || 'Failed to load combing batches.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle openNew prop (e.g. from /combing/new route)
  useEffect(() => {
    if (openNew) {
      setEditingBatch(null);
      setIsModalOpen(true);
    }
  }, [openNew]);

  const handleCloseModal = () => {
    setIsModalOpen(false);
    if (openNew) {
      navigate('/combing/batches', { replace: true });
    }
  };

  const handleSaved = () => {
    loadData();
    if (openNew) {
      navigate('/combing/batches', { replace: true });
    }
  };

  const filteredBatches = useMemo(() => {
    return filterCombingBatches(data.batches, searchTerm, statusFilter);
  }, [data.batches, searchTerm, statusFilter]);

  const kpis = useMemo(() => {
    let inProcessCount = 0;
    let completedCount = 0;
    let totalInputQty = 0;
    let totalOutputQty = 0;
    let totalExpenses = 0;

    data.batches.forEach((b) => {
      if (b.status === COMBING_STATUS.IN_PROCESS) inProcessCount++;
      if (b.status === COMBING_STATUS.COMPLETED) completedCount++;
      totalInputQty += parseFloat(b.input?.qty) || 0;
      totalOutputQty += parseFloat(b.totalOutputQty) || 0;
      totalExpenses += parseFloat(b.totalProcessingCost || b.input?.totalProcessingCost) || 0;
    });

    return {
      inProcessCount,
      completedCount,
      totalInputQty,
      totalOutputQty,
      totalExpenses,
    };
  }, [data.batches]);

  const handleOpenNew = () => {
    setEditingBatch(null);
    setIsModalOpen(true);
  };

  const handleEdit = (batch) => {
    setEditingBatch(batch);
    setIsModalOpen(true);
  };

  const handleViewChallan = (batch) => {
    setChallanBatch(batch);
    setIsChallanOpen(true);
  };

  const handleDelete = async (batch) => {
    const ok = await confirm({
      title: `Delete Combing Batch #${batch.batchId}?`,
      message:
        'Are you sure you want to delete this combing & processing batch? Any stock converted by this batch will be reverted.',
      tone: 'danger',
      confirmText: 'Delete Batch',
    });
    if (!ok) return;

    try {
      await deleteCombingBatchRecord(batch.batchId);
      toast('Batch Deleted', `Batch #${batch.batchId} has been removed.`, 'success');
      loadData();
    } catch (err) {
      toast('Delete Failed', err.message || 'Could not delete batch.', 'error');
    }
  };

  const handleCompleteBatch = (batch) => {
    setCompletingBatch(batch);
    setIsCompletionOpen(true);
  };

  return (
    <Page
      title={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="size-6 text-brand-600" />
              <h1 className="font-display text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                Combing & Processing
              </h1>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
              Dyed fabric dispatch, combing & finishing charges, weight loss calculation & combed stock conversion
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" icon={RefreshCw} onClick={loadData} title="Refresh batches">
              Refresh
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* KPI Strip */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard
            label="In Process"
            value={kpis.inProcessCount}
            icon={Clock}
            tone="warning"
            subtext="At combing mill"
          />
          <StatCard
            label="Completed Batches"
            value={kpis.completedCount}
            icon={CheckCircle2}
            tone="success"
            subtext="Combed stock received"
          />
          <StatCard
            label="Dyed Fabric Sent"
            value={`${kpis.totalInputQty} Rolls`}
            icon={Package}
            tone="brand"
            subtext="Dispatched for combing"
          />
          <StatCard
            label="Finished Combed Output"
            value={`${kpis.totalOutputQty} Rolls`}
            icon={TrendingUp}
            tone="brand"
            subtext="Added to live stock"
          />
          <StatCard
            label="Combing Charges"
            value={rupees(kpis.totalExpenses)}
            icon={Banknote}
            tone="info"
            subtext="Job work expenses"
            className="col-span-2 sm:col-span-1"
          />
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col items-stretch justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-2xs sm:flex-row sm:items-center">
          <div className="w-full sm:max-w-md">
            <SearchBar
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Search by Batch #, processor, fabric or product..."
            />
          </div>
          <div className="flex items-center gap-1.5 self-start overflow-x-auto pb-1 sm:self-auto sm:pb-0">
            {['ALL', COMBING_STATUS.IN_PROCESS, COMBING_STATUS.COMPLETED].map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  statusFilter === status
                    ? 'bg-brand-900 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {status === 'ALL'
                  ? 'All Batches'
                  : status === COMBING_STATUS.IN_PROCESS
                    ? 'In Process'
                    : 'Completed'}
              </button>
            ))}
          </div>
        </div>

        {/* Content Body */}
        {loading ? (
          <LoadingState message="Loading combing batches..." className="py-16" />
        ) : error ? (
          <ErrorState message={error} onRetry={loadData} />
        ) : filteredBatches.length === 0 ? (
          <EmptyState
            icon={Layers}
            title={
              searchTerm || statusFilter !== 'ALL'
                ? 'No matching combing batches found'
                : 'No combing batches yet'
            }
            description={
              searchTerm || statusFilter !== 'ALL'
                ? 'Try adjusting your search keywords or filter.'
                : 'Dispatch your dyed fabric for combing and processing to create finished combed rolls.'
            }
            action={
              <Button variant="primary" icon={Plus} onClick={handleOpenNew}>
                Create First Combing Batch
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {filteredBatches.map((batch) => {
              const isCompleted = batch.status === COMBING_STATUS.COMPLETED;
              return (
                <div
                  key={batch.batchId}
                  className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs transition hover:shadow-md"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="rounded bg-slate-900 px-2.5 py-1 font-mono text-sm font-bold text-white">
                        #{batch.batchId}
                      </span>
                      <span className="text-xs font-medium text-slate-500">
                        {formatDateIN(batch.batchDate)}
                      </span>
                      <Badge variant={isCompleted ? 'success' : 'warning'} className="text-xs">
                        {isCompleted ? 'Completed' : 'In Process'}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {!isCompleted && (
                        <Button
                          size="sm"
                          variant="primary"
                          icon={CheckCircle2}
                          onClick={() => handleCompleteBatch(batch)}
                          className="font-semibold text-xs py-1.5 bg-emerald-700 hover:bg-emerald-800"
                        >
                          Complete
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        icon={FileText}
                        onClick={() => handleViewChallan(batch)}
                        title="Print Challan"
                      >
                        Challan
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        icon={Edit}
                        onClick={() => handleEdit(batch)}
                        className="text-slate-700 hover:bg-slate-100 border-slate-200"
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        icon={Trash2}
                        onClick={() => handleDelete(batch)}
                        className="text-slate-600 hover:bg-slate-100 hover:text-slate-900 border-slate-200"
                        title="Delete Batch"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>

                  {/* Batch Details Grid */}
                  <div className="grid grid-cols-1 gap-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                        Combing Mill / Processor
                      </div>
                      <div className="mt-0.5 text-sm font-bold text-slate-800">
                        {batch.processorName}
                      </div>
                      {batch.processorPhone && (
                        <div className="mt-0.5 text-slate-500">{batch.processorPhone}</div>
                      )}
                    </div>

                    <div>
                      <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                        Dyed Fabric Dispatched
                      </div>
                      <div className="mt-0.5 font-medium text-slate-800">{batch.input?.description}</div>
                      <div className="mt-0.5 font-semibold text-slate-600">
                        {batch.input?.qty} Units @ {rupees(batch.input?.avgRate || batch.input?.rate || 0)} ={' '}
                        <span className="text-amber-800">
                          {rupees(batch.input?.totalCost || 0)}
                        </span>
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                        Combing & Processing Cost
                      </div>
                      <div className="mt-0.5 text-sm font-bold text-indigo-700">
                        {rupees(batch.totalProcessingCost || batch.input?.totalProcessingCost || 0)}
                      </div>
                      <div className="mt-0.5 text-slate-500">
                        {batch.processingRate || batch.input?.processingRate ? (
                          <span>
                            {rupees(batch.processingRate || batch.input?.processingRate)}/unit
                            {batch.weightLossPct || batch.input?.weightLossPct ? (
                              <span> • {batch.weightLossPct || batch.input?.weightLossPct}% loss</span>
                            ) : null}
                          </span>
                        ) : (
                          <span>{rupees(batch.totalProcessingCost || 0)}</span>
                        )}
                      </div>
                    </div>

                    <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-2.5">
                      <div className="text-[10px] font-semibold tracking-wider text-emerald-700 uppercase">
                        Finished Combed Goods
                      </div>
                      <div className="mt-0.5 space-y-1">
                        {(batch.output || []).map((out, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs">
                            <span className="mr-1 truncate font-medium text-slate-800">
                              {out.description}
                            </span>
                            <span className="shrink-0 font-mono font-bold text-emerald-800">
                              {out.qty} Units ({rupees(out.unitCost || 0)}/u)
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Add Button */}
      <button
        type="button"
        onClick={handleOpenNew}
        aria-label="New Combing Batch"
        title="New Combing Batch"
        className="no-print fixed right-5 bottom-[calc(4.6rem+env(safe-area-inset-bottom))] sm:bottom-6 z-30 flex size-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-xl border-2 border-white transition hover:bg-slate-800 active:scale-95 focus-visible:outline-none"
      >
        <Plus className="size-6 stroke-[2.5]" aria-hidden />
      </button>

      {/* Modals */}
      <CombingBatchModal
        open={isModalOpen}
        onClose={handleCloseModal}
        initialBatch={editingBatch}
        existingBatches={data.batches}
        shortcuts={data.shortcuts}
        stockMap={data.stockMap}
        dyeingBatches={data.dyeingBatches}
        purchaseBills={data.purchaseBills}
        processors={data.processors}
        onSaved={handleSaved}
      />

      <CombingChallanModal
        open={isChallanOpen}
        onClose={() => setIsChallanOpen(false)}
        batch={challanBatch}
      />

      <CombingCompletionModal
        open={isCompletionOpen}
        onClose={() => {
          setIsCompletionOpen(false);
          setCompletingBatch(null);
        }}
        batch={completingBatch}
        shortcuts={data.shortcuts}
        stockMap={data.stockMap}
        onCompleted={loadData}
      />
    </Page>
  );
}
