import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';

export const NOTIFICATION_SEND_QUEUE = 'notification.send';
export const DAILY_REPORT_QUEUE = 'daily.report';

export interface NotificationJobData {
  notificationId: string;
  tenantId: string;
  channel: 'email' | 'whatsapp';
  to: string;
  template: string;
  params: Record<string, unknown>;
  correlationId: string;
}

let _notificationQueue: Queue<NotificationJobData> | undefined;
let _dailyReportQueue: Queue<Record<string, never>> | undefined;

export async function getNotificationQueue(): Promise<Queue<NotificationJobData>> {
  if (!_notificationQueue) {
    const { redis } = await import('./redis.js');
    _notificationQueue = new Queue<NotificationJobData>(NOTIFICATION_SEND_QUEUE, {
      connection: redis as Redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    });
  }
  return _notificationQueue;
}

export async function getDailyReportQueue(): Promise<Queue<Record<string, never>>> {
  if (!_dailyReportQueue) {
    const { redis } = await import('./redis.js');
    _dailyReportQueue = new Queue<Record<string, never>>(DAILY_REPORT_QUEUE, {
      connection: redis as Redis,
      defaultJobOptions: {
        removeOnComplete: { count: 5 },
        removeOnFail: { count: 10 },
      },
    });
  }
  return _dailyReportQueue;
}
