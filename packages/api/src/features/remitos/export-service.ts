import ExcelJS from 'exceljs';
import { db } from '../../infrastructure/db.js';
import type { Prisma } from '@prisma/client';

export type ExportFilters = {
  tenantId: string;
  status?: string | undefined;
  supplierId?: string | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
  search?: string | undefined;
};

type DocRow = Awaited<ReturnType<typeof fetchDocs>>[number];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateAr(d: Date): string {
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function extractPuntoDeVenta(documentNumber: string): string {
  const match = documentNumber.match(/^(\d{4})-\d+$/);
  return match?.[1] ?? '';
}

function csvEscape(val: string): string {
  if (val.includes(';') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function formatDecimalAr(n: number): string {
  return n.toString().replace('.', ',');
}

// ─── Data fetch ───────────────────────────────────────────────────────────────

async function fetchDocs(filters: ExportFilters) {
  const where: Prisma.DocumentWhereInput = {
    tenantId: filters.tenantId,
    deletedAt: null,
    ...(filters.status && filters.status !== 'all' ? { status: filters.status } : {}),
    ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
    ...(filters.search
      ? { documentNumber: { contains: filters.search, mode: 'insensitive' } }
      : {}),
    ...(filters.dateFrom ?? filters.dateTo
      ? {
          date: {
            ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
            ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
          },
        }
      : {}),
  };

  return db.document.findMany({
    where,
    orderBy: { date: 'desc' },
    include: {
      supplier: { select: { name: true, cuit: true } },
      items: {
        where: { deletedAt: null },
        include: { product: { select: { name: true, code: true } } },
      },
      uploadedBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
    },
  });
}

// ─── Sheet 1 row ──────────────────────────────────────────────────────────────

function sheet1Row(doc: DocRow) {
  return {
    estado: doc.status,
    tipo: doc.type,
    fechaEmision: formatDateAr(doc.date),
    proveedor: doc.supplier.name,
    cuitProveedor: doc.supplier.cuit,
    ptoVenta: extractPuntoDeVenta(doc.documentNumber),
    numero: doc.documentNumber,
    items: doc.items.length,
    confianza: doc.overallConfidence,
    aprobadoPor: doc.approvedBy?.name ?? '',
    fechaAprobacion: doc.approvedAt ? formatDateAr(doc.approvedAt) : '',
  };
}

// ─── ExcelJS styling helpers ──────────────────────────────────────────────────

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF16A34A' },
};
const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: 'FFFFFFFF' },
  size: 11,
};
const ZEBRA_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF0FDF4' },
};

function styleHeader(ws: ExcelJS.Worksheet, colCount: number): void {
  const row = ws.getRow(1);
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
  }
  row.commit();
}

function addZebraRow(ws: ExcelJS.Worksheet, values: (string | number)[], rowIndex: number, colCount: number): void {
  const row = ws.addRow(values);
  if (rowIndex % 2 === 0) {
    for (let c = 1; c <= colCount; c++) {
      row.getCell(c).fill = ZEBRA_FILL;
    }
  }
  row.commit();
}

// ─── Sheet builders ───────────────────────────────────────────────────────────

function buildSheet1(wb: ExcelJS.Workbook, docs: DocRow[]): void {
  const ws = wb.addWorksheet('Comprobantes');
  const cols = [
    { header: 'Estado', key: 'estado', width: 14 },
    { header: 'Tipo', key: 'tipo', width: 16 },
    { header: 'Fecha emisión', key: 'fechaEmision', width: 14 },
    { header: 'Proveedor', key: 'proveedor', width: 30 },
    { header: 'CUIT proveedor', key: 'cuitProveedor', width: 18 },
    { header: 'Punto de venta', key: 'ptoVenta', width: 10 },
    { header: 'Número', key: 'numero', width: 16 },
    { header: 'Items', key: 'items', width: 8 },
    { header: 'Confianza (%)', key: 'confianza', width: 12 },
    { header: 'Aprobado por', key: 'aprobadoPor', width: 20 },
    { header: 'Fecha aprobación', key: 'fechaAprobacion', width: 14 },
  ] as ExcelJS.Column[];
  ws.columns = cols;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  styleHeader(ws, cols.length);

  docs.forEach((doc, i) => {
    const d = sheet1Row(doc);
    addZebraRow(ws, [d.estado, d.tipo, d.fechaEmision, d.proveedor, d.cuitProveedor, d.ptoVenta, d.numero, d.items, d.confianza, d.aprobadoPor, d.fechaAprobacion], i, cols.length);
  });
}

function buildSheet2(wb: ExcelJS.Workbook, docs: DocRow[]): void {
  const ws = wb.addWorksheet('Items');
  const cols = [
    { header: 'Comprobante', key: 'comprobante', width: 24 },
    { header: 'Fecha doc', key: 'fechaDoc', width: 14 },
    { header: 'Proveedor', key: 'proveedor', width: 30 },
    { header: 'Descripción raw', key: 'descripcion', width: 36 },
    { header: 'Producto matcheado', key: 'producto', width: 30 },
    { header: 'Código', key: 'codigo', width: 14 },
    { header: 'Cantidad', key: 'cantidad', width: 12 },
    { header: 'Unidad', key: 'unidad', width: 10 },
    { header: 'Precio unitario', key: 'precio', width: 16 },
    { header: 'Confianza item (%)', key: 'confianzaItem', width: 18 },
    { header: 'Match score (%)', key: 'matchScore', width: 16 },
    { header: 'Match status', key: 'matchStatus', width: 14 },
  ] as ExcelJS.Column[];
  ws.columns = cols;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  styleHeader(ws, cols.length);

  let rowIdx = 0;
  docs.forEach((doc) => {
    const comprobante = `${doc.type} ${doc.documentNumber}`;
    const fechaDoc = formatDateAr(doc.date);
    doc.items.forEach((item) => {
      addZebraRow(ws, [
        comprobante,
        fechaDoc,
        doc.supplier.name,
        item.rawDescription,
        item.product?.name ?? '',
        item.product?.code ?? '',
        Number(item.quantity),
        item.unit,
        item.unitPrice != null ? Number(item.unitPrice) : '',
        item.confidenceScore ?? '',
        item.matchScore ?? '',
        item.matchStatus,
      ], rowIdx, cols.length);
      rowIdx++;
    });
  });
}

function buildSheet3(wb: ExcelJS.Workbook, docs: DocRow[]): void {
  const ws = wb.addWorksheet('Resumen por proveedor');
  const cols = [
    { header: 'Razón social', key: 'nombre', width: 30 },
    { header: 'CUIT', key: 'cuit', width: 18 },
    { header: 'Comprobantes', key: 'count', width: 14 },
    { header: 'Total items', key: 'items', width: 12 },
    { header: 'Última carga', key: 'ultimaCarga', width: 14 },
  ] as ExcelJS.Column[];
  ws.columns = cols;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  styleHeader(ws, cols.length);

  const map = new Map<string, { name: string; cuit: string; count: number; items: number; lastDate: Date }>();
  docs.forEach((doc) => {
    const key = doc.supplierId;
    const entry = map.get(key);
    if (entry) {
      entry.count++;
      entry.items += doc.items.length;
      if (doc.date > entry.lastDate) entry.lastDate = doc.date;
    } else {
      map.set(key, { name: doc.supplier.name, cuit: doc.supplier.cuit, count: 1, items: doc.items.length, lastDate: doc.date });
    }
  });

  const sorted = [...map.values()].sort((a, b) => b.count - a.count);
  sorted.forEach((e, i) => {
    addZebraRow(ws, [e.name, e.cuit, e.count, e.items, formatDateAr(e.lastDate)], i, cols.length);
  });

  const totalRow = ws.addRow(['TOTAL', '', sorted.reduce((s, e) => s + e.count, 0), sorted.reduce((s, e) => s + e.items, 0), '']);
  for (let c = 1; c <= cols.length; c++) totalRow.getCell(c).font = { bold: true };
  totalRow.commit();
}

function buildSheet4(wb: ExcelJS.Workbook, docs: DocRow[]): void {
  const ws = wb.addWorksheet('Resumen por producto');
  const cols = [
    { header: 'Código', key: 'codigo', width: 16 },
    { header: 'Nombre producto', key: 'nombre', width: 36 },
    { header: 'Cantidad total recibida', key: 'cantidad', width: 22 },
    { header: 'En comprobantes', key: 'enDocs', width: 18 },
    { header: 'Precio prom. unitario', key: 'precioPromedio', width: 22 },
  ] as ExcelJS.Column[];
  ws.columns = cols;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  styleHeader(ws, cols.length);

  const map = new Map<string, { code: string; name: string; qty: number; docIds: Set<string>; priceSum: number; priceCnt: number }>();
  docs.forEach((doc) => {
    doc.items.forEach((item) => {
      const key = item.matchStatus === 'matched' && item.productId ? item.productId : '__unassigned__';
      const name = item.product?.name ?? 'Sin asignar';
      const code = item.product?.code ?? '';
      const qty = Number(item.quantity);
      const price = item.unitPrice != null ? Number(item.unitPrice) : null;
      const entry = map.get(key);
      if (entry) {
        entry.qty += qty;
        entry.docIds.add(doc.id);
        if (price && price > 0) { entry.priceSum += price; entry.priceCnt++; }
      } else {
        map.set(key, { code, name, qty, docIds: new Set([doc.id]), priceSum: price && price > 0 ? price : 0, priceCnt: price && price > 0 ? 1 : 0 });
      }
    });
  });

  const sorted = [...map.values()].sort((a, b) => b.qty - a.qty);
  sorted.forEach((e, i) => {
    const avg = e.priceCnt > 0 ? Math.round(e.priceSum / e.priceCnt * 100) / 100 : '';
    addZebraRow(ws, [e.code, e.name, Math.round(e.qty * 1000) / 1000, e.docIds.size, avg], i, cols.length);
  });
}

function buildSheet5(wb: ExcelJS.Workbook, docs: DocRow[]): void {
  const ws = wb.addWorksheet('Resumen por mes');
  const cols = [
    { header: 'Mes', key: 'mes', width: 12 },
    { header: 'Total', key: 'total', width: 10 },
    { header: 'Aprobados', key: 'aprobados', width: 12 },
    { header: 'En revisión', key: 'enRevision', width: 14 },
    { header: 'Rechazados', key: 'rechazados', width: 12 },
  ] as ExcelJS.Column[];
  ws.columns = cols;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  styleHeader(ws, cols.length);

  const map = new Map<string, { total: number; aprobados: number; enRevision: number; rechazados: number }>();
  docs.forEach((doc) => {
    const key = `${doc.date.getFullYear()}-${String(doc.date.getMonth() + 1).padStart(2, '0')}`;
    const e = map.get(key) ?? { total: 0, aprobados: 0, enRevision: 0, rechazados: 0 };
    e.total++;
    if (doc.status === 'approved') e.aprobados++;
    else if (doc.status === 'review_needed') e.enRevision++;
    else if (doc.status === 'rejected') e.rechazados++;
    map.set(key, e);
  });

  const sorted = [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  sorted.forEach(([mes, d], i) => {
    addZebraRow(ws, [mes, d.total, d.aprobados, d.enRevision, d.rechazados], i, cols.length);
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function exportToExcel(filters: ExportFilters): Promise<Buffer> {
  const docs = await fetchDocs(filters);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Mata Remitos';
  wb.created = new Date();
  buildSheet1(wb, docs);
  buildSheet2(wb, docs);
  buildSheet3(wb, docs);
  buildSheet4(wb, docs);
  buildSheet5(wb, docs);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function exportToCsv(filters: ExportFilters): Promise<string> {
  const docs = await fetchDocs(filters);
  const BOM = '﻿';
  const SEP = ';';
  const headers = ['Estado', 'Tipo', 'Fecha emisión', 'Proveedor', 'CUIT proveedor', 'Punto de venta', 'Número', 'Items', 'Confianza (%)', 'Aprobado por', 'Fecha aprobación'];
  const lines: string[] = [BOM + headers.map(csvEscape).join(SEP)];
  docs.forEach((doc) => {
    const d = sheet1Row(doc);
    lines.push([d.estado, d.tipo, d.fechaEmision, d.proveedor, d.cuitProveedor, d.ptoVenta, d.numero, String(d.items), formatDecimalAr(d.confianza), d.aprobadoPor, d.fechaAprobacion].map(csvEscape).join(SEP));
  });
  return lines.join('\r\n');
}
