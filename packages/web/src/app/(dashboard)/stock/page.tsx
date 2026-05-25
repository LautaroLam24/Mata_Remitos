'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api, StockAlertProduct } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function AlertCard({ product, variant }: { product: StockAlertProduct; variant: 'critical' | 'atRisk' }) {
  return (
    <Link href={`/productos/${product.id}`}>
      <Card className={`hover:shadow-md transition-shadow cursor-pointer border-l-4 ${variant === 'critical' ? 'border-l-destructive' : 'border-l-yellow-500'}`}>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <CardTitle className="text-base">{product.name}</CardTitle>
            {variant === 'critical'
              ? <Badge variant="destructive">Sin stock</Badge>
              : <Badge className="bg-yellow-500 text-white">En riesgo</Badge>}
          </div>
          <p className="text-xs text-muted-foreground font-mono">{product.code}</p>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between text-sm">
            <span>Stock actual</span>
            <span className={`font-semibold ${variant === 'critical' ? 'text-destructive' : 'text-yellow-600'}`}>
              {product.stockOnHand.toLocaleString('es-AR')} {product.unit}
            </span>
          </div>
          {product.minStock !== null && (
            <div className="flex justify-between text-sm text-muted-foreground mt-1">
              <span>Mínimo requerido</span>
              <span>{product.minStock.toLocaleString('es-AR')} {product.unit}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export default function StockPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['stock', 'alerts'],
    queryFn: () => api.stock.alerts(),
    refetchInterval: 60_000,
  });

  const critical = data?.critical ?? [];
  const atRisk = data?.atRisk ?? [];
  const total = critical.length + atRisk.length;

  if (isLoading) return <div className="p-6 text-muted-foreground">Cargando alertas...</div>;

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Alertas de stock</h1>
        {total === 0 && (
          <p className="text-muted-foreground mt-1">Todos los productos tienen stock suficiente.</p>
        )}
      </div>

      {critical.length > 0 && (
        <section>
          <h2 className="text-lg font-medium text-destructive mb-3">
            Crítico — Sin stock ({critical.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {critical.map((p) => (
              <AlertCard key={p.id} product={p} variant="critical" />
            ))}
          </div>
        </section>
      )}

      {atRisk.length > 0 && (
        <section>
          <h2 className="text-lg font-medium text-yellow-600 mb-3">
            En riesgo — Stock bajo mínimo ({atRisk.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {atRisk.map((p) => (
              <AlertCard key={p.id} product={p} variant="atRisk" />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
