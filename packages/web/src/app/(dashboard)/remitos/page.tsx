'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { api, type DocumentListItem, type DocumentListParams } from '@/lib/api';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Inbox, RefreshCw, Search } from 'lucide-react';
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

function RemitoCard({ doc, onClick }: { doc: DocumentListItem; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg border bg-card p-4 space-y-2 hover:bg-muted/50 active:bg-muted transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-sm leading-tight truncate">{doc.supplierName}</span>
        <StatusBadge status={doc.status} />
      </div>
      <p className="text-xs text-muted-foreground">
        Nro {doc.documentNumber} · {new Date(doc.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
      </p>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{doc.itemCount} {doc.itemCount === 1 ? 'ítem' : 'ítems'}</span>
        <span>{doc.overallConfidence}% confianza</span>
      </div>
    </button>
  );
}

function RemitoCardSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <Skeleton className="h-3 w-3/5" />
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}

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

  const { data, isLoading, isError, refetch } = useQuery({
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

  const hasFilters = !!(debouncedSearch || status !== 'all' || dateFrom || dateTo);

  function clearFilters() {
    setSearch('');
    setStatus('all');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  }

  const errorContent = (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <RefreshCw className="h-10 w-10 text-muted-foreground/50" />
      <p className="text-sm font-medium">No se pudo cargar</p>
      <p className="text-xs text-muted-foreground">
        La API está despertando. Puede tardar hasta un minuto.
      </p>
      <Button variant="outline" size="sm" onClick={() => { void refetch(); }}>
        Reintentar
      </Button>
    </div>
  );

  const emptyContent = hasFilters ? (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <Search className="h-10 w-10 text-muted-foreground/50" />
      <p className="text-sm font-medium">Sin resultados</p>
      <p className="text-xs text-muted-foreground">No encontramos remitos con esos filtros.</p>
      <Button variant="outline" size="sm" onClick={clearFilters}>
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
  );

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
        {hasFilters && (
          <Button variant="outline" onClick={clearFilters}>
            Limpiar filtros
          </Button>
        )}
      </div>

      {/* Mobile: cards apiladas (se ocultan en md+) */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <RemitoCardSkeleton key={i} />)
        ) : isError ? (
          errorContent
        ) : data?.items.length ? (
          data.items.map((doc) => (
            <RemitoCard
              key={doc.id}
              doc={doc}
              onClick={() => router.push(`/remitos/${doc.id}`)}
            />
          ))
        ) : (
          emptyContent
        )}
      </div>

      {/* Desktop: tabla (se oculta en mobile) */}
      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={isError ? [] : (data?.items ?? [])}
          isLoading={isLoading}
          onRowClick={(doc) => router.push(`/remitos/${doc.id}`)}
          emptyContent={isError ? errorContent : emptyContent}
        />
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{data.total} remitos — página {page} de {data.totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page === 1}>
              Anterior
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page === data.totalPages}>
              Siguiente
            </Button>
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
