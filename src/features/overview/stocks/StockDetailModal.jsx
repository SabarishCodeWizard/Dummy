import { PackageMinus, PackagePlus } from 'lucide-react';
import { useRef } from 'react';

import { formatRupees } from '@/core/format';
import { Button, DataTable, Modal, cn } from '@/ui';

import { AvailableValue, OpeningValue } from './StockRowParts';
import { historyDate, historyInvoiceNo, historyTotal } from './stocksLogic';

const PURCHASE = {
  title: 'Purchase History',
  party: 'Supplier',
  empty: 'No purchases found.',
  Icon: PackagePlus,
  tile: 'bg-emerald-50 text-emerald-600 ring-emerald-200',
  heading: 'text-emerald-800',
};
const SALES = {
  title: 'Sales History',
  party: 'Customer',
  empty: 'No sales found.',
  Icon: PackageMinus,
  tile: 'bg-sky-50 text-sky-600 ring-sky-200',
  heading: 'text-sky-800',
};

function SummaryItem({ label, children }) {
  return (
    <div className="min-w-0 text-center">
      <dt className="text-[10px] font-bold tracking-[0.08em] text-slate-500 uppercase">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

function HistorySection({ kind, entries }) {
  const columns = [
    { key: 'date', header: 'Date', className: 'whitespace-nowrap', value: (e) => historyDate(e.date) },
    { key: 'invoice', header: 'Invoice No', value: (e) => historyInvoiceNo(e.invoiceNo) },
    { key: 'party', header: kind.party, value: (e) => e.party },
    { key: 'qty', header: 'Qty', align: 'right', className: 'tabular-nums', value: (e) => e.qty },
    {
      key: 'rate',
      header: 'Rate',
      align: 'right',
      className: 'tabular-nums',
      value: (e) => formatRupees(e.rate),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      className: 'font-semibold tabular-nums',
      value: (e) => formatRupees(e.amount),
    },
  ];
  return (
    <section className="mb-6 last:mb-0">
      <h3 className={cn('mb-3 flex items-center gap-2.5 text-base font-bold', kind.heading)}>
        <span
          className={cn('flex size-8 items-center justify-center rounded-lg ring-1 ring-inset', kind.tile)}
        >
          <kind.Icon className="size-[18px]" aria-hidden />
        </span>
        {kind.title}
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 tabular-nums">
          {entries.length}
        </span>
      </h3>
      <DataTable
        columns={columns}
        rows={entries}
        rowKey={(_, i) => i}
        dense
        empty={<p className="py-6 text-center text-sm text-slate-500">{kind.empty}</p>}
        renderCard={(e) => (
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">{historyDate(e.date)}</span>
              <span className="font-display font-bold text-brand-800">#{historyInvoiceNo(e.invoiceNo)}</span>
            </div>
            <div className="text-slate-800">
              {kind.party}: {e.party}
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 tabular-nums">
                {e.qty} × {formatRupees(e.rate)}
              </span>
              <span className="font-display font-bold text-brand-800 tabular-nums">
                {formatRupees(e.amount)}
              </span>
            </div>
          </div>
        )}
        footer={
          <div className="flex justify-between font-display font-bold text-brand-800">
            <span>Total</span>
            <span className="text-base tabular-nums">{formatRupees(historyTotal(entries))}</span>
          </div>
        }
      />
    </section>
  );
}

/** The original "Stock Details" modal: purchase history and sales history of one product. `row` null = closed. */
export default function StockDetailModal({ row, onClose }) {
  // keep the content while the dialog is closing / for the title
  const last = useRef(null);
  if (row) last.current = row;
  const shown = row ?? last.current;
  return (
    <Modal
      open={row !== null}
      onClose={onClose}
      title={shown?.description ?? 'Product Details'}
      size="lg"
      footer={
        <Button variant="secondary" onClick={onClose} className="max-sm:w-full">
          Close
        </Button>
      }
    >
      {shown ? (
        <>
          <dl className="mb-6 grid grid-cols-2 gap-2 rounded-2xl bg-gold-50/60 p-3 ring-1 ring-gold-100 sm:grid-cols-4">
            <SummaryItem label="Opening">
              <OpeningValue row={shown} />
            </SummaryItem>
            <SummaryItem label="Purchased">
              <span className="font-semibold text-slate-800 tabular-nums">{shown.purchased}</span>
            </SummaryItem>
            <SummaryItem label="Sold">
              <span className="font-semibold text-slate-800 tabular-nums">{shown.sold}</span>
            </SummaryItem>
            <SummaryItem label="Available">
              <AvailableValue row={shown} showLabel />
            </SummaryItem>
          </dl>
          <HistorySection kind={PURCHASE} entries={shown.purchaseHistory} />
          <HistorySection kind={SALES} entries={shown.salesHistory} />
        </>
      ) : null}
    </Modal>
  );
}
