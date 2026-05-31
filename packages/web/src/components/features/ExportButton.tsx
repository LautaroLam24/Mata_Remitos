'use client';

import { useState } from 'react';
import { Download, FileSpreadsheet, FileType, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { api, type DocumentListParams, type DocumentListItem } from '@/lib/api';

interface ExportButtonProps {
  filters: Omit<DocumentListParams, 'page' | 'limit'>;
  data?: DocumentListItem[];
  totalDocs?: number;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function timestamp(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
}

const STATUS_LABELS: Record<string, string> = {
  approved: 'Aprobado',
  rejected: 'Rechazado',
  review_needed: 'En revisión',
  processing: 'Procesando',
};

const TYPE_LABELS: Record<string, string> = {
  remito: 'Remito',
  factura_a: 'Factura A',
  factura_b: 'Factura B',
  factura_c: 'Factura C',
  nota_pedido: 'Nota de pedido',
  desconocido: 'Desconocido',
};

function generatePdf(
  data: DocumentListItem[],
  filters: Omit<DocumentListParams, 'page' | 'limit'>,
  totalDocs: number,
): void {
  // Dynamic import to avoid SSR issues with jsPDF
  void (async () => {
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const now = new Date();

    // ── Portada ──
    doc.setFontSize(24);
    doc.setTextColor('#16a34a');
    doc.text('Mata Remitos', 148, 40, { align: 'center' });

    doc.setFontSize(16);
    doc.setTextColor('#374151');
    doc.text('Reporte de Comprobantes', 148, 55, { align: 'center' });

    let periodo = 'Todos los períodos';
    if (filters.dateFrom && filters.dateTo) {
      periodo = `${filters.dateFrom} al ${filters.dateTo}`;
    } else if (filters.dateFrom) {
      periodo = `Desde ${filters.dateFrom}`;
    } else if (filters.dateTo) {
      periodo = `Hasta ${filters.dateTo}`;
    }

    doc.setFontSize(11);
    doc.setTextColor('#6b7280');
    doc.text(`Período: ${periodo}`, 148, 68, { align: 'center' });
    doc.text(
      `Generado: ${now.toLocaleDateString('es-AR')} ${now.toLocaleTimeString('es-AR')}`,
      148, 76, { align: 'center' },
    );
    doc.text(`Total de comprobantes: ${totalDocs}`, 148, 84, { align: 'center' });

    const activeFilters: string[] = [];
    if (filters.status && filters.status !== 'all') activeFilters.push(`Estado: ${STATUS_LABELS[filters.status] ?? filters.status}`);
    if (filters.search) activeFilters.push(`Búsqueda: ${filters.search}`);
    if (activeFilters.length > 0) {
      doc.setFontSize(9);
      doc.text(`Filtros: ${activeFilters.join(' | ')}`, 148, 94, { align: 'center' });
    }

    // ── Tabla detalle ──
    doc.addPage();

    autoTable(doc, {
      head: [['Fecha', 'Tipo', 'Proveedor', 'Número', 'Items', 'Confianza', 'Estado']],
      body: data.map((d) => [
        new Date(d.date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        TYPE_LABELS[d.type] ?? d.type,
        d.supplierName.length > 32 ? d.supplierName.slice(0, 30) + '…' : d.supplierName,
        d.documentNumber,
        String(d.itemCount),
        `${d.overallConfidence}%`,
        STATUS_LABELS[d.status] ?? d.status,
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [22, 163, 74], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [240, 253, 244] },
      didDrawPage: (hookData) => {
        doc.setFontSize(8);
        doc.setTextColor('#9ca3af');
        doc.text(
          `Mata Remitos — Página ${hookData.pageNumber ?? 1}`,
          148,
          doc.internal.pageSize.height - 8,
          { align: 'center' },
        );
      },
      margin: { top: 15 },
    });

    doc.save(`MataRemitos_Reporte_${timestamp()}.pdf`);
  })();
}

export function ExportButton({ filters, data = [], totalDocs = 0 }: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport(format: 'excel' | 'csv' | 'pdf'): Promise<void> {
    setIsExporting(true);
    try {
      if (format === 'excel') {
        const blob = await api.remitos.exportExcel(filters);
        downloadBlob(blob, `MataRemitos_Export_${timestamp()}.xlsx`);
      } else if (format === 'csv') {
        const blob = await api.remitos.exportCsv(filters);
        downloadBlob(blob, `MataRemitos_Export_${timestamp()}.csv`);
      } else {
        generatePdf(data, filters, totalDocs);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      alert(`Error al exportar: ${message}`);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={isExporting}>
          <Download className="mr-2 h-4 w-4" />
          {isExporting ? 'Exportando...' : 'Exportar'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => { void handleExport('excel'); }} disabled={isExporting}>
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Excel (.xlsx) — recomendado para contador
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => { void handleExport('csv'); }} disabled={isExporting}>
          <FileType className="mr-2 h-4 w-4" />
          CSV — para importar a otros sistemas
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => { void handleExport('pdf'); }} disabled={isExporting}>
          <FileText className="mr-2 h-4 w-4" />
          PDF — resumen para imprimir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
