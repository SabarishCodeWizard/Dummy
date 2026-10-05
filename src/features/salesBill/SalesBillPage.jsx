/**
 * Sales Bill screen — replaces original-app/sales.html + js/script.js (+ print / WhatsApp share from js/pdf.js).
 * Create a bill, or edit one when opened as /sales/bill?edit=<invoiceNo>.
 * Desktop: form on the left, calculation + payments + actions on the right (TwoPane).
 * Phones: stacked cards (product rows become cards) with a sticky action bar above the tab bar.
 * Logic lives in useSalesBill (session, lookup, save / generate / share / reset).
 */
import { Box, Receipt, ReceiptText, User, Zap } from 'lucide-react';
import { useEffect } from 'react';
import { InvoiceHeaderFields, ProductRowsEditor } from '@/components/bill';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { Card, ErrorState, LoadingState, Page, RefreshButton, SectionHeader, TwoPane } from '@/ui';
import { BillActionBar } from './BillActionBar';
import { EditBanner, SaveBadge } from './BillStatusBar';
import { CalculationSection } from './CalculationSection';
import { CustomerSection } from './CustomerSection';
import { useCustomerSummary } from './useCustomerSummary';
import { useSalesBill } from './useSalesBill';

export default function SalesBillPage() {
  const bill = useSalesBill();
  const { isExpanded } = useBreakpoint();
  const { form, session } = bill;
  const summary = useCustomerSummary({
    customerName: form.customerName,
    customerPhone: form.customerPhone,
    invoiceNo: form.invoiceNo.trim(),
    refreshKey: session.persistedNo,
  });

  // Ctrl/Cmd + S saves (desktop keyboards); the browser's own "save page" is suppressed on this screen.
  const { save } = bill;
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  if (!bill.ready) {
    return (
      <Page title="Sales Bill" icon={ReceiptText}>
        {bill.initialLoading || bill.refreshing ? (
          <LoadingState label="Loading billing system..." />
        ) : (
          <ErrorState
            message={bill.loadError ?? 'There was an error initializing the application. Please try again.'}
            onRetry={bill.refresh}
          />
        )}
      </Page>
    );
  }

  const editing = session.editingNo !== null;
  const actions = (layout) => (
    <BillActionBar
      layout={layout}
      saveLabel={bill.saveLabel}
      onSave={bill.save}
      onGenerate={bill.generate}
      onShare={bill.share}
    />
  );

  const main = (
    <>
      <EditBanner
        saved={session.saved}
        editingNo={session.editingNo}
        onNewBill={() => bill.reset(!session.saved)}
      />
      <Card className="relative animate-rise overflow-hidden">
        <span className="absolute inset-x-0 top-0 h-[3px] bg-gold-gradient" aria-hidden />
        <SectionHeader
          title="Invoice"
          icon={Receipt}
          right={
            <div className="flex items-center gap-2">
              {form.invoiceNo.trim() ? (
                <span className="rounded-lg bg-brand-800 px-2.5 py-1 font-display text-xs font-bold tracking-wide text-gold-300 tabular-nums">
                  #{form.invoiceNo.trim()}
                </span>
              ) : null}
              {editing ? null : <SaveBadge saved={session.saved} />}
            </div>
          }
        />
        <InvoiceHeaderFields
          last={bill.suggestion?.lastInvoiceNo ?? '-'}
          suggested={bill.suggestion?.nextInvoiceNo ?? '-'}
          cycleRestarted={bill.suggestion?.cycleRestarted}
          onApplySuggestion={bill.applySuggestion}
          invoiceNo={form.invoiceNo}
          onInvoiceNoChange={(invoiceNo) => bill.patch({ invoiceNo })}
          invoiceNoReadOnly={editing}
          date={form.invoiceDate}
          onDateChange={(invoiceDate) => bill.patch({ invoiceDate })}
        />
      </Card>
      <Card>
        <SectionHeader title="Bill to Party" icon={User} />
        <CustomerSection
          customers={bill.customers}
          phone={form.customerPhone}
          name={form.customerName}
          address={form.customerAddress}
          notFoundPhone={bill.lookup.notFoundPhone}
          onPhoneChange={bill.lookup.onPhoneChange}
          onSelect={bill.lookup.onSelect}
          summary={summary}
        />
      </Card>
      <Card>
        <SectionHeader title="Products" icon={Box} />
        <ProductRowsEditor
          rows={form.rows}
          shortcuts={bill.shortcuts}
          onChange={(rows) => bill.patch({ rows })}
        />
      </Card>
    </>
  );

  const side = (
    <>
      <CalculationSection form={form} totals={bill.totals} onChange={bill.patch} />
      {isExpanded ? (
        <Card>
          <SectionHeader title="Actions" icon={Zap} />
          {actions('panel')}
        </Card>
      ) : null}
    </>
  );

  return (
    <Page
      title="Sales Bill"
      icon={ReceiptText}
      max="7xl"
      actions={
        <RefreshButton
          onClick={bill.refresh}
          loading={bill.refreshing}
          aria-label="Refresh customers and invoice numbers"
          title="Refresh customers and invoice numbers"
        />
      }
    >
      <TwoPane main={main} side={side} />
      {isExpanded ? null : (
        <div className="no-print sticky bottom-[calc(3.7rem+env(safe-area-inset-bottom))] z-20 mt-4 rounded-2xl border border-line bg-white p-2 shadow-pop ring-1 ring-brand-900/5">
          {actions('bar')}
        </div>
      )}
    </Page>
  );
}
