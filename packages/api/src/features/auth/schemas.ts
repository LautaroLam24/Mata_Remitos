import { z } from 'zod';

export const registerBodySchema = z.object({
  tenantName: z.string().min(2).max(100),
  tenantSlug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/),
  ownerEmail: z.string().min(5).max(255),
  ownerName: z.string().min(2).max(100),
  ownerPassword: z.string().min(8).max(72),
  ownerPhone: z.string().max(20).optional(),
});
export type RegisterBody = z.infer<typeof registerBodySchema>;

export const loginBodySchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});
export type LoginBody = z.infer<typeof loginBodySchema>;

export const refreshBodySchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshBody = z.infer<typeof refreshBodySchema>;

export const tokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

export const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: z.string(),
});

export const tenantSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
});

export const authResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: userSchema,
  tenant: tenantSchema,
});
