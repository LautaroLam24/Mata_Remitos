import { Worker } from 'bullmq';
import { redis } from '../infrastructure/redis.js';
import { db } from '../infrastructure/db.js';
import { sendEmail } from '../infrastructure/email/resend.js';
import { renderTemplate } from '../features/notifications/templates/index.js';
import {
  NOTIFICATION_SEND_QUEUE,
  type NotificationJobData,
} from '../infrastructure/notification-queue.js';

export function startNotificationWorker(): Worker<NotificationJobData> {
  const worker = new Worker<NotificationJobData>(
    NOTIFICATION_SEND_QUEUE,
    async (job) => {
      const { notificationId, channel, to, template, params } = job.data;

      const rendered = renderTemplate(template, params);
      let externalId: string | null = null;

      if (channel === 'email') {
        const result = await sendEmail({ to, ...rendered });
        externalId = result?.id ?? null;
      }
      // Future: add 'whatsapp' channel here

      await db.notification.update({
        where: { id: notificationId },
        data: { status: 'sent', externalId, sentAt: new Date() },
      });

      console.log(`[Notification] Sent ${template} via ${channel} to ${to}`);
    },
    { connection: redis, concurrency: 5 },
  );

  worker.on('failed', (job, err) => {
    console.error(`[Notification] Job ${job?.id} failed: ${err.message}`);
    if (job?.data.notificationId) {
      db.notification
        .update({
          where: { id: job.data.notificationId },
          data: { status: 'failed', error: err.message.slice(0, 500) },
        })
        .catch(() => {});
    }
  });

  return worker;
}
