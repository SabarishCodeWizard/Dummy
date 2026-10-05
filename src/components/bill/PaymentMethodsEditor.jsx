/**
 * Cash / UPI / Account amounts paid on a bill (the web app's "Payment Methods" block) + the total paid.
 *
 * Props
 *  - values: { cash: string, upi: string, account: string }
 *  - onChange(values)           receives the whole object, e.g. `patch(values)` merges the three form fields
 *  - totalPaid: number          shown as "Total Amount Paid" (includes any later payments, computed by the caller)
 *  - totalLabel?: string        default "Total Amount Paid"
 *  - readOnly?: boolean
 */
import { Banknote, Building2, Smartphone } from 'lucide-react';
import { formatCurrency } from '@/core/format';
import { NumberField } from '@/ui';

const METHODS = [
  { key: 'cash', label: 'CASH', icon: Banknote, hint: 'Cash in hand' },
  { key: 'upi', label: 'UPI', icon: Smartphone, hint: 'GPay · PhonePe · Paytm' },
  { key: 'account', label: 'ACCOUNT', icon: Building2, hint: 'Bank transfer' },
];

export function PaymentMethodsEditor({
  values,
  onChange,
  totalPaid,
  totalLabel = 'Total Amount Paid',
  readOnly,
}) {
  return (
    <div>
      <div className="space-y-2">
        {METHODS.map(({ key, label, icon: Icon, hint }) => (
          <div
            key={key}
            className="flex items-center gap-3 rounded-xl border border-line bg-slate-50/70 p-2 pl-2.5 transition focus-within:border-gold-400 focus-within:bg-gold-50/50 focus-within:ring-4 focus-within:ring-gold-100"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gold-100 text-gold-700 ring-1 ring-gold-200">
              <Icon className="size-[18px]" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-[13px] font-bold tracking-wide text-slate-800">{label}</span>
              <span className="block truncate text-[11px] text-slate-500">{hint}</span>
            </span>
            <NumberField
              className="w-32 shrink-0 sm:w-36"
              inputClassName="font-semibold"
              aria-label={`${label.charAt(0)}${label.slice(1).toLowerCase()} amount paid`}
              value={values[key]}
              readOnly={readOnly}
              onChange={(v) => onChange({ ...values, [key]: v })}
            />
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-dashed border-slate-300 pt-3">
        <span className="text-sm font-bold text-slate-700">{totalLabel}</span>
        <span className="font-display text-lg font-extrabold text-emerald-600 tabular-nums">
          ₹{formatCurrency(totalPaid)}
        </span>
      </div>
    </div>
  );
}
