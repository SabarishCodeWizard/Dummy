/**
 * ReturnSheet – "Process Return - Invoice #x": pick products from the invoice (or a custom one), qty, rate,
 * reason; live summary of the new adjusted balance. Errors are shown inside the sheet.
 *
 * Props:
 *   open (bool) · invoiceNo · labels ({ party }) · partyName · invoiceDate · onClose()
 *   products   the invoice's product lines [{ description, qty (sold), rate }]
 *   balanceDue the invoice balance before returns
 *   returns    returns already stored for the invoice (HistoryReturn[])
 *   onSubmit({ returnDate, items }) => Promise<string | null>   string = inline error, null = saved
 */
import { Plus, Save } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatCurrency, formatDateIN, todayISO } from '@/core/format';
import { Button, DateField, cn } from '@/ui';
import { newReturnItem, returnSummary, returnedQtyByDescription } from '../lib/returns';
import { HistorySheet } from './HistorySheet';
import { ReturnItemEditor } from './ReturnItemEditor';

const rs = (n) => `₹${formatCurrency(n)}`;

function SummaryRow({ label, value, tone, bold }) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-3 py-0.5 text-sm',
        bold && 'mt-1.5 border-t border-gold-200 pt-2.5 font-bold',
      )}
    >
      <span className={bold ? 'text-brand-800' : 'text-slate-500'}>{label}</span>
      <span
        className={cn(
          'tabular-nums',
          bold ? 'font-display text-lg font-extrabold' : 'font-semibold',
          tone ?? 'text-brand-800',
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function ReturnSheet({
  open,
  invoiceNo,
  labels,
  partyName,
  invoiceDate,
  products,
  balanceDue,
  returns,
  onClose,
  onSubmit,
}) {
  const nextKey = useRef(1);
  const makeItem = useCallback(() => newReturnItem(`item-${nextKey.current++}`), []);
  const [returnDate, setReturnDate] = useState(todayISO());
  const [items, setItems] = useState(() => [makeItem()]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setReturnDate(todayISO());
      setItems([makeItem()]);
      setError(null);
      setBusy(false);
    }
  }, [open, makeItem]);

  const previousReturns = returns.reduce((sum, r) => sum + (Number(r.returnAmount) || 0), 0);
  const currentBalance = balanceDue - previousReturns;
  const { total, newAdjustedBalance } = returnSummary(items, currentBalance);
  const returned = returnedQtyByDescription(returns);
  const update = (key, next) => setItems((list) => list.map((i) => (i.key === key ? next : i)));

  const submit = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const failure = await onSubmit({ returnDate, items });
      if (failure) setError(failure);
    } finally {
      setBusy(false);
    }
  };

  return (
    <HistorySheet
      open={open}
      onClose={onClose}
      title={`Process Return - Invoice #${invoiceNo}`}
      size="lg"
      actions={
        <>
          <Button variant="outline" onClick={onClose} className="flex-1 sm:flex-none">
            Cancel
          </Button>
          <Button
            variant="warning"
            icon={Save}
            onClick={submit}
            loading={busy}
            className="flex-1 sm:flex-none"
          >
            Save Return
          </Button>
        </>
      }
    >
      <div className="mb-4 rounded-2xl border border-line bg-slate-50/70 p-3.5">
        <p className="font-display text-base font-bold text-brand-800">{`${labels.party}: ${partyName}`}</p>
        <p className="text-sm text-slate-500">Invoice Date: {formatDateIN(invoiceDate)}</p>
        {previousReturns > 0 ? (
          <p className="mt-0.5 text-sm font-bold text-amber-700">Previous Returns: {rs(previousReturns)}</p>
        ) : null}
      </div>

      <DateField label="Return Date" value={returnDate} onChange={setReturnDate} className="mb-4 max-w-xs" />

      <h3 className="mb-2 font-display text-base font-bold text-brand-800">Return Products</h3>
      {items.map((item, index) => (
        <ReturnItemEditor
          key={item.key}
          index={index}
          item={item}
          products={products}
          returnedQty={returned}
          onChange={(next) => update(item.key, next)}
          onRemove={() => setItems((list) => list.filter((i) => i.key !== item.key))}
        />
      ))}
      <Button
        variant="warning"
        icon={Plus}
        fullWidth
        onClick={() => setItems((list) => [...list, makeItem()])}
      >
        Add Return Item
      </Button>

      <div className="my-4 rounded-2xl border border-gold-200 bg-gold-50/60 p-3.5">
        <SummaryRow label="Original Balance Due:" value={rs(balanceDue)} />
        {previousReturns > 0 ? (
          <>
            <SummaryRow label="Previous Returns:" value={`-${rs(previousReturns)}`} tone="text-amber-700" />
            <SummaryRow label="Current Balance Before This Return:" value={rs(currentBalance)} />
          </>
        ) : null}
        <SummaryRow label="This Return Amount:" value={rs(total)} />
        <SummaryRow label="New Adjusted Balance Due:" value={rs(newAdjustedBalance)} bold />
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700"
        >
          {error}
        </p>
      ) : null}
    </HistorySheet>
  );
}
