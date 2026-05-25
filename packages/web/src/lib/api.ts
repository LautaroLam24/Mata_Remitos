import { authStore } from "./auth-store";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { skipAuth?: boolean } = {}
): Promise<T> {
  const { skipAuth, ...init } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };

  if (!skipAuth) {
    const token = authStore.getAccessToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    const message =
      typeof body === "object" && body !== null && "message" in body
        ? String((body as { message: unknown }).message)
        : `HTTP ${res.status}`;
    throw new ApiError(res.status, message, body);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; name: string; role: string };
  tenant: { id: string; slug: string; name: string };
}

export interface RegisterBody {
  tenantName: string;
  tenantSlug: string;
  ownerEmail: string;
  ownerName: string;
  ownerPassword: string;
  ownerPhone?: string;
}

export interface LoginBody {
  email: string;
  password: string;
}

export const api = {
  auth: {
    register: (body: RegisterBody) =>
      request<AuthResponse>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(body),
        skipAuth: true,
      }),

    login: (body: LoginBody) =>
      request<AuthResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(body),
        skipAuth: true,
      }),

    refresh: (refreshToken: string) =>
      request<{ accessToken: string; refreshToken: string }>("/api/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
        skipAuth: true,
      }),
  },
};
