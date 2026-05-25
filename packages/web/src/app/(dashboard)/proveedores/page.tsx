'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { api, Proveedor } from '@/lib/api';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProveedorForm } from '@/components/features/proveedores/ProveedorForm';
import { useDebounce } from '@/hooks/useDebounce';

const columns: ColumnDef<Proveedor>[] = [
  { accessorKey: 'name', header: 'Razón social' },
  { accessorKey: 'cuit', header: 'CUIT' },
  { accessorKey: 'email', header: 'Email', cell: ({ row }) => row.original.email ?? '—' },
  { accessorKey: 'phone', header: 'Teléfono', cell: ({ row }) => row.original.phone ?? '—' },
  { accessorKey: 'address', header: 'Dirección', cell: ({ row }) => row.original.address ?? '—' },
];

export default function ProveedoresPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Proveedor | null>(null);
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading } = useQuery({
    queryKey: ['proveedores', { page, search: debouncedSearch }],
    queryFn: () => api.proveedores.list({ page, ...(debouncedSearch ? { search: debouncedSearch } : {}) }),
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Proveedores</h1>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }}>Nuevo proveedor</Button>
      </div>

      <Input
        placeholder="Buscar por nombre o CUIT..."
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        className="max-w-sm"
      />

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        isLoading={isLoading}
        emptyMessage="No hay proveedores."
        onRowClick={(p) => { setEditing(p); setFormOpen(true); }}
      />

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{data.total} proveedores — página {page} de {data.totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page === 1}>Anterior</Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page === data.totalPages}>Siguiente</Button>
          </div>
        </div>
      )}

      <ProveedorForm open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }} editing={editing} />
    </div>
  );
}
