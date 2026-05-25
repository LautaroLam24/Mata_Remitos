"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Package,
  Truck,
  ClipboardCheck,
  BarChart3,
  Plus,
  History,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navGroups = [
  {
    label: "General",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Operaciones",
    items: [
      { href: "/remitos/nuevo", label: "Nuevo remito", icon: Plus },
      { href: "/remitos", label: "Todos los remitos", icon: FileText },
      { href: "/remitos?status=review_needed", label: "Cola de revisión", icon: ClipboardCheck },
      { href: "/remitos?status=approved", label: "Historial", icon: History },
    ],
  },
  {
    label: "Gestión",
    items: [
      { href: "/productos", label: "Productos", icon: Package },
      { href: "/proveedores", label: "Proveedores", icon: Truck },
      { href: "/stock", label: "Alertas de stock", icon: BarChart3 },
    ],
  },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href.includes('?')) {
      return pathname + (typeof window !== 'undefined' ? window.location.search : '') === href;
    }
    return pathname === href || (href !== '/remitos' && pathname.startsWith(href + "/"));
  }

  return (
    <>
      {/* Overlay mobile */}
      {open && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r bg-card transition-transform duration-200 lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b px-6">
          <span className="text-lg font-bold tracking-tight">Mata Remitos</span>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={onClose}
            aria-label="Cerrar menú"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-4">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map(({ href, label, icon: Icon }) => {
                  const active = isActive(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={onClose}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
