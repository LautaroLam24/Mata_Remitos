'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { api, DocumentListItem, DocumentListParams } from '@/lib/api';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Inbox, Search } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { ExportButton } from '@/components/features/ExportButton';

const STATUS_LABELS: Record<string, string> = {
  all: 'Todos',
  processing: 'Procesando',
  review_needed: 'En revisión',
  approved: 'Aprobado',
  rejected: 'Rechazado',
};

const STATUS_VARIANTS: Record<string, string> = {
  approved: 'bg-green-500 text-white',
  rejected: 'bg-destructive text-destructive-foreground',
  review_needed: 'bg-yellow-500 text-white',
  processing: 'bg-muted text-muted-foreground',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge className={STATUS_VARIANTS[status] ?? 'bg-muted'}>
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

const columns: ColumnDef<DocumentListItem>[] = [
  {
    accessorKey: 'createdAt',
    header: 'Fecha',
    cell: ({ row }) =>
      new Date(row.original.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
  },
  { accessorKey: 'documentNumber', header: 'Número' },
  { accessorKey: 'supplierName', header: 'Proveedor' },
  { accessorKey: 'itemCount', header: 'Items' },
  {
    accessorKey: 'overallConfidence',
    header: 'Confianza',
    cell: ({ row }) => `${row.original.overallConfidence}%`,
  },
  {
    accessorKey: 'status',
    header: 'Estado',
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
];

function RemitosPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<NonNullable<DocumentListParams['status']>>(
    (searchParams.get('status') as NonNullable<DocumentListParams['status']>) ?? 'all',
  );
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading } = useQuery({
    queryKey: ['remitos', { page, search: debouncedSearch, status, dateFrom, dateTo }],
    queryFn: () =>
      api.remitos.list({
        page,
        status,
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {}),
      }),
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Remitos</h1>
        <div className="flex gap-2">
          <ExportButton
            filters={{
              status,
              ...(debouncedSearch ? { search: debouncedSearch } : {}),
              ...(dateFrom ? { dateFrom } : {}),
              ...(dateTo ? { dateTo } : {}),
            }}
            data={data?.items ?? []}
            totalDocs={data?.total ?? 0}
          />
          <Button onClick={() => router.push('/remitos/nuevo')}>Nuevo remito</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Buscar por número..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="max-w-xs"
        />
        <Select
          value={status}
          onValueChange={(v) => { setStatus(v as NonNullable<DocumentListParams['status']>); setPage(1); }}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(STATUS_LABELS).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          className="w-40"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          className="w-40"
        />
        {(search || status !== 'all' || dateFrom || dateTo) && (
          <Button
            variant="outline"
            onClick={() => { setSearch(''); setStatus('all'); setDateFrom(''); setDateTo(''); setPage(1); }}
          >
            Limpiar filtros
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        isLoading={isLoading}
        onRowClick={(doc) => router.push(`/remitos/${doc.id}`)}
        emptyContent={
          debouncedSearch || status !== 'all' || dateFrom || dateTo ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Search className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm font-medium">Sin resultados</p>
              <p className="text-xs text-muted-foreground">No encontramos remitos con esos filtros.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setSearch(''); setStatus('all'); setDateFrom(''); setDateTo(''); setPage(1); }}
              >
                Limpiar filtros
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Inbox className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm font-medium">Tu bandeja está vacía</p>
              <p className="text-xs text-muted-foreground">Empezá subiendo tu primer remito.</p>
              <Button size="sm" onClick={() => router.push('/remitos/nuevo')}>
                Subir remito
              </Button>
            </div>
          )
        }
      />

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{data.total} remitos — página {page} de {data.totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page === 1}>Anterior</Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page === data.totalPages}>Siguiente</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RemitosPage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">Cargando...</div>}>
      <RemitosPageInner />
    </Suspense>
  );
}
