"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  LayoutDashboard,
  Upload,
  Clock,
  Package,
  Truck,
  AlertTriangle,
  FileText,
  Search,
} from "lucide-react";
import { api } from "@/lib/api";

interface SearchResults {
  remitos: Array<{ id: string; documentNumber: string; supplierName: string; status: string }>;
  productos: Array<{ id: string; name: string; code: string }>;
  proveedores: Array<{ id: string; name: string; cuit: string }>;
}

const QUICK_ACTIONS = [
  { id: "dashboard", label: "Ir al dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { id: "nuevo-remito", label: "Subir remito", icon: Upload, href: "/remitos/nuevo" },
  { id: "pendientes", label: "Ver pendientes de revisión", icon: Clock, href: "/remitos?status=review_needed" },
  { id: "productos", label: "Ver productos", icon: Package, href: "/productos" },
  { id: "proveedores", label: "Ver proveedores", icon: Truck, href: "/proveedores" },
  { id: "stock", label: "Alertas de stock", icon: AlertTriangle, href: "/stock" },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>({ remitos: [], productos: [], proveedores: [] });
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults({ remitos: [], productos: [], proveedores: [] });
      return;
    }
    setIsSearching(true);
    try {
      const [remitosRes, productosRes, proveedoresRes] = await Promise.allSettled([
        api.remitos.list({ search: q, limit: 5 }),
        api.productos.list({ search: q }),
        api.proveedores.list({ search: q }),
      ]);
      setResults({
        remitos:
          remitosRes.status === "fulfilled"
            ? remitosRes.value.items.slice(0, 5).map((r) => ({
                id: r.id,
                documentNumber: r.documentNumber,
                supplierName: r.supplierName,
                status: r.status,
              }))
            : [],
        productos:
          productosRes.status === "fulfilled"
            ? productosRes.value.items.slice(0, 5).map((p) => ({
                id: p.id,
                name: p.name,
                code: p.code,
              }))
            : [],
        proveedores:
          proveedoresRes.status === "fulfilled"
            ? proveedoresRes.value.items.slice(0, 5).map((p) => ({
                id: p.id,
                name: p.name,
                cuit: p.cuit,
              }))
            : [],
      });
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void search(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults({ remitos: [], productos: [], proveedores: [] });
    }
  }, [open]);

  function navigate(href: string) {
    router.push(href);
    onClose();
  }

  const hasResults =
    results.remitos.length > 0 || results.productos.length > 0 || results.proveedores.length > 0;
  const showQuickActions = !query.trim();

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(v) => !v && onClose()}
      label="Buscador global"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
      overlayClassName="fixed inset-0 bg-black/50"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-xl border bg-background shadow-2xl">
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="Buscar remitos, productos, proveedores..."
            className="flex h-11 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
          />
          {isSearching && (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          )}
        </div>

        <Command.List className="max-h-[400px] overflow-y-auto p-2">
          <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
            {query.trim() ? (
              <div className="space-y-1">
                <p>Sin resultados para &ldquo;{query}&rdquo;</p>
                <button
                  className="text-xs underline underline-offset-2"
                  onClick={() => navigate(`/remitos?search=${encodeURIComponent(query)}`)}
                >
                  Buscar en historial completo →
                </button>
              </div>
            ) : null}
          </Command.Empty>

          {showQuickActions && (
            <Command.Group heading="Acciones rápidas">
              {QUICK_ACTIONS.map((action) => (
                <Command.Item
                  key={action.id}
                  value={action.label}
                  onSelect={() => navigate(action.href)}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent aria-selected:bg-accent"
                >
                  <action.icon className="h-4 w-4 text-muted-foreground" />
                  {action.label}
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {results.remitos.length > 0 && (
            <Command.Group heading="Remitos">
              {results.remitos.map((r) => (
                <Command.Item
                  key={r.id}
                  value={`remito-${r.documentNumber}-${r.supplierName}`}
                  onSelect={() => navigate(`/remitos/${r.id}`)}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent aria-selected:bg-accent"
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{r.documentNumber}</span>
                    <span className="ml-2 text-muted-foreground">{r.supplierName}</span>
                  </div>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {results.productos.length > 0 && (
            <Command.Group heading="Productos">
              {results.productos.map((p) => (
                <Command.Item
                  key={p.id}
                  value={`producto-${p.name}-${p.code}`}
                  onSelect={() => navigate(`/productos/${p.id}`)}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent aria-selected:bg-accent"
                >
                  <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{p.name}</span>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{p.code}</span>
                  </div>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {results.proveedores.length > 0 && (
            <Command.Group heading="Proveedores">
              {results.proveedores.map((p) => (
                <Command.Item
                  key={p.id}
                  value={`proveedor-${p.name}-${p.cuit}`}
                  onSelect={() => navigate(`/proveedores`)}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent aria-selected:bg-accent"
                >
                  <Truck className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{p.name}</span>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{p.cuit}</span>
                  </div>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {!showQuickActions && !hasResults && !isSearching && query.trim() && null}
        </Command.List>

        <div className="border-t px-3 py-2 flex items-center gap-3 text-xs text-muted-foreground">
          <span><kbd className="rounded bg-muted px-1 py-0.5 font-mono">↑↓</kbd> navegar</span>
          <span><kbd className="rounded bg-muted px-1 py-0.5 font-mono">Enter</kbd> seleccionar</span>
          <span><kbd className="rounded bg-muted px-1 py-0.5 font-mono">Esc</kbd> cerrar</span>
        </div>
      </div>
    </Command.Dialog>
  );
}
