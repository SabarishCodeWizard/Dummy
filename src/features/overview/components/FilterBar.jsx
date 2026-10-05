import { X } from 'lucide-react';

import { Button, Card, DateField, SearchBar } from '@/ui';

/**
 * The "search by date + search by name / reason + clear" row of the revenue and expenses pages.
 * `date` is YYYY-MM-DD or ''. Stacked on phones, one row from `sm` up.
 */
export default function FilterBar({ date, onDateChange, text, onTextChange, textPlaceholder, onClear }) {
  const filtering = !!date || !!text;
  return (
    <Card className="mb-5 border-line bg-white/80 p-3 sm:p-3.5">
      <div className="grid gap-2.5 sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:items-center">
        <DateField value={date} onChange={onDateChange} aria-label="Search by date" title="Search by Date" />
        <SearchBar
          value={text}
          onChange={onTextChange}
          placeholder={textPlaceholder}
          aria-label={textPlaceholder.replace('...', '')}
        />
        <Button
          variant="outlineDanger"
          icon={X}
          onClick={onClear}
          disabled={!filtering}
          className="max-sm:w-full"
        >
          Clear
        </Button>
      </div>
    </Card>
  );
}
