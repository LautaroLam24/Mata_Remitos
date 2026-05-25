import Link from "next/link";
import { Plus, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function RemitosPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Remitos</h1>
          <p className="text-sm text-muted-foreground">
            Historial de documentos procesados
          </p>
        </div>
        <Button asChild>
          <Link href="/remitos/nuevo">
            <Plus className="mr-2 h-4 w-4" />
            Nuevo
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 rounded-full bg-muted p-4">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-base font-medium">Sin remitos todavía</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Subí tu primer remito tomando una foto o cargando una imagen.
          </p>
          <Button asChild className="mt-6">
            <Link href="/remitos/nuevo">
              <Plus className="mr-2 h-4 w-4" />
              Subir primer remito
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
