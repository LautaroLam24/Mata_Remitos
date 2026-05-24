import { z } from 'zod';

export const uploadResponseSchema = z.object({
  jobId: z.string(),
  imageKey: z.string(),
  message: z.string(),
});

export type UploadResponse = z.infer<typeof uploadResponseSchema>;
