'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { api, StockMovimiento, Producto } from '@/lib/api';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProductoForm } from '@/components/features/productos/ProductoForm';

function StockBadge({ stockOnHand, minStock }: { stockOnHand: number; minStock: number | null }) {
  if (stockOnHand <= 0) return <Badge variant="destructive">Sin stock</Badge>;
  if (minStock !== null && stockOnHand < minStock)
    return <Badge className="bg-yellow-500 text-white">En riesgo</Badge>;
  return <Badge className="bg-green-500 text-white">OK</Badge>;
}

const movimientoColumns: ColumnDef<StockMovimiento>[] = [
  {
    accessorKey: 'createdAt',
    header: 'Fecha',
    cell: ({ row }) =>
      new Date(row.original.createdAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }),
  },
  {
    accessorKey: 'type',
    header: 'Tipo',
    cell: ({ row }) => {
      const labels: Record<string, string> = { in: 'Entrada', out: 'Salida', adjustment: 'Ajuste' };
      return labels[row.original.type] ?? row.original.type;
    },
  },
  { accessorKey: 'reason', header: 'Razón' },
  {
    accessorKey: 'quantity',
    header: 'Cantidad',
    cell: ({ row }) => row.original.quantity.toLocaleString('es-AR'),
  },
  {
    id: 'balance',
    header: 'Balance',
    cell: ({ row }) =>
      `${row.original.balanceBefore.toLocaleString('es-AR')} → ${row.original.balanceAfter.toLocaleString('es-AR')}`,
  },
  {
    id: 'usuario',
    header: 'Usuario',
    cell: ({ row }) => row.original.user.name,
  },
];

export default function ProductoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['productos', id],
    queryFn: () => api.productos.getById(id),
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">Cargando...</div>;
  if (!data) return <div className="p-6 text-muted-foreground">Producto no encontrado.</div>;

  const productoForForm: Producto = {
    id: data.id,
    code: data.code,
    name: data.name,
    unit: data.unit,
    stockOnHand: data.stockOnHand,
    minStock: data.minStock,
    aliases: data.aliases,
    deletedAt: data.deletedAt,
    createdAt: data.createdAt,
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={() => router.back()}>
          ← Volver
        </Button>
        <h1 className="text-2xl font-semibold flex-1">{data.name}</h1>
        <Button onClick={() => setEditOpen(true)}>Editar</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Código</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-mono">{data.code}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Stock actual</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">
              {data.stockOnHand.toLocaleString('es-AR')} {data.unit}
            </p>
            <StockBadge stockOnHand={data.stockOnHand} minStock={data.minStock} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Stock mínimo</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl">
              {data.minStock !== null ? `${data.minStock.toLocaleString('es-AR')} ${data.unit}` : '—'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Alias</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {data.aliases.length ? data.aliases.join(', ') : '—'}
            </p>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-medium mb-3">Últimos movimientos de stock</h2>
        <DataTable
          columns={movimientoColumns}
          data={data.stockMovements}
          emptyMessage="Sin movimientos registrados."
        />
      </div>

      <ProductoForm
        open={editOpen}
        onClose={() => setEditOpen(false)}
        editing={productoForForm}
      />
    </div>
  );
}
