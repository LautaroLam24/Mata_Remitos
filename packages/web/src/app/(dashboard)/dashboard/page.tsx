'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { FileText, Package, ClipboardCheck, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';

const STATUS_LABELS: Record<string, string> = {
  approved: 'Aprobado',
  rejected: 'Rechazado',
  review_needed: 'En revisión',
  processing: 'Procesando',
};

const STATUS_VARIANTS: Record<string, string> = {
  approved: 'bg-green-500 text-white',
  rejected: 'bg-destructive text-destructive-foreground',
  review_needed: 'bg-yellow-500 text-white',
  processing: 'bg-muted text-muted-foreground',
};

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-metrics'],
    queryFn: () => api.dashboard.metrics(),
    refetchInterval: 30_000,
  });

  const stats = [
    {
      title: 'Remitos este mes',
      value: isLoading ? '…' : String(data?.remitosThisMonth ?? 0),
      description: 'Cargados en el mes actual',
      icon: FileText,
      href: '/remitos',
    },
    {
      title: 'En revisión',
      value: isLoading ? '…' : String(data?.enRevision ?? 0),
      description: 'Pendientes de aprobación',
      icon: ClipboardCheck,
      href: '/remitos?status=review_needed',
    },
    {
      title: 'Productos activos',
      value: isLoading ? '…' : String(data?.productosActivos ?? 0),
      description: 'En catálogo',
      icon: Package,
      href: '/productos',
    },
    {
      title: 'Precisión OCR',
      value: isLoading ? '…' : data?.precisionOcr != null ? `${data.precisionOcr}%` : '—',
      description: 'Promedio últimos 30 días',
      icon: TrendingUp,
      href: null,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Resumen de actividad de tu empresa</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const card = (
            <Card key={stat.title} className={stat.href ? 'transition-colors hover:bg-accent/50 cursor-pointer' : ''}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">{stat.description}</p>
              </CardContent>
            </Card>
          );
          return stat.href ? (
            <Link key={stat.title} href={stat.href}>{card}</Link>
          ) : (
            card
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Actividad reciente</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : !data?.recentActivity.length ? (
            <p className="text-sm text-muted-foreground">
              Aún no hay remitos. Subí tu primer remito para comenzar.
            </p>
          ) : (
            <div className="divide-y">
              {data.recentActivity.map((item) => (
                <Link
                  key={item.id}
                  href={`/remitos/${item.id}`}
                  className="flex items-center justify-between py-3 hover:bg-accent/40 px-1 rounded transition-colors"
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">{item.documentNumber}</p>
                    <p className="text-xs text-muted-foreground">{item.supplierName}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {new Date(item.createdAt).toLocaleDateString('es-AR', {
                        day: '2-digit',
                        month: '2-digit',
                      })}
                    </span>
                    <Badge className={STATUS_VARIANTS[item.status] ?? 'bg-muted'}>
                      {STATUS_LABELS[item.status] ?? item.status}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
