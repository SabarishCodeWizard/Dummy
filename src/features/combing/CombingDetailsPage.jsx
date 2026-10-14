import {
  Building2,
  ExternalLink,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';

import { digitsOnly } from '@/core/format';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
  Page,
  SearchBar,
  TextField,
  cn,
  useFeedback,
} from '@/ui';
import { emptyProcessor, filterProcessors, validateProcessor } from './combingLogic';
import { deleteProcessorRecord, getAllProcessorsList, saveProcessorRecord } from './combingService';

export default function CombingDetailsPage() {
  const { toast, confirm } = useFeedback();

  const [processors, setProcessors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');

  // Add / Edit Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProcessor, setEditingProcessor] = useState(null);
  const [form, setForm] = useState(emptyProcessor());
  const [saving, setSaving] = useState(false);

  const loadProcessors = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const list = await getAllProcessorsList();
      setProcessors(list || []);
    } catch (err) {
      console.error('Failed to load processors directory:', err);
      setError(err.message || 'Could not load processors.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadProcessors();
  }, [loadProcessors]);

  const filteredProcessors = useMemo(() => {
    return filterProcessors(processors, searchTerm);
  }, [processors, searchTerm]);

  const handleOpenAdd = () => {
    setEditingProcessor(null);
    setForm(emptyProcessor());
    setIsModalOpen(true);
  };

  const handleOpenEdit = (proc) => {
    setEditingProcessor(proc);
    setForm({
      id: proc.id,
      processorName: proc.processorName || proc.name || '',
      ownerName: proc.ownerName || '',
      phone: proc.phone || '',
      address: proc.address || '',
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    if (saving) return;

    const validation = validateProcessor(form);
    if (validation) {
      toast(validation.title, validation.message, 'error');
      return;
    }

    try {
      setSaving(true);
      await saveProcessorRecord(form);
      toast(
        editingProcessor ? 'Processor Updated' : 'Processor Added',
        `${form.processorName} has been saved to your directory.`,
        'success',
      );
      setIsModalOpen(false);
      loadProcessors(true);
    } catch (err) {
      toast('Save Failed', err.message || 'Could not save processor details.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (proc) => {
    const name = proc.processorName || proc.name;
    const ok = await confirm({
      title: `Delete ${name}?`,
      message: `Are you sure you want to remove "${name}" (${proc.ownerName}) from your processing directory?`,
      tone: 'danger',
      confirmText: 'Delete Processor',
    });
    if (!ok) return;

    try {
      await deleteProcessorRecord(proc.id || proc.phone);
      toast('Processor Removed', `${name} was removed.`, 'success');
      loadProcessors(true);
    } catch (err) {
      toast('Delete Failed', err.message || 'Could not delete processor.', 'error');
    }
  };

  if (loading && processors.length === 0) {
    return (
      <Page title="Processing Details" icon={Users}>
        <LoadingState label="Loading combing units directory…" />
      </Page>
    );
  }

  if (error && processors.length === 0) {
    return (
      <Page title="Processing Details" icon={Users}>
        <ErrorState message={error} onRetry={() => loadProcessors(false)} />
      </Page>
    );
  }

  return (
    <Page
      title={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Users className="size-6 text-brand-600" />
              <h1 className="font-display text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                Processing Details
              </h1>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
              Directory of combing mills, processing units, contact persons and addresses
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              icon={RefreshCw}
              onClick={() => loadProcessors(true)}
              loading={refreshing}
              title="Refresh processors"
            >
              Refresh
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Search & Stats Bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchBar
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search by mill name, owner, phone or address..."
            className="flex-1 max-w-lg"
          />
          <Badge
            tone="brand"
            className="self-start px-3 py-1.5 text-xs font-semibold tabular-nums sm:self-auto"
          >
            {searchTerm.trim()
              ? `${filteredProcessors.length} of ${processors.length} Processing Units`
              : `${processors.length} Processing Units`}
          </Badge>
        </div>

        {/* Directory Cards */}
        {filteredProcessors.length === 0 ? (
          <EmptyState
            icon={Building2}
            title={
              searchTerm.trim()
                ? 'No matching processing units'
                : 'No combing & processing units saved yet'
            }
            message={
              searchTerm.trim()
                ? `No processor matches "${searchTerm}". Try a different name or phone number.`
                : 'Add your combing mills and processing units to easily load them when creating batches.'
            }
            action={
              <Button variant="primary" icon={Plus} onClick={handleOpenAdd}>
                Add First Processor
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredProcessors.map((proc) => {
              const cleanPhone = digitsOnly(proc.phone || '');
              const name = proc.processorName || proc.name;
              return (
                <Card
                  key={proc.id || proc.phone || name}
                  className="group relative flex flex-col justify-between overflow-hidden p-5 transition duration-200 hover:-translate-y-1 hover:border-slate-300 hover:shadow-card"
                >
                  <div>
                    {/* Header: Mill Icon + Name & Owner */}
                    <div className="flex items-start gap-3">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 border border-slate-200">
                        <Building2 className="size-5 text-slate-700" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-display text-lg font-bold text-brand-900 truncate">
                          {name}
                        </h3>
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mt-0.5">
                          <User className="size-3.5 text-gold-600 shrink-0" />
                          <span className="truncate">{proc.ownerName || 'Contact Person N/A'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Contact & Address Box */}
                    <div className="mt-4 space-y-2 rounded-xl bg-slate-50/80 p-3 text-xs text-slate-600 border border-slate-100">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Phone className="size-3.5 text-gold-600 shrink-0" />
                          <span className="font-mono font-bold text-slate-900 tabular-nums">
                            {proc.phone || 'N/A'}
                          </span>
                        </div>
                        {cleanPhone && (
                          <div className="flex items-center gap-1">
                            <a
                              href={`tel:${cleanPhone}`}
                              className="rounded-lg p-1.5 text-slate-600 hover:bg-white hover:text-brand-800 transition"
                              title={`Call ${proc.phone}`}
                            >
                              <Phone className="size-3.5" />
                            </a>
                            <a
                              href={`https://wa.me/91${cleanPhone}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50 transition"
                              title={`WhatsApp ${proc.phone}`}
                            >
                              <MessageCircle className="size-3.5" />
                            </a>
                          </div>
                        )}
                      </div>

                      <div className="flex items-start gap-2">
                        <MapPin className="size-3.5 text-gold-600 shrink-0 mt-0.5" />
                        <span className="break-words leading-relaxed text-slate-600">
                          {proc.address || 'Address not specified'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions footer */}
                  <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3">
                    <Link
                      to={`/combing/batches?search=${encodeURIComponent(name)}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-800 transition"
                    >
                      <span>View Batches</span>
                      <ExternalLink className="size-3 text-slate-400" />
                    </Link>

                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="xs"
                        icon={Pencil}
                        onClick={() => handleOpenEdit(proc)}
                        aria-label={`Edit ${name}`}
                        className="text-slate-700 hover:bg-slate-100 border-slate-200"
                      >
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="xs"
                        icon={Trash2}
                        onClick={() => handleDelete(proc)}
                        aria-label={`Delete ${name}`}
                        className="text-slate-600 hover:bg-slate-100 hover:text-slate-900 border-slate-200"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Add Button */}
      <button
        type="button"
        onClick={handleOpenAdd}
        aria-label="Add New Processor"
        title="Add New Processor"
        className="no-print fixed right-5 bottom-[calc(4.6rem+env(safe-area-inset-bottom))] sm:bottom-6 z-30 flex size-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-xl border-2 border-white transition hover:bg-slate-800 active:scale-95 focus-visible:outline-none"
      >
        <Plus className="size-6 stroke-[2.5]" aria-hidden />
      </button>

      {/* Add / Edit Processor Modal */}
      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={
          <div className="flex items-center gap-2">
            <Building2 className="size-5 text-brand-600" />
            <span>
              {editingProcessor ? 'Edit Processing Details' : 'Add New Combing / Processing Unit'}
            </span>
          </div>
        }
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="processor-form"
              variant="primary"
              icon={editingProcessor ? Pencil : Plus}
              loading={saving}
            >
              {editingProcessor ? 'Save Changes' : 'Add Processor'}
            </Button>
          </div>
        }
      >
        <form id="processor-form" onSubmit={handleSave} className="space-y-4">
          <TextField
            label="Combing Mill / Unit Name *"
            value={form.processorName}
            onChange={(v) => setForm((prev) => ({ ...prev, processorName: v }))}
            placeholder="e.g. Sri Lakshmi Combing & Mills"
            leftIcon={Building2}
            autoFocus
          />

          <TextField
            label="Owner / Contact Person Name *"
            value={form.ownerName}
            onChange={(v) => setForm((prev) => ({ ...prev, ownerName: v }))}
            placeholder="e.g. Lakshmi Narayanan"
            leftIcon={User}
          />

          <TextField
            label="Phone / Mobile Number *"
            value={form.phone}
            onChange={(v) => setForm((prev) => ({ ...prev, phone: v }))}
            placeholder="10-digit mobile number"
            leftIcon={Phone}
            type="tel"
          />

          <TextField
            label="Address"
            value={form.address}
            onChange={(v) => setForm((prev) => ({ ...prev, address: v }))}
            placeholder="Mill / factory location or city"
            leftIcon={MapPin}
          />
        </form>
      </Modal>
    </Page>
  );
}
