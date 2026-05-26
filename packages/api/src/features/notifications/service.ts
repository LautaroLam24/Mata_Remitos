import type { Prisma } from '@prisma/client';
import { db } from '../../infrastructure/db.js';
import { getNotificationQueue } from '../../infrastructure/notification-queue.js';

export type NotificationTemplate =
  | 'document.processed'
  | 'document.approved'
  | 'document.rejected'
  | 'stock.low'
  | 'daily.report';

export interface EnqueueNotificationParams {
  tenantId: string;
  channel: 'email' | 'whatsapp';
  to: string;
  template: NotificationTemplate;
  params: Record<string, unknown>;
  correlationId: string;
}

export async function enqueueNotification(input: EnqueueNotificationParams): Promise<void> {
  const notification = await db.notification.upsert({
    where: { correlationId: input.correlationId },
    update: {},
    create: {
      tenantId: input.tenantId,
      correlationId: input.correlationId,
      channel: input.channel,
      template: input.template,
      to: input.to,
      params: input.params as Prisma.InputJsonValue,
      status: 'pending',
    },
    select: { id: true },
  });

  const queue = await getNotificationQueue();
  await queue.add(
    'send',
    {
      notificationId: notification.id,
      tenantId: input.tenantId,
      channel: input.channel,
      to: input.to,
      template: input.template,
      params: input.params,
      correlationId: input.correlationId,
    },
    { jobId: `notif-${input.correlationId}` },
  );
}

export async function getTenantOwnerEmails(tenantId: string): Promise<string[]> {
  const owners = await db.user.findMany({
    where: { tenantId, role: 'owner', deletedAt: null },
    select: { email: true },
  });
  return owners.map((o) => o.email);
}

export async function getUserEmail(userId: string): Promise<string | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  return user?.email ?? null;
}
