'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  AlertOctagon,
  Info,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api, type DashboardPeriod } from '@/lib/api';
import { authStore } from '@/lib/auth-store';
import { Skeleton } from '@/components/ui/skeleton';

// ── Constants ─────────────────────────────────────────────────────────────────

const PERIOD_LABELS: Record<DashboardPeriod, string> = {
  '7d': 'Últimos 7 días',
  '30d': 'Últimos 30 días',
  '3m': 'Últimos 3 meses',
  '6m': 'Últimos 6 meses',
  '12m': 'Últimos 12 meses',
};

const MONTH_SHORT: Record<string, string> = {
  '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic',
};

const TYPE_LABELS: Record<string, string> = {
  remito: 'Remito',
  factura_a: 'Factura A',
  factura_b: 'Factura B',
  factura_c: 'Factura C',
  nota_pedido: 'Nota de pedido',
  desconocido: 'Desconocido',
};

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

const PIE_COLORS = ['#16a34a', '#2563eb', '#ca8a04', '#dc2626', '#7c3aed', '#0891b2'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatArs(n: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
}

function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

function formatMonth(yyyyMM: string): string {
  const mm = yyyyMM.split('-')[1];
  return mm ? (MONTH_SHORT[mm] ?? mm) : yyyyMM;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

// ── Chart theme hook ──────────────────────────────────────────────────────────

function useChartTheme() {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  return {
    tooltipStyle: {
      background: dark ? 'hsl(0 0% 9%)' : '#ffffff',
      border: `1px solid ${dark ? 'hsl(0 0% 14.9%)' : '#e5e7eb'}`,
      borderRadius: 6,
      fontSize: 12,
      color: dark ? 'hsl(0 0% 98%)' : 'hsl(0 0% 3.9%)',
    } as React.CSSProperties,
    gridStroke: dark ? 'hsl(0 0% 14.9%)' : '#f0f0f0',
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function VariationBadge({ pct }: { pct: number }) {
  if (pct > 0)
    return (
      <span className="flex items-center gap-0.5 text-green-600 text-xs font-medium">
        <ArrowUpRight className="h-3 w-3" />+{pct}%
      </span>
    );
  if (pct < 0)
    return (
      <span className="flex items-center gap-0.5 text-red-500 text-xs font-medium">
        <ArrowDownRight className="h-3 w-3" />{pct}%
      </span>
    );
  return (
    <span className="flex items-center gap-0.5 text-muted-foreground text-xs">
      <Minus className="h-3 w-3" />Sin cambios
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [period, setPeriod] = useState<DashboardPeriod>('6m');
  const session = authStore.get();
  const chartTheme = useChartTheme();

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-metrics', period],
    queryFn: () => api.dashboard.metrics(period),
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          {session?.user?.name && (
            <p className="text-muted-foreground text-sm">
              Hola, {session.user.name.split(' ')[0]}. Acá está el resumen de actividad.
            </p>
          )}
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as DashboardPeriod)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PERIOD_LABELS) as DashboardPeriod[]).map((p) => (
              <SelectItem key={p} value={p}>
                {PERIOD_LABELS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1 — Remitos procesados */}
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-20 mb-2" />
                <Skeleton className="h-3 w-40" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <Link href="/remitos">
              <Card className="cursor-pointer transition-colors hover:bg-accent/50 h-full">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Remitos procesados</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{data?.kpis.totalDocuments.value ?? 0}</div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <VariationBadge pct={data?.kpis.totalDocuments.variationPct ?? 0} />
                    <span className="text-xs text-muted-foreground">
                      vs {data?.kpis.totalDocuments.previousValue ?? 0} anteriores
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>

            {/* Card 2 — Tiempo ahorrado */}
            <Card className="border-l-4 border-amber-500">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tiempo ahorrado</CardTitle>
                <Clock className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {formatMinutes(data?.kpis.timeSavedMinutes.value ?? 0)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  ≈ {formatArs(data?.kpis.timeSavedMinutes.estimatedSavingsArs ?? 0)} en sueldos
                </p>
              </CardContent>
            </Card>

            {/* Card 3 — Aprobados */}
            <Card className="cursor-pointer transition-colors hover:bg-accent/50">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Aprobados</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">
                  {data?.kpis.approvedDocuments.value ?? 0}
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {data && data.kpis.totalDocuments.value > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {Math.round(
                        (data.kpis.approvedDocuments.value / data.kpis.totalDocuments.value) * 100,
                      )}
                      % del total ·{' '}
                    </span>
                  )}
                  <VariationBadge pct={data?.kpis.approvedDocuments.variationPct ?? 0} />
                </div>
              </CardContent>
            </Card>

            {/* Card 4 — Pendientes */}
            <Link href="/remitos?status=review_needed">
              <Card
                className={`cursor-pointer transition-colors hover:bg-accent/50 h-full ${
                  (data?.kpis.pendingReview.value ?? 0) > 0 ? 'border-l-4 border-amber-500' : ''
                }`}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pendientes de revisión</CardTitle>
                  <AlertCircle
                    className={`h-4 w-4 ${
                      (data?.kpis.pendingReview.value ?? 0) > 0
                        ? 'text-amber-500'
                        : 'text-muted-foreground'
                    }`}
                  />
                </CardHeader>
                <CardContent>
                  <div
                    className={`text-3xl font-bold ${
                      (data?.kpis.pendingReview.value ?? 0) > 0 ? 'text-amber-600' : ''
                    }`}
                  >
                    {data?.kpis.pendingReview.value ?? 0}
                  </div>
                  {(data?.kpis.pendingReview.olderThanWeekCount ?? 0) > 0 ? (
                    <p className="text-xs text-amber-600 font-medium mt-1">
                      {data?.kpis.pendingReview.olderThanWeekCount} hace más de una semana
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1">Pendientes de aprobación</p>
                  )}
                </CardContent>
              </Card>
            </Link>
          </>
        )}
      </div>

      {/* Charts Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Chart A — Remitos por mes */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Remitos por mes</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : !data?.charts.documentsPerMonth.length ? (
              <p className="text-sm text-muted-foreground py-16 text-center">
                Sin datos para el período seleccionado.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.charts.documentsPerMonth} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} />
                  <XAxis
                    dataKey="month"
                    tickFormatter={formatMonth}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={chartTheme.tooltipStyle}
                    formatter={(value, name) => {
                      const labels: Record<string, string> = { approved: 'Aprobados', rejected: 'Rechazados', review: 'En revisión' };
                      return [value, labels[name as string] ?? name];
                    }}
                    labelFormatter={(label) => formatMonth(String(label))}
                  />
                  <Legend
                    formatter={(value) => {
                      const labels: Record<string, string> = { approved: 'Aprobados', rejected: 'Rechazados', review: 'En revisión' };
                      return labels[value] ?? value;
                    }}
                  />
                  <Bar dataKey="approved" stackId="a" fill="#16a34a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="review" stackId="a" fill="#ca8a04" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="rejected" stackId="a" fill="#dc2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Chart B — Top proveedores */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top proveedores</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : !data?.charts.topSuppliers.length ? (
              <p className="text-sm text-muted-foreground py-16 text-center">Sin datos.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  layout="vertical"
                  data={data.charts.topSuppliers}
                  margin={{ top: 0, right: 16, left: 4, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="supplierName"
                    width={130}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: string) => truncate(v, 20)}
                  />
                  <Tooltip
                    contentStyle={chartTheme.tooltipStyle}
                    formatter={(value, name) => {
                      const labels: Record<string, string> = { documentCount: 'Documentos', totalItems: 'Ítems' };
                      return [value, labels[name as string] ?? name];
                    }}
                  />
                  <Bar dataKey="documentCount" fill="#16a34a" radius={[0, 4, 4, 0]} name="documentCount" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Chart C — Top productos */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top productos recibidos</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : !data?.charts.topProducts.length ? (
              <p className="text-sm text-muted-foreground py-16 text-center">Sin datos.</p>
            ) : (
              <div className="space-y-2 py-1">
                {data.charts.topProducts.slice(0, 8).map((p, i) => {
                  const max = data.charts.topProducts[0]?.totalQuantity ?? 1;
                  const pct = Math.round((p.totalQuantity / max) * 100);
                  return (
                    <div key={p.productId} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-4 shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-0.5">
                          <span className="text-xs font-medium truncate max-w-[160px]" title={p.productName}>
                            {truncate(p.productName, 22)}
                          </span>
                          <span className="text-xs text-muted-foreground ml-2 shrink-0">
                            {p.totalQuantity % 1 === 0 ? p.totalQuantity.toFixed(0) : p.totalQuantity.toFixed(1)}
                            <span className="text-muted-foreground/60 ml-1">({p.documentCount} docs)</span>
                          </span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chart D — Tipos de documento */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tipos de documento</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            {isLoading ? (
              <Skeleton className="h-52 w-52 rounded-full" />
            ) : !data?.charts.documentTypeDistribution.length ? (
              <p className="text-sm text-muted-foreground py-16 text-center">Sin datos.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={data.charts.documentTypeDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="count"
                    nameKey="type"
                    labelLine={false}
                  >
                    {data.charts.documentTypeDistribution.map((_, idx) => (
                      <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length] ?? '#16a34a'} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={chartTheme.tooltipStyle}
                    formatter={(value, name) => [value, TYPE_LABELS[name as string] ?? name]}
                  />
                  <Legend
                    formatter={(value) => TYPE_LABELS[value] ?? value}
                    iconSize={10}
                    wrapperStyle={{ fontSize: 11 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Alerts panel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Alertas inteligentes</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : !data?.alerts.length ? (
              <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
                <CheckCircle className="h-8 w-8 text-green-500" />
                <p className="text-sm font-medium text-green-600">Todo en orden</p>
                <p className="text-xs text-muted-foreground">Sin alertas activas.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {data.alerts.map((alert, i) => {
                  const Icon =
                    alert.type === 'critical'
                      ? AlertOctagon
                      : alert.type === 'warning'
                        ? AlertTriangle
                        : Info;
                  const color =
                    alert.type === 'critical'
                      ? 'text-red-600 dark:text-red-400'
                      : alert.type === 'warning'
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-blue-600 dark:text-blue-400';
                  const bg =
                    alert.type === 'critical'
                      ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
                      : alert.type === 'warning'
                        ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
                        : 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800';
                  return (
                    <div
                      key={i}
                      className={`flex items-start gap-3 rounded-lg border p-3 ${bg}`}
                    >
                      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${color}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-semibold ${color}`}>{alert.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{alert.description}</p>
                      </div>
                      {alert.actionUrl && (
                        <Link href={alert.actionUrl}>
                          <Button variant="ghost" size="sm" className={`text-xs h-7 px-2 ${color}`}>
                            Ver
                          </Button>
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Actividad reciente</CardTitle>
          <Link href="/remitos">
            <Button variant="ghost" size="sm" className="text-xs h-7">
              Ver todos
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !data?.recentActivity.length ? (
            <p className="text-sm text-muted-foreground p-4">
              Aún no hay documentos. Subí tu primer remito para comenzar.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Tipo</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Número</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Proveedor</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Estado</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Hace</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentActivity.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b last:border-0 hover:bg-accent/40 transition-colors cursor-pointer"
                      onClick={() => {
                        window.location.href = `/remitos/${item.id}`;
                      }}
                    >
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className="text-xs font-normal">
                          {TYPE_LABELS[item.type] ?? item.type}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs">{item.documentNumber}</td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs max-w-[160px] truncate">
                        {item.supplierName}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge className={`text-xs ${STATUS_VARIANTS[item.status] ?? 'bg-muted'}`}>
                          {STATUS_LABELS[item.status] ?? item.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale: es })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
