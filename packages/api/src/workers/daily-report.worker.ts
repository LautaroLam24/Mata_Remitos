import { Worker } from 'bullmq';
import { redis } from '../infrastructure/redis.js';
import { getDailyReportQueue, DAILY_REPORT_QUEUE } from '../infrastructure/notification-queue.js';
import { db } from '../infrastructure/db.js';
import { enqueueNotification, getTenantOwnerEmails } from '../features/notifications/service.js';

async function generateDailyReports(): Promise<void> {
  const today = new Date();
  const startOfDay = new Date(today);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);

  const dateLabel = today.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const tenants = await db.tenant.findMany({
    select: { id: true, name: true },
  });

  for (const tenant of tenants) {
    const [processed, approved, rejected, pending, lowStockProducts] = await Promise.all([
      db.document.count({
        where: { tenantId: tenant.id, deletedAt: null, createdAt: { gte: startOfDay, lte: endOfDay } },
      }),
      db.document.count({
        where: { tenantId: tenant.id, deletedAt: null, status: 'approved', updatedAt: { gte: startOfDay, lte: endOfDay } },
      }),
      db.document.count({
        where: { tenantId: tenant.id, deletedAt: null, status: 'rejected', updatedAt: { gte: startOfDay, lte: endOfDay } },
      }),
      db.document.count({
        where: { tenantId: tenant.id, deletedAt: null, status: 'review_needed' },
      }),
      // Low stock: products where stockOnHand <= minStock
      db.$queryRaw<Array<{ id: string; name: string; code: string; stockOnHand: number; unit: string; minStock: number }>>`
        SELECT id, name, code, "stockOnHand", unit, "minStock"
        FROM products
        WHERE "tenantId" = ${tenant.id}
          AND "deletedAt" IS NULL
          AND "minStock" IS NOT NULL
          AND "stockOnHand" <= "minStock"
        ORDER BY "stockOnHand" ASC
        LIMIT 10
      `,
    ]);

    const ownerEmails = await getTenantOwnerEmails(tenant.id);
    if (ownerEmails.length === 0) continue;

    for (const email of ownerEmails) {
      await enqueueNotification({
        tenantId: tenant.id,
        channel: 'email',
        to: email,
        template: 'daily.report',
        params: {
          date: dateLabel,
          tenantName: tenant.name,
          remitosProcessed: processed,
          remitosApproved: approved,
          remitosRejected: rejected,
          remitosPending: pending,
          lowStockProducts,
        },
        correlationId: `daily-report-${tenant.id}-${today.toISOString().slice(0, 10)}-${email}`,
      });
    }

    console.log(`[DailyReport] Enqueued for tenant ${tenant.name} (${ownerEmails.length} recipient${ownerEmails.length !== 1 ? 's' : ''})`);
  }
}

export async function startDailyReportWorker(): Promise<Worker<Record<string, never>>> {
  const queue = await getDailyReportQueue();

  // Schedule a repeatable job at 08:00 UTC every day
  await queue.add(
    'generate',
    {},
    {
      repeat: { pattern: '0 8 * * *' },
      jobId: 'daily-report-cron',
    },
  );

  const worker = new Worker<Record<string, never>>(
    DAILY_REPORT_QUEUE,
    async () => {
      await generateDailyReports();
    },
    { connection: redis, concurrency: 1 },
  );

  worker.on('completed', () => {
    console.log('[DailyReport] Completed');
  });

  worker.on('failed', (job, err) => {
    console.error(`[DailyReport] Failed: ${err.message}`);
  });

  return worker;
}
