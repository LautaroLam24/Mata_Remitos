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

async function tryRefresh(): Promise<string | null> {
  const session = authStore.get();
  if (!session?.refreshToken) return null;

  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    if (!res.ok) {
      authStore.clear();
      return null;
    }
    const data = (await res.json()) as { accessToken: string; refreshToken: string };
    authStore.set({ ...session, accessToken: data.accessToken, refreshToken: data.refreshToken });
    return data.accessToken;
  } catch {
    authStore.clear();
    return null;
  }
}

async function parseError(res: Response): Promise<ApiError> {
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
  return new ApiError(res.status, message, body);
}

async function request<T>(
  path: string,
  options: RequestInit & { skipAuth?: boolean } = {}
): Promise<T> {
  const { skipAuth, ...init } = options;

  const headers: Record<string, string> = {
    ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...(init.headers as Record<string, string>),
  };

  if (!skipAuth) {
    const token = authStore.getAccessToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  let res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  if (res.status === 401 && !skipAuth) {
    const newToken = await tryRefresh();
    if (newToken) {
      headers["Authorization"] = `Bearer ${newToken}`;
      res = await fetch(`${API_BASE}${path}`, { ...init, headers });
    }
  }

  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function uploadFile<T>(path: string, file: File): Promise<T> {
  let token = authStore.getAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const formData = new FormData();
  formData.append("file", file);

  let res = await fetch(`${API_BASE}${path}`, { method: "POST", headers, body: formData });

  if (res.status === 401) {
    const newToken = await tryRefresh();
    if (newToken) {
      headers["Authorization"] = `Bearer ${newToken}`;
      res = await fetch(`${API_BASE}${path}`, { method: "POST", headers, body: formData });
    }
  }

  if (!res.ok) throw await parseError(res);
  return res.json() as Promise<T>;
}

// ── Remitos types ────────────────────────────────────────────────────────────

export interface UploadResponse {
  jobId: string;
  imageKey: string;
  message: string;
}

export interface JobStatusResponse {
  status: "waiting" | "active" | "completed" | "failed" | "unknown";
  documentId?: string;
  error?: string;
}

export interface DocumentItem {
  id: string;
  tenantId: string;
  documentId: string;
  productId: string | null;
  rawDescription: string;
  quantity: number;
  unit: string;
  unitPrice: number | null;
  confidenceScore: number | null;
  matchScore: number | null;
  matchStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentDetail {
  id: string;
  tenantId: string;
  supplierId: string;
  supplierCuit: string;
  type: string;
  documentNumber: string;
  date: string;
  status: string;
  overallConfidence: number;
  warnings: string[];
  imageUrl: string;
  imageThumbnailUrl: string | null;
  uploadedById: string;
  approvedById: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: DocumentItem[];
}

export interface ApproveResponse {
  id: string;
  status: "approved";
  movementsCreated: number;
}

export interface RejectResponse {
  id: string;
  status: "rejected";
}

export interface ReviewQueueItem {
  id: string;
  tenantId: string;
  supplierId: string;
  supplierCuit: string;
  type: string;
  documentNumber: string;
  date: string;
  overallConfidence: number;
  warnings: string[];
  imageUrl: string;
  imageThumbnailUrl: string | null;
  createdAt: string;
}

export interface ReviewQueueResponse {
  items: ReviewQueueItem[];
  total: number;
  page: number;
  limit: number;
}

// ── Auth types ───────────────────────────────────────────────────────────────

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

  remitos: {
    upload: (file: File) =>
      uploadFile<UploadResponse>("/api/remitos/upload", file),

    getJobStatus: (jobId: string) =>
      request<JobStatusResponse>(`/api/remitos/jobs/${jobId}`),

    getDocument: (id: string) =>
      request<DocumentDetail>(`/api/remitos/${id}`),

    approve: (id: string) =>
      request<ApproveResponse>(`/api/remitos/${id}/approve`, { method: "POST" }),

    reject: (id: string, reason?: string) =>
      request<RejectResponse>(`/api/remitos/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ ...(reason ? { reason } : {}) }),
      }),

    getReviewQueue: (page = 1, limit = 20) =>
      request<ReviewQueueResponse>(`/api/remitos/review-queue?page=${page}&limit=${limit}`),
  },
};
