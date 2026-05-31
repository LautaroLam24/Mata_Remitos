'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { api, Producto } from '@/lib/api';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProductoForm } from '@/components/features/productos/ProductoForm';
import { useDebounce } from '@/hooks/useDebounce';
import { Package, Search } from 'lucide-react';

function StockBadge({ stockOnHand, minStock }: { stockOnHand: number; minStock: number | null }) {
  if (stockOnHand <= 0) return <Badge variant="destructive">Sin stock</Badge>;
  if (minStock !== null && stockOnHand < minStock)
    return <Badge className="bg-yellow-500 text-white hover:bg-yellow-600">En riesgo</Badge>;
  return <Badge className="bg-green-500 text-white hover:bg-green-600">OK</Badge>;
}

export default function ProductosPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [lowStock, setLowStock] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Producto | null>(null);
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading } = useQuery({
    queryKey: ['productos', { page, search: debouncedSearch, lowStock }],
    queryFn: () => api.productos.list({ page, ...(debouncedSearch ? { search: debouncedSearch } : {}), lowStock }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.productos.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['productos'] }),
  });

  const columns: ColumnDef<Producto>[] = [
    { accessorKey: 'code', header: 'Código' },
    { accessorKey: 'name', header: 'Nombre' },
    { accessorKey: 'unit', header: 'Unidad' },
    {
      accessorKey: 'stockOnHand',
      header: 'Stock actual',
      cell: ({ row }) => row.original.stockOnHand.toLocaleString('es-AR'),
    },
    {
      accessorKey: 'minStock',
      header: 'Stock mínimo',
      cell: ({ row }) => row.original.minStock?.toLocaleString('es-AR') ?? '—',
    },
    {
      id: 'estado',
      header: 'Estado',
      cell: ({ row }) => (
        <StockBadge stockOnHand={row.original.stockOnHand} minStock={row.original.minStock} />
      ),
    },
    {
      id: 'acciones',
      header: '',
      cell: ({ row }) => (
        <div className="flex gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditing(row.original);
              setFormOpen(true);
            }}
          >
            Editar
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={row.original.stockOnHand > 0}
            title={row.original.stockOnHand > 0 ? 'Tiene stock, no se puede archivar' : 'Archivar'}
            onClick={() => {
              if (confirm('¿Archivar este producto?')) deleteMutation.mutate(row.original.id);
            }}
          >
            Archivar
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Productos</h1>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          Nuevo producto
        </Button>
      </div>

      <div className="flex gap-3">
        <Input
          placeholder="Buscar por nombre o código..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-sm"
        />
        <Button
          variant={lowStock ? 'default' : 'outline'}
          onClick={() => {
            setLowStock((v) => !v);
            setPage(1);
          }}
        >
          Solo stock bajo
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        isLoading={isLoading}
        onRowClick={(p) => router.push(`/productos/${p.id}`)}
        emptyContent={
          debouncedSearch || lowStock ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Search className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm font-medium">Sin resultados</p>
              <p className="text-xs text-muted-foreground">
                {lowStock ? 'No hay productos con stock bajo.' : 'No encontramos productos con esos términos.'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Package className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm font-medium">Sin productos</p>
              <p className="text-xs text-muted-foreground">Agregá tu primer producto al catálogo.</p>
              <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
                Nuevo producto
              </Button>
            </div>
          )
        }
      />

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {data.total} productos — página {page} de {data.totalPages}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page === 1}>
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page === data.totalPages}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}

      <ProductoForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        editing={editing}
      />
    </div>
  );
}
