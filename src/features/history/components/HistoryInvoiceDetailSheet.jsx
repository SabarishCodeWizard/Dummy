/**
 * HistoryInvoiceDetailSheet – full detail of one invoice (summary, products, history links, every action).
 * Opened by clicking a table row on desktop.
 *
 * Props: invoice (HistoryInvoice | null; null = closed) · labels ({ party, formatInvoiceNo? }) ·
 *        actions (HistoryInvoiceActions) · onClose().
 * The page should pass actions that close the sheet first (a stacked dialog would hide toasts / confirms).
 */
import { formatCurrency, formatDateIN } from '@/core/format';
import { displayInvoiceNo } from '../lib/types';
import { HistorySheet } from './HistorySheet';
import {
  InvoiceActionButtons,
  InvoiceHistoryLinks,
  InvoiceProducts,
  InvoiceStatusBadge,
  InvoiceSummaryBox,
  PaidProgress,
} from './InvoiceParts';

export function HistoryInvoiceDetailSheet({ invoice, labels, actions, onClose }) {
  return (
    <HistorySheet
      open={!!invoice}
      onClose={onClose}
      title={invoice ? `Invoice #${displayInvoiceNo(labels, invoice.invoiceNo)}` : ''}
      size="lg"
    >
      {invoice ? (
        <>
          <div className="rounded-2xl border border-white/10 surface-ink p-4 text-white shadow-lift">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold tracking-[0.08em] text-brand-300 uppercase">
                  {labels.party}
                </p>
                <p className="truncate font-display text-lg font-bold">{invoice.partyName}</p>
                <p className="text-xs text-brand-300">{formatDateIN(invoice.invoiceDate)}</p>
              </div>
              <InvoiceStatusBadge invoice={invoice} />
            </div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold tracking-[0.08em] text-brand-300 uppercase">Total</p>
                <p className="font-display text-3xl leading-tight font-extrabold text-gold-300 tabular-nums">
                  ₹{formatCurrency(invoice.grandTotal)}
                </p>
              </div>
              <p className="text-right text-xs font-semibold text-brand-200 tabular-nums">
                Paid ₹{formatCurrency(invoice.amountPaid)}
              </p>
            </div>
            <PaidProgress invoice={invoice} className="mt-3 [&>div]:bg-white/15 [&>span]:text-brand-300" />
          </div>
          <InvoiceSummaryBox invoice={invoice} />
          <h3 className="mb-1.5 text-[13px] font-bold tracking-wide text-slate-600">Products</h3>
          <InvoiceProducts invoice={invoice} />
          <InvoiceHistoryLinks
            invoice={invoice}
            onViewPayments={() => actions.viewPayments(invoice.invoiceNo)}
            onViewReturns={() => actions.viewReturns(invoice.invoiceNo)}
          />
          <InvoiceActionButtons invoice={invoice} actions={actions} />
        </>
      ) : null}
    </HistorySheet>
  );
}
