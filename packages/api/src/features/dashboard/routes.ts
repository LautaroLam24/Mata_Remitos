import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../../infrastructure/db.js';

const PERIOD_VALUES = ['7d', '30d', '3m', '6m', '12m'] as const;
type Period = (typeof PERIOD_VALUES)[number];

function getPeriodDates(period: Period) {
  const end = new Date();
  const start = new Date(end);
  switch (period) {
    case '7d':
      start.setDate(start.getDate() - 7);
      break;
    case '30d':
      start.setDate(start.getDate() - 30);
      break;
    case '3m':
      start.setMonth(start.getMonth() - 3);
      break;
    case '12m':
      start.setMonth(start.getMonth() - 12);
      break;
    default:
      start.setMonth(start.getMonth() - 6);
      break;
  }
  const duration = end.getTime() - start.getTime();
  const prevEnd = new Date(start);
  const prevStart = new Date(start.getTime() - duration);
  return { start, end, prevStart, prevEnd };
}

function variationPct(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function toYYYYMM(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function generateMonths(start: Date, end: Date): string[] {
  const months: string[] = [];
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  while (cur <= last) {
    months.push(toYYYYMM(cur));
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return months;
}

type RawSupplierRow = {
  supplierId: string;
  supplierName: string;
  documentCount: number;
  totalItems: number;
};

type RawProductRow = {
  productId: string;
  productName: string;
  totalQuantity: number;
  documentCount: number;
};

type RawLowStockRow = { id: string };

const alertSchema = z.object({
  type: z.enum(['info', 'warning', 'critical']),
  title: z.string(),
  description: z.string(),
  actionUrl: z.string().nullable(),
});

const metricsResponseSchema = z.object({
  period: z.string(),
  kpis: z.object({
    totalDocuments: z.object({
      value: z.number(),
      previousValue: z.number(),
      variationPct: z.number(),
    }),
    approvedDocuments: z.object({
      value: z.number(),
      previousValue: z.number(),
      variationPct: z.number(),
    }),
    timeSavedMinutes: z.object({
      value: z.number(),
      estimatedSavingsArs: z.number(),
    }),
    pendingReview: z.object({
      value: z.number(),
      olderThanWeekCount: z.number(),
    }),
  }),
  charts: z.object({
    documentsPerMonth: z.array(
      z.object({
        month: z.string(),
        approved: z.number(),
        rejected: z.number(),
        review: z.number(),
      }),
    ),
    topSuppliers: z.array(
      z.object({
        supplierId: z.string(),
        supplierName: z.string(),
        documentCount: z.number(),
        totalItems: z.number(),
      }),
    ),
    topProducts: z.array(
      z.object({
        productId: z.string(),
        productName: z.string(),
        totalQuantity: z.number(),
        documentCount: z.number(),
      }),
    ),
    documentTypeDistribution: z.array(
      z.object({
        type: z.string(),
        count: z.number(),
        percentage: z.number(),
      }),
    ),
  }),
  alerts: z.array(alertSchema),
  recentActivity: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      supplierName: z.string(),
      documentNumber: z.string(),
      status: z.string(),
      createdAt: z.string(),
    }),
  ),
});

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/metrics',
    {
      schema: {
        querystring: z.object({ period: z.enum(PERIOD_VALUES).default('6m') }),
        response: { 200: metricsResponseSchema },
      },
      preHandler: [app.authenticate, app.requireTenant],
    },
    async (req) => {
      const tenantId = req.tenant.id;
      const period = req.query.period;
      const { start, end, prevStart, prevEnd } = getPeriodDates(period);

      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const [
        totalCurrent,
        totalPrevious,
        approvedCurrent,
        approvedPrevious,
        pendingReview,
        oldPendingReview,
        docsInPeriod,
        typeGroups,
        recentDocs,
        lowStockRows,
        avgConfCurrent,
        avgConfPrevious,
        topSuppliersRaw,
        topProductsRaw,
      ] = await Promise.all([
        db.document.count({
          where: { tenantId, deletedAt: null, date: { gte: start, lte: end } },
        }),
        db.document.count({
          where: { tenantId, deletedAt: null, date: { gte: prevStart, lte: prevEnd } },
        }),
        db.document.count({
          where: { tenantId, deletedAt: null, status: 'approved', date: { gte: start, lte: end } },
        }),
        db.document.count({
          where: {
            tenantId,
            deletedAt: null,
            status: 'approved',
            date: { gte: prevStart, lte: prevEnd },
          },
        }),
        db.document.count({
          where: { tenantId, deletedAt: null, status: 'review_needed' },
        }),
        db.document.count({
          where: {
            tenantId,
            deletedAt: null,
            status: 'review_needed',
            createdAt: { lt: oneWeekAgo },
          },
        }),
        db.document.findMany({
          where: { tenantId, deletedAt: null, date: { gte: start, lte: end } },
          select: { date: true, status: true },
        }),
        db.document.groupBy({
          by: ['type'],
          where: { tenantId, deletedAt: null, date: { gte: start, lte: end } },
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
        }),
        db.document.findMany({
          where: { tenantId, deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 8,
          include: { supplier: { select: { name: true } } },
        }),
        db.$queryRaw<RawLowStockRow[]>`
          SELECT id FROM products
          WHERE "tenantId" = ${tenantId}
            AND "deletedAt" IS NULL
            AND "minStock" IS NOT NULL
            AND "stockOnHand" < "minStock"
        `,
        db.document.aggregate({
          where: {
            tenantId,
            deletedAt: null,
            date: { gte: start, lte: end },
            status: { notIn: ['processing'] },
          },
          _avg: { overallConfidence: true },
        }),
        db.document.aggregate({
          where: {
            tenantId,
            deletedAt: null,
            date: { gte: prevStart, lte: prevEnd },
            status: { notIn: ['processing'] },
          },
          _avg: { overallConfidence: true },
        }),
        db.$queryRaw<RawSupplierRow[]>`
          SELECT
            s.id              AS "supplierId",
            s.name            AS "supplierName",
            COUNT(DISTINCT d.id)::int       AS "documentCount",
            COALESCE(COUNT(di.id), 0)::int  AS "totalItems"
          FROM documents d
          JOIN suppliers s ON s.id = d."supplierId"
          LEFT JOIN document_items di
            ON di."documentId" = d.id AND di."deletedAt" IS NULL
          WHERE d."tenantId" = ${tenantId}
            AND d."deletedAt" IS NULL
            AND d.date >= ${start}
            AND d.date <= ${end}
          GROUP BY s.id, s.name
          ORDER BY COUNT(DISTINCT d.id) DESC
          LIMIT 10
        `,
        db.$queryRaw<RawProductRow[]>`
          SELECT
            p.id              AS "productId",
            p.name            AS "productName",
            CAST(SUM(di.quantity) AS float8)     AS "totalQuantity",
            COUNT(DISTINCT di."documentId")::int AS "documentCount"
          FROM document_items di
          JOIN documents d ON d.id = di."documentId"
          JOIN products p ON p.id = di."productId"
          WHERE d."tenantId" = ${tenantId}
            AND d."deletedAt" IS NULL
            AND d.date >= ${start}
            AND d.date <= ${end}
            AND di."matchStatus" = 'matched'
            AND di."productId" IS NOT NULL
          GROUP BY p.id, p.name
          ORDER BY SUM(di.quantity) DESC
          LIMIT 10
        `,
      ]);

      // ── documentsPerMonth chart ────────────────────────────────────────────
      const monthBuckets: Record<string, { approved: number; rejected: number; review: number }> =
        {};
      for (const m of generateMonths(start, end)) {
        monthBuckets[m] = { approved: 0, rejected: 0, review: 0 };
      }
      for (const doc of docsInPeriod) {
        const key = toYYYYMM(doc.date);
        if (!monthBuckets[key]) monthBuckets[key] = { approved: 0, rejected: 0, review: 0 };
        if (doc.status === 'approved') monthBuckets[key].approved++;
        else if (doc.status === 'rejected') monthBuckets[key].rejected++;
        else if (doc.status === 'review_needed') monthBuckets[key].review++;
      }
      const documentsPerMonth = Object.entries(monthBuckets)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, counts]) => ({ month, ...counts }));

      // ── documentTypeDistribution ───────────────────────────────────────────
      const total = typeGroups.reduce((s, g) => s + g._count.id, 0);
      const documentTypeDistribution = typeGroups.map((g) => ({
        type: g.type,
        count: g._count.id,
        percentage: total > 0 ? Math.round((g._count.id / total) * 100) : 0,
      }));

      // ── Alerts (dynamic, max 5, priority ordered) ──────────────────────────
      const alerts: z.infer<typeof alertSchema>[] = [];

      if (oldPendingReview > 0) {
        alerts.push({
          type: 'warning',
          title: 'Documentos pendientes hace más de una semana',
          description: `${oldPendingReview} ${oldPendingReview === 1 ? 'documento lleva' : 'documentos llevan'} más de 7 días sin resolver.`,
          actionUrl: '/remitos?status=review_needed',
        });
      }

      if (lowStockRows.length > 0) {
        alerts.push({
          type: 'critical',
          title: 'Productos bajo stock mínimo',
          description: `${lowStockRows.length} ${lowStockRows.length === 1 ? 'producto está' : 'productos están'} por debajo del stock mínimo configurado.`,
          actionUrl: '/stock',
        });
      }

      if (totalPrevious > 0 && variationPct(totalCurrent, totalPrevious) < -30) {
        alerts.push({
          type: 'warning',
          title: 'Caída en cantidad de remitos procesados',
          description: `Se procesaron ${Math.abs(variationPct(totalCurrent, totalPrevious))}% menos documentos que en el período anterior.`,
          actionUrl: null,
        });
      }

      const topSupplier = topSuppliersRaw[0];
      if (topSupplier && totalCurrent > 0) {
        const topCount = Number(topSupplier.documentCount);
        if (topCount / totalCurrent > 0.4) {
          alerts.push({
            type: 'info',
            title: 'Concentración alta en un proveedor',
            description: `${topSupplier.supplierName} representa el ${Math.round((topCount / totalCurrent) * 100)}% de los documentos del período.`,
            actionUrl: null,
          });
        }
      }

      const confCurrent = avgConfCurrent._avg.overallConfidence;
      const confPrevious = avgConfPrevious._avg.overallConfidence;
      if (confCurrent !== null && confPrevious !== null && confPrevious - confCurrent > 10) {
        alerts.push({
          type: 'warning',
          title: 'Baja en la confianza de extracción',
          description: `La precisión promedio del OCR bajó de ${Math.round(confPrevious)}% a ${Math.round(confCurrent)}% vs el período anterior.`,
          actionUrl: null,
        });
      }

      // ── timeSaved ──────────────────────────────────────────────────────────
      const timeSavedMinutes = approvedCurrent * 5;
      const estimatedSavingsArs = Math.round(timeSavedMinutes * (5000 / 60));

      return {
        period,
        kpis: {
          totalDocuments: {
            value: totalCurrent,
            previousValue: totalPrevious,
            variationPct: variationPct(totalCurrent, totalPrevious),
          },
          approvedDocuments: {
            value: approvedCurrent,
            previousValue: approvedPrevious,
            variationPct: variationPct(approvedCurrent, approvedPrevious),
          },
          timeSavedMinutes: {
            value: timeSavedMinutes,
            estimatedSavingsArs,
          },
          pendingReview: {
            value: pendingReview,
            olderThanWeekCount: oldPendingReview,
          },
        },
        charts: {
          documentsPerMonth,
          topSuppliers: topSuppliersRaw.map((r) => ({
            supplierId: r.supplierId,
            supplierName: r.supplierName,
            documentCount: Number(r.documentCount),
            totalItems: Number(r.totalItems),
          })),
          topProducts: topProductsRaw.map((r) => ({
            productId: r.productId,
            productName: r.productName,
            totalQuantity: Number(r.totalQuantity),
            documentCount: Number(r.documentCount),
          })),
          documentTypeDistribution,
        },
        alerts,
        recentActivity: recentDocs.map((d) => ({
          id: d.id,
          type: d.type,
          supplierName: d.supplier.name,
          documentNumber: d.documentNumber,
          status: d.status,
          createdAt: d.createdAt.toISOString(),
        })),
      };
    },
  );
};
