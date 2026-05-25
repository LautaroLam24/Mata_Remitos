import { FileText, Package, ClipboardCheck, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const stats = [
  {
    title: "Remitos procesados",
    value: "—",
    description: "Este mes",
    icon: FileText,
  },
  {
    title: "En revisión",
    value: "—",
    description: "Pendientes de aprobación",
    icon: ClipboardCheck,
  },
  {
    title: "Productos activos",
    value: "—",
    description: "En catálogo",
    icon: Package,
  },
  {
    title: "Precisión OCR",
    value: "—",
    description: "Promedio últimos 30 días",
    icon: TrendingUp,
  },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Resumen de actividad de tu empresa</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Actividad reciente</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Los remitos procesados aparecerán acá. Subí tu primer remito para comenzar.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
