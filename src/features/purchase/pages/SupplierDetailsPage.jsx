/**
 * Supplier Details — replaces original-app/supplier-details.html + js/supplier-details.js.
 * Per-supplier totals built from the purchase bills: stats grid, search, table (desktop) / cards (phones, tablets),
 * revealable phone numbers and CSV export. `?phone=` opens the page already searching for that supplier.
 */
import { Download, FileText, Truck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { db } from '@/core/db';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { useRouteParams } from '@/hooks/useRouteParams';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Page,
  Pagination,
  RefreshButton,
  SearchBar,
  SectionHeader,
  useFeedback,
  usePagination,
} from '@/ui';
import { SupplierList } from '../components/SupplierList';
import { SupplierStatsGrid } from '../components/SupplierStatsGrid';
import { aggregateSuppliers, filterSuppliers, supplierStats } from '../supplierDetails';
import { exportSuppliersCsv } from '../supplierExport';

export default function SupplierDetailsPage() {
  const { toast } = useFeedback();
  const { params } = useRouteParams();
  const [bills, setBills] = useState([]);
  const [query, setQuery] = useState(() => (typeof params.phone === 'string' ? params.phone : ''));
  const [exporting, setExporting] = useState(false);

  const { loading, refreshing, error, refresh } = useFocusLoad(async () => {
    setBills(await db.getAllPurchaseBills());
  });

  const suppliers = useMemo(() => aggregateSuppliers(bills), [bills]);
  const stats = useMemo(() => supplierStats(suppliers), [suppliers]);
  const visible = useMemo(() => filterSuppliers(suppliers, query), [suppliers, query]);
  const pager = usePagination(visible, { resetKey: query });

  const onExport = async () => {
    if (suppliers.length === 0) {
      toast('Nothing to export', 'No supplier data to export.', 'warning');
      return;
    }
    setExporting(true);
    try {
      // like the original, the export covers every supplier, not just the searched ones
      await exportSuppliersCsv(suppliers);
    } catch (e) {
      console.error('Error exporting suppliers:', e);
      toast('Export failed', 'Could not export the supplier list.', 'error');
    } finally {
      setExporting(false);
    }
  };

  if (loading && bills.length === 0) {
    return (
      <Page title="Supplier Details" icon={Truck}>
        <LoadingState label="Loading supplier data…" />
      </Page>
    );
  }
  if (error && bills.length === 0) {
    return (
      <Page title="Supplier Details" icon={Truck}>
        <ErrorState message={`Error loading supplier data: ${error}`} onRetry={refresh} />
      </Page>
    );
  }

  return (
    <Page title="Supplier Details" icon={Truck} max="7xl">
      <div className="space-y-5">
        <div className="rounded-2xl border border-line bg-white p-2.5 shadow-card">
          <SearchBar
            value={query}
            onChange={setQuery}
            placeholder="Search by supplier name, phone, or address..."
            aria-label="Search suppliers"
          />
        </div>
        <SupplierStatsGrid stats={stats} />
        <SectionHeader
          title="Supplier List"
          icon={FileText}
          className="mb-0"
          right={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand" className="mr-1 tabular-nums">
                {visible.length}
              </Badge>
              <Button variant="secondary" icon={Download} loading={exporting} onClick={onExport}>
                Export
              </Button>
              <RefreshButton loading={refreshing} onClick={refresh} />
            </div>
          }
        />
        <div ref={pager.anchorRef} className="scroll-mt-32" />
        <SupplierList
          suppliers={pager.rows}
          empty={
            <EmptyState
              icon={Truck}
              title="No Suppliers Found"
              message={
                query.trim()
                  ? 'No supplier matches your search.'
                  : 'Start by creating purchase bills to see supplier data here'
              }
            />
          }
        />
        <Pagination pager={pager} noun="suppliers" />
      </div>
    </Page>
  );
}
