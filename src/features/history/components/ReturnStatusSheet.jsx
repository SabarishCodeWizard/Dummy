/**
 * ReturnStatusSheet – viewReturnStatus(): every return record of one invoice with undo per return and
 * "Undo All Returns".
 *
 * Props: open (bool) · invoiceNo · partyName · returns (HistoryReturn[]) · onClose() ·
 *        onUndo(returnId) · onUndoAll() (callers confirm) · onAddReturn?() ("Add Return" footer button).
 */
import { Plus, RotateCcw, Undo2 } from 'lucide-react';
import { useMemo } from 'react';
import { formatCurrency, formatDateIN } from '@/core/format';
import { Button, EmptyState } from '@/ui';
import { dateMillis } from '../lib/dates';
import { sumReturnAmounts } from '../lib/lookups';
import { HistorySheet } from './HistorySheet';

export function ReturnStatusSheet({
  open,
  invoiceNo,
  partyName,
  returns,
  onClose,
  onUndo,
  onUndoAll,
  onAddReturn,
}) {
  const sorted = useMemo(
    () => [...returns].sort((a, b) => dateMillis(a.returnDate) - dateMillis(b.returnDate)),
    [returns],
  );
  return (
    <HistorySheet
      open={open}
      onClose={onClose}
      title={`Return Status - Invoice #${invoiceNo}`}
      actions={
        <>
          {onAddReturn ? (
            <Button variant="warning" icon={Plus} onClick={onAddReturn} className="flex-1 sm:flex-none">
              Add Return
            </Button>
          ) : null}
          {returns.length > 0 ? (
            <Button variant="danger" icon={Undo2} onClick={onUndoAll} className="flex-1 sm:flex-none">
              Undo All Returns
            </Button>
          ) : null}
        </>
      }
    >
      <div className="mb-4 rounded-2xl border border-white/10 surface-ink p-4 text-white shadow-lift">
        <p className="truncate font-display text-lg font-bold">{partyName}</p>
        <p className="text-sm text-brand-300">Total Returns: {returns.length}</p>
      </div>

      {returns.length === 0 ? (
        <EmptyState
          icon={RotateCcw}
          title="No return records found for this invoice."
          message="Returned items will be listed here."
          className="py-10"
        />
      ) : (
        <ul className="space-y-3">
          {sorted.map((item, index) => (
            <li
              key={`${item.id}-${index}`}
              className="rounded-2xl border border-l-[3px] border-line border-l-amber-400 bg-white p-3.5 text-sm text-slate-700 shadow-sm"
            >
              <div className="mb-2 flex items-center justify-between gap-2 border-b border-dashed border-slate-200 pb-2">
                <span className="font-display font-bold text-brand-800">Return #{index + 1}</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                  {formatDateIN(item.returnDate)}
                </span>
              </div>
              <p>
                <span className="font-semibold text-slate-500">Product: </span>
                {item.description}
              </p>
              <p>
                <span className="font-semibold text-slate-500">Quantity: </span>
                {item.qty}
              </p>
              <p>
                <span className="font-semibold text-slate-500">Rate: </span>₹{formatCurrency(item.rate)}
              </p>
              <p>
                <span className="font-semibold text-slate-500">Amount: </span>
                <span className="font-display font-extrabold text-amber-700 tabular-nums">
                  ₹{formatCurrency(item.returnAmount)}
                </span>
              </p>
              <p>
                <span className="font-semibold text-slate-500">Reason: </span>
                {item.reason || 'N/A'}
              </p>
              <div className="mt-2 flex justify-end">
                <Button variant="outline" size="sm" icon={Undo2} onClick={() => onUndo(item.id)}>
                  Undo This Return
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {returns.length > 0 ? (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-right font-display text-lg font-extrabold text-amber-700 tabular-nums">
          Total Return Amount: ₹{formatCurrency(sumReturnAmounts(returns))}
        </p>
      ) : null}
    </HistorySheet>
  );
}
