/**
 * Available Stocks — replaces original-app/stocks.html + js/stocks.js.
 * Financial summary tiles, searchable per-product stock (table → cards on phones), "Stock Details" history dialog and
 * the opening ("old") stock add / edit / delete flow.
 */
import { Boxes, SearchX } from 'lucide-react';
import { useMemo, useState } from 'react';

import { db } from '@/core/db';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { Card, DataTable, EmptyState, ErrorState, Page, SearchBar, useFeedback } from '@/ui';

import RefreshButton from '../components/RefreshButton';
import ShowMore from '../components/ShowMore';
import SkeletonRows from '../components/SkeletonRows';
import { usePagedRows } from '../components/paging';
import FinancialSummary from './FinancialSummary';
import OpeningStockModal from './OpeningStockModal';
import StockDetailModal from './StockDetailModal';
import { AvailableValue, OpeningValue, StockActions, StockCard } from './StockRowParts';
import { filterStocks } from './stocksLogic';
import { loadStocks } from './stocksService';

export default function StocksPage() {
  const { toast, confirm } = useFeedback();
  const [data, setData] = useState(null);
  const [search, setSearch] = useState('');
  const [historyRow, setHistoryRow] = useState(null);
  const [openingRow, setOpeningRow] = useState(null);

  const { loading, refreshing, error, refresh, reload } = useFocusLoad(async () => {
    try {
      setData(await loadStocks());
    } catch (e) {
      console.error('Error loading stocks:', e);
      throw new Error('Error loading stocks. Please try again.');
    }
  });

  const rows = useMemo(() => filterStocks(data?.rows ?? [], search), [data, search]);
  const paged = usePagedRows(rows, search);

  const saveOpening = async (description, qty) => {
    try {
      await db.saveOpeningStock(description, qty);
      toast('Saved!', 'Opening stock updated successfully.', 'success');
      setOpeningRow(null);
      await reload();
    } catch (e) {
      console.error('Error saving opening stock:', e);
      toast('Error', 'Failed to save opening stock.', 'error');
    }
  };

  const deleteOpening = async (row) => {
    const ok = await confirm({
      title: 'Are you sure?',
      message: `Do you want to delete the opening stock for "${row.description}"?`,
      tone: 'danger',
      confirmText: 'Yes, delete it!',
    });
    if (!ok) return;
    try {
      await db.deleteOpeningStock(row.description);
      toast('Deleted!', 'Opening stock has been deleted.', 'success');
      await reload();
    } catch (e) {
      console.error('Error deleting opening stock:', e);
      toast('Error', 'Failed to delete opening stock.', 'error');
    }
  };

  const actionsFor = (row) => ({
    row,
    onViewHistory: () => setHistoryRow(row),
    onEditOpening: () => setOpeningRow(row),
    onDeleteOpening: () => void deleteOpening(row),
  });

  const columns = [
    {
      key: 'product',
      header: 'Product Description',
      className: 'min-w-44 font-semibold text-brand-800',
      value: (r) => r.description,
    },
    { key: 'opening', header: 'Opening Stock', align: 'right', render: (r) => <OpeningValue row={r} /> },
    {
      key: 'purchased',
      header: 'Total Purchased Qty',
      align: 'right',
      className: 'tabular-nums text-slate-700',
      value: (r) => r.purchased,
    },
    {
      key: 'sold',
      header: 'Total Sold Qty',
      align: 'right',
      className: 'tabular-nums text-slate-700',
      value: (r) => r.sold,
    },
    {
      key: 'available',
      header: 'Available Stock',
      align: 'right',
      render: (r) => <AvailableValue row={r} showLabel />,
    },
    { key: 'actions', header: 'Details', render: (r) => <StockActions {...actionsFor(r)} compact /> },
  ];

  let body;
  if (loading) body = <SkeletonRows count={4} height="h-36" />;
  else if (error) body = <ErrorState message={error} onRetry={() => void reload()} />;
  else {
    const empty =
      !data || data.rows.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No stock data available."
          message="Products appear here once you record purchases or sales."
        />
      ) : (
        <EmptyState icon={SearchX} title="No matching products" message="Try a different search." />
      );
    body = (
      <>
        {data ? <FinancialSummary summary={data.summary} /> : null}
        <Card className="mb-4 bg-white/80 p-3 sm:p-3.5">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search by Product Description"
            aria-label="Search by product description"
          />
        </Card>
        <DataTable
          columns={columns}
          rows={paged.rows}
          rowKey={(r) => r.description}
          renderCard={(r) => <StockCard {...actionsFor(r)} />}
          empty={empty}
          dense
        />
        <ShowMore pager={paged.pager} noun="products" />
      </>
    );
  }

  return (
    <Page
      title="Available Stocks"
      icon={Boxes}
      actions={<RefreshButton onClick={refresh} refreshing={refreshing} />}
    >
      {body}
      <StockDetailModal row={historyRow} onClose={() => setHistoryRow(null)} />
      <OpeningStockModal row={openingRow} onClose={() => setOpeningRow(null)} onSave={saveOpening} />
    </Page>
  );
}
